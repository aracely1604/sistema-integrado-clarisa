// controllers/VentaControl.js
//
// Control (capa C del MVC) de ventas. Conecta ventas con inventario SIN
// mezclar los controllers: lee los mismos modelos que usa inventario
// (LocalProductoModel + ProductoModel) pero la lógica de "vender" vive acá.
//
// Estructura en Firestore:
//   productos/{id}                       -> nombre, codigoBarra, unidadMedida...
//   locales/{local}/productos/{id}       -> stockActual, stockMinimo, precioVenta, activo
//   ventas/{idVenta}                     -> ÚNICO registro de ventas Y autoconsumos
//                                           (campo `tipo`: 'venta' | 'autoconsumo').
//
// Una receta vendida se guarda como UNA línea (id de la receta, nombre, precio, cantidad) y
// descuenta, en la misma transacción, cada ingrediente asignado en el local.
//
// Las ventas y los autoconsumos NO escriben en locales/{local}/movimientos,
// ni en historialStock, ni en autoconsumos: solo descuentan el stock del producto
// del local y guardan UN documento en `ventas`.

import {
  collection, doc, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { db } from '../firebase';
import { LocalProductoModel } from '../models/LocalProductoModel';
import { suscribirProductosGlobales } from './ProductoControl';
import { suscribirRecetasConEstadoLocal } from './RecetaLocalControl';
import { resolverRecetaVenta, consumoTotalPorProducto, lineaParaGuardar } from '../models/VentaModel';

const refProductoLocal = (localId, idProducto) =>
  doc(db, 'locales', localId, 'productos', idProducto);

// ─── Productos vendibles de un local (en vivo) ──────────────────────────────
// Cruza locales/{local}/productos con el nodo global "productos" y entrega
// objetos listos para el punto de venta:
//   { id, nombre, categoria, codigoBarra, unidadMedida,
//     precio, precioNormal, enOferta, stockActual, stockMinimo, usoReceta }
// `precio` es `oferta` cuando ofertaActiva es true (y oferta > 0); si no, `precioVenta`.
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
        // Si la oferta está activa (y tiene un precio válido) ese es el precio de venta;
        // si no, se usa el precio de venta normal.
        const enOferta = lp.ofertaActiva === true && lp.oferta > 0;
        return {
          id:           lp.idProducto,
          nombre:       g.nombre,
          categoria:    g.categoria,
          codigoBarra:  g.codigoBarra,
          unidadMedida: g.unidadMedida,
          precio:       enOferta ? lp.oferta : lp.precioVenta,
          precioNormal: lp.precioVenta,
          enOferta,
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

// ─── Recetas vendibles de un local (en vivo) ────────────────────────────────
// Entrega solo las recetas que este local tiene ASIGNADAS y ACTIVAS, listas para la caja:
//   { id, nombre, precio, imagenUrl,
//     ingredientes: [{ id, nombre, cantidad, unidadMedida, cantidadBase, idProducto }] }
// (`idProducto` es el producto del local asignado a ese ingrediente; '' si falta asignarlo).
// Se actualiza sola si cambia la receta, su asignación o su estado activo/inactivo.
export function suscribirRecetasVenta(localId, callback) {
  return suscribirRecetasConEstadoLocal(localId, (lista) => {
    callback(
      lista
        .map(resolverRecetaVenta)
        .filter(Boolean)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    );
  });
}

// ─── Descontar stock + guardar en `ventas` (ATÓMICO) ───────────────────────
// En una sola transacción de Firestore:
//   1. lee el stock actual de cada producto (dato fresco del servidor)
//   2. si alguno no alcanza, aborta TODO (no se guarda nada)
//   3. descuenta el stock del producto del local y guarda UN documento en `ventas`
//
// Si el mismo producto aparece en varias líneas las cantidades se suman antes de descontar.
// Si no alcanza el stock lanza un Error con `err.faltantes`:
//   [{ id, nombre, disponible, pedido }]
async function descontarStockYGuardarEnVentas(localId, documento, { tipo, mensajeSinStock }) {
  const lineas = documento.productos || [];

  // Consumo TOTAL por producto: se suma todo el carrito (productos y los ingredientes de cada
  // receta) y se descuenta de una sola vez, no línea por línea.
  const requeridos = consumoTotalPorProducto(lineas); // idProducto -> { nombre, pedido }

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
      const err = new Error(mensajeSinStock);
      err.faltantes = faltantes;
      throw err;
    }

    const ahora = new Date().toISOString();

    snaps.forEach((snap, i) => {
      const { pedido } = requeridos.get(ids[i]);
      const stockAnterior = Number(snap.data().stockActual) || 0;
      tx.update(refs[i], { stockActual: stockAnterior - pedido, actualizadoEn: ahora });
    });

    // Único registro: `ventas/{id}`. `tipo` distingue venta de autoconsumo.
    tx.set(doc(db, 'ventas', documento.id), {
      ...documento,
      productos: lineas.map(lineaParaGuardar),
      tipo,
      ...(tipo === 'autoconsumo' ? { metodoPago: 'Autoconsumo' } : {}),
    });
  });
}

// Registra una venta de cliente. `venta.productos` trae { id, nombre, precio, cantidad, ... }
// por línea. Las líneas a granel traen además esGranel + cantidadBase, y las de receta
// esReceta + ingredientes + ingredientesReceta (solo para descontar; no se guardan).
export function registrarVentaConStock(localId, venta) {
  return descontarStockYGuardarEnVentas(localId, venta, {
    tipo: 'venta',
    mensajeSinStock: 'Stock insuficiente',
  });
}

// Registra un autoconsumo del personal: mismo descuento de stock y mismo destino (`ventas`),
// con tipo 'autoconsumo'. Si el stock no alcanza para cualquiera de los productos,
// no se registra nada.
export function registrarAutoconsumoConStock(localId, registro) {
  return descontarStockYGuardarEnVentas(localId, registro, {
    tipo: 'autoconsumo',
    mensajeSinStock: 'Stock insuficiente para registrar el autoconsumo.',
  });
}