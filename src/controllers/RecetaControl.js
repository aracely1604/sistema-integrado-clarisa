// ─── Controller: Receta Global ─────────────────────────────────────────────
// Orquesta entre la Vista (DetalleModals.jsx) y Firestore. Acá vive tanto
// la lógica de negocio/validaciones (usando RecetaModel) como el acceso
// a Firestore, siguiendo el mismo patrón que ProveedorControl/ProductoControl.

import {
  collection, addDoc, getDocs, getDoc, doc,
  updateDoc, deleteDoc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  validarReceta, validarIngrediente, esRecetaValida,
  generarIdIngrediente, normalizarTexto,
} from '../models/RecetaModel';

const RECETAS_COLLECTION = 'recetas';

// ─── Lectura ────────────────────────────────────────────────────────────────
export async function obtenerRecetasGlobales() {
  const snapshot = await getDocs(query(collection(db, RECETAS_COLLECTION)));
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

export async function obtenerRecetaGlobalPorId(idReceta) {
  const ref = doc(db, RECETAS_COLLECTION, idReceta);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── Preparación de datos ───────────────────────────────────────────────────
// Le asigna id a cada ingrediente que todavía no lo tenga y limpia tipos
// (cantidad como número) antes de mandar a Firestore.
function prepararIngredientes(ingredientes) {
  return ingredientes.map(ing => ({
    id: ing.id || generarIdIngrediente(),
    nombre: ing.nombre.trim(),
    cantidad: Number(ing.cantidad),
    unidadMedida: ing.unidadMedida,
    equivalencia: ing.equivalencia.trim(),
  }));
}

// ─── Creación ────────────────────────────────────────────────────────────────
// datosFormulario: { nombre, ingredientes: [{ nombre, cantidad, unidadMedida, equivalencia }] }
export async function crearRecetaGlobal(datosFormulario) {
  const recetasExistentes = await obtenerRecetasGlobales();

  const errores = validarReceta(datosFormulario, recetasExistentes);
  if (!esRecetaValida(errores)) {
    const error = new Error('Datos de receta inválidos');
    error.errores = errores;
    throw error;
  }

  const payload = {
    nombre: datosFormulario.nombre.trim(),
    ingredientes: prepararIngredientes(datosFormulario.ingredientes),
  };

  const docRef = await addDoc(collection(db, RECETAS_COLLECTION), payload);
  return { id: docRef.id, ...payload };
}

// ─── Edición ─────────────────────────────────────────────────────────────────
export async function actualizarRecetaGlobal(idReceta, datosFormulario) {
  const recetasExistentes = await obtenerRecetasGlobales();

  const errores = validarReceta(datosFormulario, recetasExistentes, idReceta);
  if (!esRecetaValida(errores)) {
    const error = new Error('Datos de receta inválidos');
    error.errores = errores;
    throw error;
  }

  const payload = {
    nombre: datosFormulario.nombre.trim(),
    ingredientes: prepararIngredientes(datosFormulario.ingredientes),
  };

  const ref = doc(db, RECETAS_COLLECTION, idReceta);
  await updateDoc(ref, payload);
  return { id: idReceta, ...payload };
}

// ─── Eliminación ─────────────────────────────────────────────────────────────
export async function eliminarRecetaGlobal(idReceta) {
  const ref = doc(db, RECETAS_COLLECTION, idReceta);
  await deleteDoc(ref);
}

// ─── Validación en vivo de un ingrediente (para feedback inmediato en UI) ───
export function validarIngredienteFormulario(ingrediente) {
  return validarIngrediente(ingrediente);
}

// ─── Chequeo rápido de nombre repetido (para feedback mientras se escribe) ──
export function existeNombreReceta(nombre, recetasExistentes, idRecetaActual = null) {
  const nombreNormalizado = normalizarTexto(nombre);
  if (!nombreNormalizado) return false;
  return recetasExistentes.some(r =>
    r.id !== idRecetaActual && normalizarTexto(r.nombre) === nombreNormalizado
  );
}