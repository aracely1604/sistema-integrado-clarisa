// ─── Controller: Receta Global ─────────────────────────────────────────────
// Orquesta entre la Vista (DetalleModals.jsx) y Firestore. Acá vive tanto
// la lógica de negocio/validaciones (usando RecetaModel) como el acceso
// a Firestore, siguiendo el mismo patrón que ProveedorControl/ProductoControl.

import {
  collection, setDoc, getDocs, getDoc, doc,
  updateDoc, deleteDoc, query,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  validarReceta, validarIngrediente, esRecetaValida,
  generarIdIngrediente, normalizarTexto,
} from '../models/RecetaModel';

import { subirImagen, eliminarImagen, exigirImagenValida } from './ImagenControl';

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
    equivalencia: (ing.equivalencia ?? '').trim(), // opcional
  }));
}

// ─── Creación ────────────────────────────────────────────────────────────────
// datosFormulario: { nombre, ingredientes: [{ nombre, cantidad, unidadMedida, equivalencia }] }
// archivoImagen (opcional): File elegido en el formulario. Se sube a Storage
// y en Firestore se guardan imagenUrl + imagenPath junto a los datos.
export async function crearRecetaGlobal(datosFormulario, archivoImagen = null) {
  exigirImagenValida(archivoImagen);
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

  // Se reserva el id primero para poder usarlo en la ruta de Storage.
  const docRef = doc(collection(db, RECETAS_COLLECTION));

  let imagen = { imagenUrl: '', imagenPath: '' };
  if (archivoImagen) imagen = await subirImagen('recetas', docRef.id, archivoImagen);

  const completo = { ...payload, ...imagen };
  try {
    await setDoc(docRef, completo);
  } catch (err) {
    await eliminarImagen(imagen.imagenPath); // no dejar archivos huérfanos
    throw err;
  }
  return { id: docRef.id, ...completo };
}

// ─── Edición ─────────────────────────────────────────────────────────────────
// archivoImagen (opcional): si viene, reemplaza la imagen actual.
// imagenPathAnterior: ruta de la imagen vigente, para borrarla al terminar.
export async function actualizarRecetaGlobal(
  idReceta, datosFormulario, archivoImagen = null, imagenPathAnterior = '',
) {
  exigirImagenValida(archivoImagen);
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

  let nueva = null;
  if (archivoImagen) {
    nueva = await subirImagen('recetas', idReceta, archivoImagen);
    payload.imagenUrl  = nueva.imagenUrl;
    payload.imagenPath = nueva.imagenPath;
  }

  const ref = doc(db, RECETAS_COLLECTION, idReceta);
  try {
    await updateDoc(ref, payload);
  } catch (err) {
    await eliminarImagen(nueva?.imagenPath);
    throw err;
  }

  if (nueva) await eliminarImagen(imagenPathAnterior);
  return { id: idReceta, ...payload };
}

// ─── Eliminación ─────────────────────────────────────────────────────────────
// Si la receta tenía imagen, también se borra de Storage.
export async function eliminarRecetaGlobal(idReceta) {
  const ref = doc(db, RECETAS_COLLECTION, idReceta);
  const snap = await getDoc(ref);
  const imagenPath = snap.exists() ? snap.data().imagenPath : '';
  await deleteDoc(ref);
  await eliminarImagen(imagenPath);
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