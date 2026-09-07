// controllers/ProductoControl.js
//
// Control (capa C del MVC) del nodo global "productos". Sigue el mismo
// patrón que ProveedorControl: valida, arma el ProductoModel y habla con
// Firestore. Solo guarda datos base (nombre, categoría, código, unidad).
// El stock, precio de venta Y el estado activo/inactivo de cada producto
// se gestionan por local, en LocalProductoControl.js — registrar un
// producto acá NO lo asigna automáticamente a ningún local.

import {
  collection, doc, addDoc, updateDoc,
  getDocs, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ProductoModel } from '../models/ProductoModel';

const COLECCION = 'productos';

// ─── Validación ──────────────────────────────────────────────────────────────
function validarProducto({ nombre, categoria, codigoBarra, unidadMedida }) {
  const errores = {};
  if (!nombre || !nombre.trim()) errores.nombre = 'El nombre es obligatorio';
  if (!categoria) errores.categoria = 'Selecciona una categoría';
  if (!codigoBarra || !codigoBarra.trim()) errores.codigoBarra = 'El código de barras es obligatorio';
  if (!unidadMedida) errores.unidadMedida = 'Selecciona una unidad de medida';

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de producto inválidos');
    err.errores = errores;
    throw err;
  }
}

// ─── Buscar por código de barras ────────────────────────────────────────────
// Se usa ANTES de registrar: al leer/ingresar el código (pistola o manual),
// primero se verifica si el producto ya existe en el nodo global.
export async function obtenerProductoPorCodigoBarra(codigoBarra) {
  const codigo = (codigoBarra ?? '').trim();
  if (!codigo) return null;

  const q = query(collection(db, COLECCION), where('codigoBarra', '==', codigo));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return ProductoModel.fromFirebase(docSnap.id, docSnap.data());
}

// ─── Crear producto global ───────────────────────────────────────────────────
export async function crearProductoGlobal(form) {
  validarProducto(form);

  const existente = await obtenerProductoPorCodigoBarra(form.codigoBarra);
  if (existente) {
    const err = new Error('Ya existe un producto con ese código de barras');
    err.errores = { codigoBarra: 'Ya existe un producto con ese código de barras' };
    throw err;
  }

  const producto = new ProductoModel(form);
  const ref = await addDoc(collection(db, COLECCION), producto.toFirebase());
  return ProductoModel.fromFirebase(ref.id, producto.toFirebase());
}

// ─── Actualizar datos base de un producto global ────────────────────────────
export async function actualizarProductoGlobal(idProducto, cambios) {
  validarProducto(cambios);

  const ref = doc(db, COLECCION, idProducto);
  await updateDoc(ref, {
    nombre:        cambios.nombre.trim(),
    categoria:     cambios.categoria,
    codigoBarra:   cambios.codigoBarra.trim(),
    unidadMedida:  cambios.unidadMedida,
    actualizadoEn: new Date().toISOString(),
  });
}

// ─── Traer todos los productos globales de una vez (para "joins" puntuales,
// ej. cruzar con los productos de un local en RecetaLocalControl) ───────────
export async function obtenerProductosGlobales() {
  const snap = await getDocs(query(collection(db, COLECCION)));
  return snap.docs.map((d) => ProductoModel.fromFirebase(d.id, d.data()));
}

// ─── Suscripción en vivo a todos los productos globales ─────────────────────
export function suscribirProductosGlobales(callback) {
  const q = query(collection(db, COLECCION));
  const unsubscribe = onSnapshot(q, (snap) => {
    const productos = snap.docs.map((d) => ProductoModel.fromFirebase(d.id, d.data()));
    callback(productos);
  });
  return unsubscribe;
}