// controllers/CategoriaControl.js
//
// Lista de categorías de producto, guardada en Firestore como UN solo documento
// con un campo-arreglo:
//
//   configuracion/categorias  →  { lista: ['Abarrotes', 'Lácteos', ...], actualizadoEn }
//
// Vive FUERA de "locales" (las categorías son compartidas por los 3 locales, igual
// que el catálogo global de productos) y FUERA de la colección "productos" (si el
// documento estuviera ahí, suscribirProductosGlobales lo leería como si fuera un producto).
//
// La BASE DE DATOS es la única fuente de categorías. La lista base (CATEGORIAS de
// gestionProductosData) solo se usa para SEMBRAR el documento la primera vez que no existe
// o está vacío (mientras tanto se muestra para que la pantalla no quede sin opciones).
// Después, lo que se agrega o se quita en Firestore es exactamente lo que se ve.

import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';

const COLECCION = 'configuracion';
const DOC_ID = 'categorias';
const LARGO_MAX = 40;

const categoriasDocRef = () => doc(db, COLECCION, DOC_ID);

// "Panadería " y "panaderia" se consideran la misma categoría.
export function normalizarCategoria(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

// Quita espacios sobrantes y deja la primera letra en mayúscula.
export function formatearNombreCategoria(texto) {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Devuelve el mensaje de error, o '' si el nombre es válido.
export function validarNombreCategoria(texto) {
  const nombre = formatearNombreCategoria(texto);
  if (!nombre) return 'Escribe el nombre de la categoría';
  if (/\p{N}/u.test(nombre)) return 'La categoría no puede contener números';
  if (!/^\p{L}[\p{L}\s&.,'-]*$/u.test(nombre)) return 'Usa solo letras y espacios';
  if (nombre.length < 2) return 'El nombre es demasiado corto';
  if (nombre.length > LARGO_MAX) return `Máximo ${LARGO_MAX} caracteres`;
  return '';
}

// Une base + guardadas sin repetir (ignora mayúsculas y tildes).
export function combinarCategorias(base = [], guardadas = []) {
  const vistas = new Set();
  const resultado = [];
  for (const cat of [...base, ...guardadas]) {
    const clave = normalizarCategoria(cat);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push(cat);
  }
  return resultado;
}

function leerLista(snap) {
  const lista = snap.exists() ? snap.data()?.lista : null;
  return Array.isArray(lista) ? lista : [];
}

// Crea el documento con la lista base si todavía no existe (o está vacío).
async function sembrarCategorias(base) {
  if (!base.length) return;
  await runTransaction(db, async (tx) => {
    const ref = categoriasDocRef();
    const snap = await tx.get(ref);
    if (leerLista(snap).length > 0) return;
    tx.set(ref, { lista: combinarCategorias(base, []), actualizadoEn: new Date().toISOString() });
  });
}

// Suscripción en vivo a configuracion/categorias.
// `base` solo se usa como respaldo: si el documento no existe (se siembra) o si
// Firestore falla (ej. reglas de seguridad).
export function suscribirCategorias(callback, base = []) {
  return onSnapshot(
    categoriasDocRef(),
    (snap) => {
      const lista = leerLista(snap);
      if (lista.length > 0) { callback(lista); return; }
      callback(combinarCategorias(base, []));
      sembrarCategorias(base).catch(() => { /* sin permiso de escritura: se sigue mostrando la base */ });
    },
    () => callback(combinarCategorias(base, [])),
  );
}

// Agrega una categoría nueva y devuelve su nombre final. Si ya existía (aunque
// esté escrita distinto), no se duplica: devuelve la existente.
export async function agregarCategoria(nombre, base = []) {
  const error = validarNombreCategoria(nombre);
  if (error) {
    const err = new Error(error);
    err.errores = { categoria: error };
    throw err;
  }
  const limpio = formatearNombreCategoria(nombre);
  const clave = normalizarCategoria(limpio);

  return runTransaction(db, async (tx) => {
    const ref = categoriasDocRef();
    const snap = await tx.get(ref);
    const guardadas = leerLista(snap);
    const todas = combinarCategorias(guardadas.length > 0 ? guardadas : base, []);

    const existente = todas.find((c) => normalizarCategoria(c) === clave);
    if (existente) return existente;

    tx.set(ref, { lista: [...todas, limpio], actualizadoEn: new Date().toISOString() });
    return limpio;
  });
}