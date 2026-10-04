// controllers/LocalProductoControl.js
//
// Control (capa C del MVC) de los productos DENTRO de un local puntual:
// locales/{local}/productos/{idProducto}. Complementa a ProductoControl.js
// (nodo global, donde vive nombre/categoría/código/unidad): acá vive
// stock actual, stock mínimo, precio de venta y activo — todo POR LOCAL.
//
// El idProducto usado como id del documento es siempre el mismo id del
// producto en el nodo global, así ambos quedan enlazados 1 a 1.
//
// Este archivo también es responsable de historialStock (ver
// models/HistorialStockModel.js): cada movimiento de stock (reposición,
// transferencia, devolución) actualiza stockActual Y crea su registro de
// historial dentro de la MISMA transacción de Firestore, para que nunca
// quede uno sin el otro.

import {
  doc, getDoc, updateDoc, setDoc, query, onSnapshot,
  collection, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { productosColRef } from '../models/LocalModel';
import { LocalProductoModel } from '../models/LocalProductoModel';
import { HistorialStockModel, TIPOS_MOVIMIENTO_STOCK } from '../models/HistorialStockModel';

const HISTORIAL_STOCK_COLLECTION = 'historialStock';

function historialStockColRef() {
  return collection(db, HISTORIAL_STOCK_COLLECTION);
}

function esVacio(valor) {
  return valor === '' || valor === null || valor === undefined;
}

/** Acepta el objeto `usuario` completo (de useAuth()) o ya un uid en string. */
function extraerUsuarioId(usuario) {
  if (!usuario) return null;
  if (typeof usuario === 'string') return usuario;
  return usuario.uid ?? null;
}

// ─── Validación (producto por local: stock mínimo / precio de venta) ───────
function validarProductoLocal({ stockMinimo, precioVenta }) {
  const errores = {};

  const minimo = Number(stockMinimo);
  if (esVacio(stockMinimo) || Number.isNaN(minimo) || minimo < 0) {
    errores.stockMinimo = 'Ingresa un stock mínimo válido';
  }

  const precio = Number(precioVenta);
  if (esVacio(precioVenta) || Number.isNaN(precio) || precio <= 0) {
    errores.precioVenta = 'Ingresa un precio de venta válido';
  }

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de producto de local inválidos');
    err.errores = errores;
    throw err;
  }
}

// ─── Ver si un producto (global) ya está registrado en este local ──────────
export async function obtenerProductoLocal(local, idProducto) {
  if (!idProducto) return null;
  const ref = doc(productosColRef(local), idProducto);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return LocalProductoModel.fromFirebase(snap.id, snap.data());
}

// ─── Registrar un producto global dentro de este local ──────────────────────
// stockActual siempre arranca en 0; stockMinimo y precioVenta vienen del form.
// (Esto NO es un "movimiento de stock" — no genera historialStock.)
export async function crearProductoEnLocal(local, idProducto, form) {
  if (!idProducto) {
    const err = new Error('Falta seleccionar un producto del catálogo global');
    err.errores = { general: 'Selecciona o verifica un producto antes de guardar' };
    throw err;
  }

  validarProductoLocal(form);

  const existente = await obtenerProductoLocal(local, idProducto);
  if (existente) {
    const err = new Error('Este producto ya está registrado en este local');
    err.errores = { general: 'Este producto ya está registrado en este local' };
    throw err;
  }

  const producto = new LocalProductoModel({
    idProducto,
    stockActual: 0,
    stockMinimo: form.stockMinimo,
    precioVenta: form.precioVenta,
    activo: true,
  });

  const ref = doc(productosColRef(local), idProducto);
  await setDoc(ref, producto.toFirebase());
  return producto;
}

// ─── Actualizar stock mínimo / precio de venta de un producto en un local ───
export async function actualizarProductoLocal(local, idProducto, cambios) {
  validarProductoLocal(cambios);
  const ref = doc(productosColRef(local), idProducto);
  await updateDoc(ref, {
    stockMinimo:   Number(cambios.stockMinimo),
    precioVenta:   Number(cambios.precioVenta),
    actualizadoEn: new Date().toISOString(),
  });
}

// ─── Ajustar stock actual "a mano" (sin historial) ──────────────────────────
// Se deja disponible como utilidad de bajo nivel, pero los movimientos reales
// (reposición/transferencia/devolución) ya NO pasan por acá — usan las
// funciones transaccionales de más abajo para que stock + historial queden
// siempre sincronizados.
export async function ajustarStockLocal(local, idProducto, nuevoStockActual) {
  const ref = doc(productosColRef(local), idProducto);
  await updateDoc(ref, {
    stockActual:   Number(nuevoStockActual) || 0,
    actualizadoEn: new Date().toISOString(),
  });
}

// ─── Activar / desactivar producto en este local ────────────────────────────
export async function cambiarEstadoProductoLocal(local, idProducto, activo) {
  const ref = doc(productosColRef(local), idProducto);
  await updateDoc(ref, { activo, actualizadoEn: new Date().toISOString() });
}

// ─── Suscripción en vivo a todos los productos de un local ─────────────────
export function suscribirProductosLocal(local, callback) {
  const q = query(productosColRef(local));
  const unsubscribe = onSnapshot(q, (snap) => {
    const productos = snap.docs.map((d) => LocalProductoModel.fromFirebase(d.id, d.data()));
    callback(productos);
  });
  return unsubscribe;
}

// ═══════════════════════════════════════════════════════════════════════════
// Movimientos de stock (Reposición / Transferencia / Devolución)
// Cada uno corre en una única transacción de Firestore: lee stockActual,
// calcula stockNuevo, escribe el/los producto(s) del local Y el/los
// documento(s) de historialStock — todo o nada.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Transferir stock de un producto entre dos locales ──────────────────────
// Genera DOS registros de historial (salida en origen, entrada en destino),
// con el mismo valorUnitario/valorTotal en ambos para trazar el costo.
// El producto DEBE estar ya registrado en el local de destino — si no lo
// está, la transferencia se rechaza por completo (no se crea automáticamente).
export async function transferirProductoEntreLocales(idProducto, localOrigen, localDestino, cantidad, opciones = {}) {
  const { usuario = null, valorUnitario = null } = opciones;

  const cant = Number(cantidad);
  if (!cant || cant <= 0) {
    const err = new Error('Cantidad de transferencia inválida');
    err.errores = { general: 'Ingresa una cantidad válida' };
    throw err;
  }
  if (localOrigen === localDestino) {
    const err = new Error('El local de destino debe ser distinto al de origen');
    err.errores = { general: 'Selecciona un local de destino distinto' };
    throw err;
  }

  const origenRef = doc(productosColRef(localOrigen), idProducto);
  const destinoRef = doc(productosColRef(localDestino), idProducto);
  const usuarioId = extraerUsuarioId(usuario);
  const valorTotal = esVacio(valorUnitario) ? null : Number(valorUnitario) * cant;

  await runTransaction(db, async (tx) => {
    // ── Lecturas primero (regla de las transacciones de Firestore) ──
    const origenSnap = await tx.get(origenRef);
    if (!origenSnap.exists()) {
      const err = new Error('El producto no está registrado en el local de origen');
      err.errores = { general: 'El producto no está registrado en el local de origen' };
      throw err;
    }
    const datosOrigen = origenSnap.data();
    const stockAnteriorOrigen = Number(datosOrigen.stockActual) || 0;
    if (stockAnteriorOrigen < cant) {
      const err = new Error('Stock insuficiente para transferir');
      err.errores = { general: 'Stock insuficiente para la transferencia' };
      throw err;
    }

    const destinoSnap = await tx.get(destinoRef);
    if (!destinoSnap.exists()) {
      const err = new Error('El producto no está registrado en el local de destino');
      err.errores = { localDestino: 'El producto no está registrado en el local de destino. Regístralo ahí primero.' };
      throw err;
    }
    const stockAnteriorDestino = Number(destinoSnap.data().stockActual) || 0;

    const stockNuevoOrigen = stockAnteriorOrigen - cant;
    const stockNuevoDestino = stockAnteriorDestino + cant;
    const ahora = new Date().toISOString();

    // ── Escrituras: stock en ambos locales ──
    tx.update(origenRef, { stockActual: stockNuevoOrigen, actualizadoEn: ahora });
    tx.update(destinoRef, { stockActual: stockNuevoDestino, actualizadoEn: ahora });

    // ── Escrituras: los dos movimientos de historial ──
    const histSalida = new HistorialStockModel({
      fecha: serverTimestamp(),
      local: localOrigen,
      idProducto,
      tipoMovimiento: 'transferencia',
      cantidad: cant,
      stockAnterior: stockAnteriorOrigen,
      stockNuevo: stockNuevoOrigen,
      usuario: usuarioId,
      localRelacionado: localDestino,
      valorUnitario,
      valorTotal,
    });
    tx.set(doc(historialStockColRef()), histSalida.toFirebase());

    const histEntrada = new HistorialStockModel({
      fecha: serverTimestamp(),
      local: localDestino,
      idProducto,
      tipoMovimiento: 'transferencia',
      cantidad: cant,
      stockAnterior: stockAnteriorDestino,
      stockNuevo: stockNuevoDestino,
      usuario: usuarioId,
      localRelacionado: localOrigen,
      valorUnitario,
      valorTotal,
    });
    tx.set(doc(historialStockColRef()), histEntrada.toFirebase());
  });
}

// ─── Reposición / Devolución: un solo local, siempre suman al stock ─────────
async function ejecutarMovimientoLocalConHistorial({
  local, idProducto, cantidad, tipoMovimiento, usuario, idProveedor, valorUnitario, fechaVencimiento,
}) {
  const ref = doc(productosColRef(local), idProducto);
  const usuarioId = extraerUsuarioId(usuario);
  const valorTotal = esVacio(valorUnitario) ? null : Number(valorUnitario) * cantidad;
  let resultado;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      const err = new Error('El producto no está registrado en este local');
      err.errores = { general: 'El producto no está registrado en este local' };
      throw err;
    }

    const stockAnterior = Number(snap.data().stockActual) || 0;
    const stockNuevo = stockAnterior + cantidad; // reposición y devolución siempre suman

    tx.update(ref, { stockActual: stockNuevo, actualizadoEn: new Date().toISOString() });

    const historial = new HistorialStockModel({
      fecha: serverTimestamp(),
      local,
      idProducto,
      tipoMovimiento,
      cantidad,
      stockAnterior,
      stockNuevo,
      usuario: usuarioId,
      idProveedor: idProveedor ?? null,
      valorUnitario,
      valorTotal,
      fechaVencimiento: fechaVencimiento ?? null,
    });
    tx.set(doc(historialStockColRef()), historial.toFirebase());

    resultado = { stockAnterior, stockNuevo };
  });

  return resultado;
}

function validarMovimientoStock({ tipoMovimiento, cantidad, proveedorId, fechaVencimiento, localDestino, valorUnitario, local }) {
  const errores = {};

  if (!TIPOS_MOVIMIENTO_STOCK.includes(tipoMovimiento)) {
    errores.tipoMovimiento = 'Selecciona un tipo de movimiento válido';
  }

  const cant = Number(cantidad);
  if (esVacio(cantidad) || Number.isNaN(cant) || cant <= 0) {
    errores.cantidad = 'Ingresa una cantidad válida (mayor que 0)';
  }

  if (tipoMovimiento === 'reposicion') {
    if (!proveedorId) errores.proveedorId = 'Selecciona un proveedor';
    if (!fechaVencimiento) errores.fechaVencimiento = 'La fecha de vencimiento es obligatoria';
    if (esVacio(valorUnitario) || Number.isNaN(Number(valorUnitario)) || Number(valorUnitario) <= 0) {
      errores.valorUnitario = 'No se pudo calcular el costo unitario — revisa la cantidad y el costo total';
    }
  }

  if (tipoMovimiento === 'transferencia') {
    if (!localDestino) errores.localDestino = 'Selecciona un local de destino';
    else if (localDestino === local) errores.localDestino = 'El local de destino debe ser distinto al local actual';
    if (esVacio(valorUnitario) || Number.isNaN(Number(valorUnitario)) || Number(valorUnitario) <= 0) {
      errores.valorUnitario = 'No se pudo calcular el costo unitario — revisa la cantidad y el costo total';
    }
  }

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de movimiento de stock inválidos');
    err.errores = errores;
    throw err;
  }
}

/**
 * Registra un movimiento de stock para un producto DENTRO de un local, y
 * crea automáticamente su registro en historialStock — ambas cosas dentro
 * de la misma transacción de Firestore (o dos transacciones, en el caso de
 * transferencia, una por cada... no: una sola transacción con ambos locales).
 *
 * El componente solo entrega lo que ya resolvió: idProducto (vía código de
 * barras → catálogo global), local (sesión/contexto) y usuario (objeto de
 * useAuth()) — acá NO se piden esos datos, se asumen ya resueltos.
 *
 * @param {object} datos
 * @param {string} datos.local
 * @param {string} datos.idProducto
 * @param {'reposicion'|'transferencia'|'devolucion'} datos.tipoMovimiento
 * @param {number|string} datos.cantidad
 * @param {string} [datos.proveedorId]      - obligatorio si tipoMovimiento === 'reposicion'
 * @param {string} [datos.fechaVencimiento] - obligatorio si tipoMovimiento === 'reposicion'
 * @param {string} [datos.localDestino]     - obligatorio si tipoMovimiento === 'transferencia'
 * @param {number|string} [datos.valorUnitario] - obligatorio en reposición y transferencia
 * @param {object} [datos.usuario]          - usuario autenticado (objeto de useAuth())
 * @returns {Promise<{stockAnterior: number, stockNuevo: number}|void>}
 */
export async function registrarMovimientoStock(datos) {
  const {
    local, idProducto, tipoMovimiento, cantidad,
    proveedorId, fechaVencimiento, localDestino, valorUnitario, usuario,
  } = datos;

  validarMovimientoStock(datos);

  const cant = Number(cantidad);

  if (tipoMovimiento === 'transferencia') {
    return transferirProductoEntreLocales(idProducto, local, localDestino, cant, { usuario, valorUnitario });
  }

  return ejecutarMovimientoLocalConHistorial({
    local,
    idProducto,
    cantidad: cant,
    tipoMovimiento,
    usuario,
    idProveedor: tipoMovimiento === 'reposicion' ? proveedorId : null,
    valorUnitario: tipoMovimiento === 'reposicion' ? valorUnitario : null,
    fechaVencimiento: tipoMovimiento === 'reposicion' ? fechaVencimiento : null,
  });
}