// controllers/VentaControl.js
//
// Control (capa C del MVC) de ventas. Conecta ventas con inventario SIN
// mezclar los controllers: lee los mismos modelos que usa inventario
// (LocalProductoModel + ProductoModel) pero la lógica de "vender" vive acá.
//
// Estructura en Firestore:
//   productos/{id}                       -> nombre, codigoBarra, unidadMedida...
//   locales/{local}/productos/{id}       -> stockActual, stockMinimo, precioVenta, activo
//   locales/{local}/movimientos/{auto}   -> historial de movimientos de stock
//   ventas/{idVenta}                     -> la venta

import {
  collection, doc, onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LocalProductoModel } from '../models/LocalProductoModel';
import { suscribirProductosGlobales } from './ProductoControl';

const refProductoLocal = (localId, idProducto) =>
  doc(db, 'locales', localId, 'productos', idProducto);

// Cuánto stock descuenta una línea de venta, en la unidad en que se guarda el stock.
//  - Productos unitarios: `cantidad` (unidades).
//  - Productos a granel (esGranel): `cantidadBase`, que ya viene en g/ml (el stock de
//    estos productos se guarda en gramos/mililitros; `cantidad` en esas líneas va en kg/lt).
const cantidadADescontar = (linea) => (
  linea.esGranel ? Number(linea.cantidadBase) || 0 : (Number(linea.cantidad) || 1)
);

// ─── Productos vendibles de un local (en vivo) ──────────────────────────────
// Cruza locales/{local}/productos con el nodo global "productos" y entrega
// objetos listos para el punto de venta:
//   { id, nombre, categoria, codigoBarra, unidadMedida,
//     precio, stockActual, stockMinimo, usoReceta }
// Solo incluye los productos ACTIVOS en ese local. Como es en vivo, el stock
// que ve el cajero se actualiza solo cuando alguien vende o ajusta inventario.
export function suscribirProductosVenta(localId, callback) {
  let delLocal = [];
  let globales = new Map();

  const emitir = () => {
    const lista = delLocal
      .filter((lp) => lp.activo && globales.has(lp.idProducto))
      .map((lp) => {
        const g = globales.get(lp.idProducto);
        return {
          id:           lp.idProducto,
          nombre:       g.nombre,
          categoria:    g.categoria,
          codigoBarra:  g.codigoBarra,
          unidadMedida: g.unidadMedida,
          precio:       lp.precioVenta,
          stockActual:  lp.stockActual,
          stockMinimo:  lp.stockMinimo,
          usoReceta:    lp.usoReceta,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    callback(lista);
  };

  const unsubLocal = onSnapshot(
    collection(db, 'locales', localId, 'productos'),
    (snap) => {
      delLocal = snap.docs.map((d) => LocalProductoModel.fromFirebase(d.id, d.data()));
      emitir();
    },
  );

  const unsubGlobal = suscribirProductosGlobales((lista) => {
    globales = new Map(lista.map((p) => [p.id, p]));
    emitir();
  });

  return () => { unsubLocal(); unsubGlobal(); };
}

// ─── Registrar venta + descontar stock (ATÓMICO) ────────────────────────────
// En una sola transacción de Firestore:
//   1. lee el stock actual de cada producto vendido (dato fresco del servidor)
//   2. si alguno no alcanza, aborta TODO (no se guarda nada)
//   3. descuenta el stock, registra los movimientos y guarda la venta
//
// `venta.productos` debe traer { id, nombre, cantidad, ... } por línea.
// Si el mismo producto aparece en varias líneas (ej. comida rápida con
// distintos ingredientes) las cantidades se suman antes de descontar.
//
// Si no alcanza el stock lanza un Error con `err.faltantes`:
//   [{ id, nombre, disponible, pedido }]
export async function registrarVentaConStock(localId, venta) {
  const requeridos = new Map(); // idProducto -> { nombre, pedido }
  for (const linea of venta.productos) {
    if (!linea.id) throw new Error(`El producto "${linea.nombre}" no tiene id.`);
    const previo = requeridos.get(linea.id);
    requeridos.set(linea.id, {
      nombre: linea.nombre,
      pedido: (previo?.pedido ?? 0) + cantidadADescontar(linea),
    });
  }

  await runTransaction(db, async (tx) => {
    const ids   = [...requeridos.keys()];
    const refs  = ids.map((id) => refProductoLocal(localId, id));
    // En Firestore todas las lecturas van ANTES de cualquier escritura.
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

    const faltantes = [];
    snaps.forEach((snap, i) => {
      const { nombre, pedido } = requeridos.get(ids[i]);
      const disponible = snap.exists() ? Number(snap.data().stockActual) || 0 : 0;
      if (disponible < pedido) faltantes.push({ id: ids[i], nombre, disponible, pedido });
    });

    if (faltantes.length > 0) {
      const err = new Error('Stock insuficiente');
      err.faltantes = faltantes;
      throw err;
    }

    const ahora = new Date().toISOString();

    snaps.forEach((snap, i) => {
      const id = ids[i];
      const { pedido } = requeridos.get(id);
      const stockAnterior = Number(snap.data().stockActual) || 0;
      const stockNuevo    = stockAnterior - pedido;

      tx.update(refs[i], { stockActual: stockNuevo, actualizadoEn: ahora });

      tx.set(doc(collection(db, 'locales', localId, 'movimientos')), {
        idProducto:    id,
        tipo:          'venta',
        cantidad:      -pedido,
        stockAnterior,
        stockNuevo,
        idVenta:       venta.id,
        usuario:       venta.usuario ?? null,
        fecha:         ahora,
      });
    });

    tx.set(doc(db, 'ventas', venta.id), venta);
  });
}

// Guarda un autoconsumo y descuenta sus productos en una sola transacción.
// Si el stock no alcanza para cualquiera de ellos, no se registra nada.
export async function registrarAutoconsumoConStock(localId, registro) {
  const requeridos = new Map();
  for (const linea of registro.productos || []) {
    if (!linea.id) throw new Error(`El producto "${linea.nombre}" no tiene id.`);
    const previo = requeridos.get(linea.id);
    requeridos.set(linea.id, {
      nombre: linea.nombre,
      pedido: (previo?.pedido ?? 0) + cantidadADescontar(linea),
    });
  }

  await runTransaction(db, async (tx) => {
    const ids = [...requeridos.keys()];
    const refs = ids.map((id) => refProductoLocal(localId, id));
    const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
    const faltantes = [];

    snaps.forEach((snap, index) => {
      const { nombre, pedido } = requeridos.get(ids[index]);
      const disponible = snap.exists() ? Number(snap.data().stockActual) || 0 : 0;
      if (disponible < pedido) faltantes.push({ id: ids[index], nombre, disponible, pedido });
    });

    if (faltantes.length) {
      const error = new Error('Stock insuficiente para registrar el autoconsumo.');
      error.faltantes = faltantes;
      throw error;
    }

    const fecha = new Date().toISOString();
    snaps.forEach((snap, index) => {
      const idProducto = ids[index];
      const { pedido } = requeridos.get(idProducto);
      const stockAnterior = Number(snap.data().stockActual) || 0;
      const stockNuevo = stockAnterior - pedido;
      tx.update(refs[index], { stockActual: stockNuevo, actualizadoEn: fecha });
      tx.set(doc(collection(db, 'historialStock')), {
        fecha: serverTimestamp(),
        local: localId,
        idProducto,
        tipoMovimiento: 'autoconsumo',
        cantidad: -pedido,
        stockAnterior,
        stockNuevo,
        usuario: registro.trabajadorId ?? null,
        idProveedor: null,
        localRelacionado: null,
        valorUnitario: null,
        valorTotal: null,
        fechaVencimiento: null,
      });
    });

    tx.set(doc(db, 'autoconsumos', registro.id), registro);
    tx.set(doc(db, 'ventas', registro.id), { ...registro, tipo: 'autoconsumo', metodoPago: 'Autoconsumo' });
  });
}