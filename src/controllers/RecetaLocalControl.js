// ─── Controller: Asignación de recetas por local ────────────────────────────
// Orquesta entre la Vista (GestionRecetasModal) y Firestore. Cruza las
// recetas globales (RecetaControl) con las asignaciones que cada local haya
// guardado en su propia subcolección `recetas` (definida en LocalModel.js).

import { getDoc, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { recetasColRef, productosColRef } from '../models/LocalModel';
import { obtenerRecetasGlobales } from './RecetaControl';
import { obtenerProductosGlobales } from './ProductoControl';
import { validarAsignacion, esAsignacionValida } from '../models/RecetaLocalModel';

// ─── Productos del local ────────────────────────────────────────────────────
// El documento en locales/{local}/productos SOLO tiene stockActual, stockMinimo,
// precioVenta y activo (ver LocalProductoModel) — el nombre, categoría, código
// y unidad de medida viven en el nodo GLOBAL (mismo id). Acá se cruzan ambos
// para devolver un producto "completo" que el resto de la UI pueda usar.
export async function obtenerProductosLocal(local) {
  const [snapshotLocal, globales] = await Promise.all([
    getDocs(productosColRef(local)),
    obtenerProductosGlobales(),
  ]);

  const globalesPorId = new Map(globales.map((p) => [p.id, p]));

  return snapshotLocal.docs.map((d) => {
    const datosLocal = d.data();
    const global = globalesPorId.get(d.id);
    return {
      id: d.id,
      nombre: global?.nombre ?? 'Producto sin datos en catálogo global',
      categoria: global?.categoria ?? '',
      unidadMedida: global?.unidadMedida ?? 'unidad',
      codigoBarra: global?.codigoBarra ?? '',
      stockActual: datosLocal.stockActual ?? 0,
      stockMinimo: datosLocal.stockMinimo ?? 0,
      precioVenta: datosLocal.precioVenta ?? 0,
      activo: datosLocal.activo ?? true,
    };
  });
}

// ─── Recetas globales + su estado de asignación en este local ──────────────
// idRecetaGlobal se usa como id del documento en locales/{local}/recetas,
// así que basta con cruzar por id: si existe, ya está asignada acá.
export async function obtenerRecetasConEstadoLocal(local) {
  const [recetasGlobales, snapshotLocal] = await Promise.all([
    obtenerRecetasGlobales(),
    getDocs(recetasColRef(local)),
  ]);

  const asignacionesPorId = new Map(
    snapshotLocal.docs.map(d => [d.id, { id: d.id, ...d.data() }])
  );

  return recetasGlobales.map(receta => ({
    receta,
    asignacion: asignacionesPorId.get(receta.id) ?? null,
  }));
}

export async function obtenerAsignacionLocal(local, idRecetaGlobal) {
  const ref = doc(recetasColRef(local), idRecetaGlobal);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ─── Guardar / actualizar asignación ────────────────────────────────────────
// datosAsignacion: { idRecetaGlobal, precioVenta, activo, ingredientes: [{ idIngredienteGlobal, idProductoLocal }] }
export async function guardarAsignacionReceta(local, datosAsignacion) {
  const errores = validarAsignacion(datosAsignacion);
  if (!esAsignacionValida(errores)) {
    const error = new Error('Datos de asignación inválidos');
    error.errores = errores;
    throw error;
  }

  const payload = {
    idRecetaGlobal: datosAsignacion.idRecetaGlobal,
    precioVenta: Number(datosAsignacion.precioVenta),
    activo: Boolean(datosAsignacion.activo),
    ingredientes: datosAsignacion.ingredientes.map(ing => ({
      idIngredienteGlobal: ing.idIngredienteGlobal,
      idProductoLocal: ing.idProductoLocal,
    })),
  };

  // Doc id = idRecetaGlobal → upsert: si ya existía, la actualiza; si no, la crea.
  const ref = doc(recetasColRef(local), datosAsignacion.idRecetaGlobal);
  await setDoc(ref, payload, { merge: true });
  return { id: datosAsignacion.idRecetaGlobal, ...payload };
}

export async function toggleActivoRecetaLocal(local, idRecetaGlobal, activo) {
  const ref = doc(recetasColRef(local), idRecetaGlobal);
  await updateDoc(ref, { activo });
}