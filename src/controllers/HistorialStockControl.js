// controllers/HistorialStockControl.js
//
// Consulta de historialStock para MOSTRARLO en la UI (panel de detalle de
// un producto, botón "Transferir a otro local"). No crea movimientos —
// eso lo sigue haciendo LocalProductoControl.js al confirmar una operación.
//
// Acá se enriquece cada movimiento con datos legibles para la persona que
// lo lee: nombre + empresa del proveedor (en vez de idProveedor) y nombre
// del usuario (en vez de su uid). El código de barras del producto NO se
// repite por movimiento — la vista ya lo tiene desde el producto seleccionado,
// porque todo el historial que se pide acá es siempre del MISMO producto.

import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { HistorialStockModel } from '../models/HistorialStockModel';
import { proveedorGlobalDocRef } from '../models/LocalModel';

const HISTORIAL_STOCK_COLLECTION = 'historialStock';
const USUARIOS_COLLECTION = 'usuarios';

// Caches simples en memoria: un mismo proveedor o usuario suele repetirse
// en varios movimientos del historial, no tiene sentido re-leerlo cada vez.
const cacheProveedores = new Map();
const cacheUsuarios = new Map();

async function obtenerDatosProveedor(idProveedor) {
  if (!idProveedor) return null;
  if (cacheProveedores.has(idProveedor)) return cacheProveedores.get(idProveedor);

  const snap = await getDoc(proveedorGlobalDocRef(idProveedor));
  const resultado = snap.exists()
    ? { nombre: snap.data().nombre ?? '', empresa: snap.data().empresa ?? '' }
    : null;

  cacheProveedores.set(idProveedor, resultado);
  return resultado;
}

async function obtenerNombreUsuario(uid) {
  if (!uid) return null;
  if (cacheUsuarios.has(uid)) return cacheUsuarios.get(uid);

  const snap = await getDoc(doc(db, USUARIOS_COLLECTION, uid));
  const nombre = snap.exists() ? (snap.data().nombre ?? null) : null;

  cacheUsuarios.set(uid, nombre);
  return nombre;
}

async function enriquecerMovimiento(movimiento) {
  const [proveedor, usuarioNombre] = await Promise.all([
    obtenerDatosProveedor(movimiento.idProveedor),
    obtenerNombreUsuario(movimiento.usuario),
  ]);

  return {
    ...movimiento,
    proveedorNombre: proveedor?.nombre ?? null,
    proveedorEmpresa: proveedor?.empresa ?? null,
    usuarioNombre,
  };
}

/**
 * Suscripción en vivo al historial de UN producto DENTRO de UN local,
 * del movimiento más reciente al más antiguo. El callback recibe cada
 * movimiento ya enriquecido (proveedorNombre/proveedorEmpresa/usuarioNombre).
 *
 * ⚠️ Esta consulta combina 2 igualdades (local, idProducto) + un orderBy
 * (fecha) — Firestore va a pedir un índice compuesto la primera vez que
 * corra. La consola del navegador muestra un link directo para crearlo en
 * un clic (o créalo a mano: local Asc, idProducto Asc, fecha Desc).
 *
 * @param {string} local
 * @param {string} idProducto
 * @param {(movimientos: object[]) => void} callback
 * @returns {function} para cancelar la suscripción
 */
export function suscribirHistorialProductoLocal(local, idProducto, callback) {
  if (!local || !idProducto) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, HISTORIAL_STOCK_COLLECTION),
    where('local', '==', local),
    where('idProducto', '==', idProducto),
    orderBy('fecha', 'desc'),
  );

  const unsubscribe = onSnapshot(q, async (snap) => {
    const base = snap.docs.map((d) => HistorialStockModel.fromFirebase(d.id, d.data()));
    const enriquecidos = await Promise.all(base.map(enriquecerMovimiento));
    callback(enriquecidos);
  });

  return unsubscribe;
}