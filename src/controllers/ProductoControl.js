// controllers/ProductoControl.js
//
// Control (capa C del MVC) del nodo global "productos". Sigue el mismo
// patrón que ProveedorControl: valida, arma el ProductoModel y habla con
// Firestore. Solo guarda datos base (nombre, categoría, código, unidad).
// El stock, precio de venta Y el estado activo/inactivo de cada producto
// se gestionan por local, en LocalProductoControl.js — registrar un
// producto acá NO lo asigna automáticamente a ningún local.

import {
  collection, doc, setDoc, updateDoc,
  getDocs, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ProductoModel } from '../models/ProductoModel';
import { subirImagen, eliminarImagen, exigirImagenValida } from './ImagenControl';

const COLECCION = 'productos';

// ─── Validación ──────────────────────────────────────────────────────────────
// Nombre: solo letras y números (con espacios). Se permite el punto o la coma decimal
// entre dos números ("Coca Cola 2.5 lts"). No puede ser solo números ni llevar
// caracteres especiales. Devuelve el mensaje de error, o '' si el nombre es válido.

export function validarNombreProducto(nombre) {
  const n = String(nombre ?? '').trim();

  if (!n) return 'El nombre es obligatorio';

  // Permite letras, números, espacios y caracteres especiales específicos.
  const caracteresPermitidos = /^[\p{L}\p{N}\s'".,()\-\/°×%+]+$/u;

  if (!caracteresPermitidos.test(n)) {
    return 'El nombre contiene caracteres especiales no permitidos';
  }

  // Debe contener al menos una letra.
  if (!/\p{L}/u.test(n)) {
    return 'El nombre debe incluir letras: no puede ser solo números';
  }

  return '';
}


export function validarProducto({ nombre, categoria, codigoBarra, unidadMedida }) {
  const errores = {};
  const errorNombre = validarNombreProducto(nombre);
  if (errorNombre) errores.nombre = errorNombre;
  if (!categoria) errores.categoria = 'Selecciona una categoría';
  if (!codigoBarra || !codigoBarra.trim()) errores.codigoBarra = 'El código de barras es obligatorio';
  if (!unidadMedida) errores.unidadMedida = 'Selecciona una unidad de medida';

  if (Object.keys(errores).length > 0) {
    const err = new Error('Datos de producto inválidos');
    err.errores = errores;
    throw err;
  }
}

// ─── Variantes de un mismo código ───────────────────────────────────────────
// Hay lectores que omiten el último dígito (verificador) del EAN-13, así que un mismo
// producto puede estar guardado con 12 o con 13 dígitos. Para que "ya existe" no dependa de
// cómo se leyó el código, se busca por todas sus formas equivalentes:
//  · 12 dígitos  → el mismo, con su verificador EAN-13, y con un 0 delante (UPC-A)
//  · 13 dígitos  → el mismo, sin el verificador (si es válido) y sin el 0 inicial (UPC-A)
function digitoVerificadorEan13(doce) {
  let suma = 0;
  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

export function variantesCodigoBarra(codigo) {
  const c = String(codigo ?? '').trim();
  const variantes = new Set([c]);
  if (/^\d{12}$/.test(c)) {
    variantes.add(c + digitoVerificadorEan13(c));
    variantes.add(`0${c}`);
  } else if (/^\d{13}$/.test(c)) {
    if (digitoVerificadorEan13(c.slice(0, 12)) === Number(c[12])) variantes.add(c.slice(0, 12));
    if (c[0] === '0') variantes.add(c.slice(1));
  }
  return [...variantes];
}

// ─── Buscar por código de barras ────────────────────────────────────────────
// Se usa ANTES de registrar: al leer/ingresar el código (pistola o manual),
// primero se verifica si el producto ya existe en el nodo global.
// Considera las variantes del código (con/sin dígito verificador), ver arriba.
export async function obtenerProductoPorCodigoBarra(codigoBarra) {
  const codigo = (codigoBarra ?? '').trim();
  if (!codigo) return null;

  const variantes = variantesCodigoBarra(codigo);
  const q = variantes.length === 1
    ? query(collection(db, COLECCION), where('codigoBarra', '==', codigo))
    : query(collection(db, COLECCION), where('codigoBarra', 'in', variantes));
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0];
  return ProductoModel.fromFirebase(docSnap.id, docSnap.data());
}

// ─── Crear producto global ───────────────────────────────────────────────────
// archivoImagen (opcional): File elegido en el formulario. Se sube a Storage
// ANTES de escribir el documento; si Firestore falla, se borra la imagen
// para no dejar archivos huérfanos.
export async function crearProductoGlobal(form, archivoImagen = null) {
  validarProducto(form);
  exigirImagenValida(archivoImagen);

  const existente = await obtenerProductoPorCodigoBarra(form.codigoBarra);
  if (existente) {
    const err = new Error('Ya existe un producto con ese código de barras');
    err.errores = { codigoBarra: 'Ya existe un producto con ese código de barras' };
    throw err;
  }

  // Se reserva el id primero para poder usarlo en la ruta de Storage.
  const ref = doc(collection(db, COLECCION));

  let imagen = { imagenUrl: '', imagenPath: '' };
  if (archivoImagen) imagen = await subirImagen('productos', ref.id, archivoImagen);

  const producto = new ProductoModel({ ...form, ...imagen });
  try {
    await setDoc(ref, producto.toFirebase());
  } catch (err) {
    await eliminarImagen(imagen.imagenPath);
    throw err;
  }
  return ProductoModel.fromFirebase(ref.id, producto.toFirebase());
}

// ─── Actualizar datos base de un producto global ────────────────────────────
// archivoImagen (opcional): si viene, reemplaza la imagen actual.
// imagenPathAnterior: ruta de la imagen vigente, para borrarla de Storage
// una vez que la nueva quedó guardada.
export async function actualizarProductoGlobal(
  idProducto, cambios, archivoImagen = null, imagenPathAnterior = '',
) {
  validarProducto(cambios);
  exigirImagenValida(archivoImagen);

  const datos = {
    nombre:        cambios.nombre.trim(),
    categoria:     cambios.categoria,
    codigoBarra:   cambios.codigoBarra.trim(),
    unidadMedida:  cambios.unidadMedida,
    actualizadoEn: new Date().toISOString(),
  };

  let nueva = null;
  if (archivoImagen) {
    nueva = await subirImagen('productos', idProducto, archivoImagen);
    datos.imagenUrl  = nueva.imagenUrl;
    datos.imagenPath = nueva.imagenPath;
  }

  try {
    await updateDoc(doc(db, COLECCION, idProducto), datos);
  } catch (err) {
    await eliminarImagen(nueva?.imagenPath);
    throw err;
  }

  if (nueva) await eliminarImagen(imagenPathAnterior);
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