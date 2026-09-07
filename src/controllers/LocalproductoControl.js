// controllers/LocalProductoControl.js
//
// Control (capa C del MVC) de los productos DENTRO de un local puntual:
// locales/{local}/productos/{idProducto}. Complementa a ProductoControl.js
// (nodo global, donde vive nombre/categoría/código/unidad): acá vive
// stock actual, stock mínimo, precio de venta y activo — todo POR LOCAL.
//
// El idProducto usado como id del documento es siempre el mismo id del
// producto en el nodo global, así ambos quedan enlazados 1 a 1.

import { doc, getDoc, updateDoc, setDoc, query, onSnapshot } from 'firebase/firestore';
import { productosColRef } from '../models/LocalModel';
import { LocalProductoModel } from '../models/LocalProductoModel';

// ─── Validación ──────────────────────────────────────────────────────────────
function validarProductoLocal({ stockMinimo, precioVenta }) {
  const errores = {};

  const minimo = Number(stockMinimo);
  if (stockMinimo === '' || stockMinimo === null || stockMinimo === undefined || Number.isNaN(minimo) || minimo < 0) {
    errores.stockMinimo = 'Ingresa un stock mínimo válido';
  }

  const precio = Number(precioVenta);
  if (precioVenta === '' || precioVenta === null || precioVenta === undefined || Number.isNaN(precio) || precio <= 0) {
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

// ─── Ajustar stock actual (ingreso de mercadería, devolución, etc.) ─────────
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

// ─── Transferir stock de un producto entre dos locales ──────────────────────
// Descuenta del local origen y suma en el local destino. Si el producto
// todavía no existía en el destino, se crea heredando el mismo stock mínimo
// y precio de venta que tenía en el origen (se puede ajustar después).
export async function transferirProductoEntreLocales(idProducto, localOrigen, localDestino, cantidad) {
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

  const origen = await obtenerProductoLocal(localOrigen, idProducto);
  if (!origen || origen.stockActual < cant) {
    const err = new Error('Stock insuficiente para transferir');
    err.errores = { general: 'Stock insuficiente para la transferencia' };
    throw err;
  }

  const destino = await obtenerProductoLocal(localDestino, idProducto);

  await ajustarStockLocal(localOrigen, idProducto, origen.stockActual - cant);

  if (destino) {
    await ajustarStockLocal(localDestino, idProducto, destino.stockActual + cant);
  } else {
    const nuevo = new LocalProductoModel({
      idProducto,
      stockActual: cant,
      stockMinimo: origen.stockMinimo,
      precioVenta: origen.precioVenta,
      activo: true,
    });
    const ref = doc(productosColRef(localDestino), idProducto);
    await setDoc(ref, nuevo.toFirebase());
  }
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