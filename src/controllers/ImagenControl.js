// controllers/ImagenControl.js
//
// Utilidades de Firebase Storage para las imágenes de productos y recetas.
// Los controllers de producto/receta usan estas funciones para subir la
// imagen y luego guardan en Firestore SOLO la referencia (imagenUrl e
// imagenPath); el archivo en sí vive en Storage.
//
// Estructura en Storage:
//   productos/{idProducto}/{timestamp}.webp
//   recetas/{idReceta}/{timestamp}.webp
//
// - imagenUrl  → URL pública de descarga, lista para usar en <img src>.
// - imagenPath → ruta interna en Storage, necesaria para borrar/reemplazar.

import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

export const TIPOS_IMAGEN_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
export const TAMANO_MAX_MB = 5;
const LADO_MAX_PX = 512;       // resolución suficiente para un avatar y liviana para subir
const CALIDAD_WEBP = 0.76;

// ─── Validación (devuelve el mensaje de error o '' si está OK) ──────────────
export function validarImagen(file) {
  if (!file) return '';
  if (!TIPOS_IMAGEN_PERMITIDOS.includes(file.type)) {
    return 'Formato no válido. Usa JPG, PNG o WebP';
  }
  if (file.size > TAMANO_MAX_MB * 1024 * 1024) {
    return `La imagen supera los ${TAMANO_MAX_MB} MB`;
  }
  return '';
}

// Igual que validarImagen pero lanza el error con el formato { errores } que
// ya usan los controllers (la vista lo recoge en err.errores.imagen).
export function exigirImagenValida(file) {
  const mensaje = validarImagen(file);
  if (mensaje) {
    const err = new Error('Imagen inválida');
    err.errores = { imagen: mensaje };
    throw err;
  }
}

// ─── Redimensionado en el navegador ─────────────────────────────────────────
// Reduce el lado mayor a LADO_MAX_PX y convierte a WebP. Si algo falla
// (navegador antiguo, etc.) se sube el archivo original sin tocarlo.
async function optimizarImagen(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAX_PX / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', CALIDAD_WEBP));
    return blob && blob.type === 'image/webp' ? blob : file;
  } catch {
    return file;
  }
}

const EXTENSIONES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

// ─── Subir ──────────────────────────────────────────────────────────────────
// carpeta: 'productos' | 'recetas'.  idDoc: id del documento dueño de la imagen.
// Cada subida usa un nombre nuevo (timestamp) para que la URL cambie al
// reemplazar la imagen y no se quede cacheada la anterior.
export async function subirImagen(carpeta, idDoc, file, onProgress) {
  exigirImagenValida(file);
  const blob = await optimizarImagen(file);
  const extension = EXTENSIONES[blob.type] ?? 'jpg';
  const imagenPath = `${carpeta}/${idDoc}/${Date.now()}.${extension}`;
  const archivoRef = ref(storage, imagenPath);

  try {
    const subida = uploadBytesResumable(archivoRef, blob, { contentType: blob.type });
    await new Promise((resolve, reject) => {
      subida.on('state_changed', (snapshot) => {
        if (snapshot.totalBytes > 0) {
          onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }
      }, reject, resolve);
    });
    const imagenUrl = await getDownloadURL(archivoRef);
    return { imagenUrl, imagenPath };
  } catch (e) {
    const err = new Error('No se pudo subir la imagen');
    err.errores = { imagen: 'No se pudo subir la imagen. Intenta nuevamente.' };
    throw err;
  }
}

// ─── Eliminar ───────────────────────────────────────────────────────────────
// Nunca lanza: borrar una imagen vieja/huérfana no debe romper el guardado.
export async function eliminarImagen(imagenPath) {
  if (!imagenPath) return;
  try {
    await deleteObject(ref(storage, imagenPath));
  } catch (e) {
    if (e?.code !== 'storage/object-not-found') {
      console.warn('No se pudo eliminar la imagen de Storage:', imagenPath, e);
    }
  }
}
