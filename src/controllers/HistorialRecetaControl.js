// controllers/HistorialRecetaControl.js
//
// Historial de MODIFICACIONES de una receta dentro de UN local. Es el espejo de
// `suscribirModificacionesProducto` (HistorialStockControl.js), pero para recetas:
//
//   locales/{local}/recetas/{idReceta}/modificaciones/{auto-id}
//   { fecha, usuario, cambios: [ { campo, anterior, nuevo, ...extra } ] }
//
// Campos de `cambios` que se registran:
//   · { campo: 'precioVenta', anterior: 2500, nuevo: 3000 }
//   · { campo: 'ingrediente', idIngrediente, ingrediente: 'Papa',
//       idProductoAnterior, idProductoNuevo, anterior: 'Papa A', nuevo: 'Papa B',
//       stockAnterior, stockNuevo, unidadAnterior, unidadNueva }   // stock en unidad base (g/ml/uds)
//
// ⚠️ SUPUESTO: la ruta de la colección es locales/{local}/recetas/{idReceta}/modificaciones.
//    Si tus asignaciones de receta viven en otra colección, solo hay que cambiar
//    `modificacionesRecetaColRef` (idealmente moverla a models/LocalModel.js, donde
//    está `modificacionesProductoColRef`).

import { collection, query, orderBy, limit, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { guardarAsignacionReceta } from './RecetaLocalControl';
import { unidadBaseDesdeUnidadMedida } from '../models/UnidadesMedidaModel';

export function modificacionesRecetaColRef(local, idReceta) {
  return collection(db, 'locales', local, 'recetas', idReceta, 'modificaciones');
}

// ─── Nombre del usuario (cache en memoria, igual que en HistorialStockControl) ─
const cacheUsuarios = new Map();

async function obtenerNombreUsuario(uid) {
  if (!uid) return null;
  if (cacheUsuarios.has(uid)) return cacheUsuarios.get(uid);
  const snap = await getDoc(doc(db, 'usuarios', uid));
  const nombre = snap.exists() ? (snap.data().nombre ?? null) : null;
  cacheUsuarios.set(uid, nombre);
  return nombre;
}

// ─── Stock de un producto del local, tolerante a cómo venga el documento ───────
// Devuelve el stock en unidad BASE (g / ml / uds) y esa unidad. La unidad se interpreta con
// el mismo parser que usan los productos (UnidadesMedidaModel).
export function leerStockBase(producto) {
  if (!producto) return { stock: null, unidad: 'uds' };
  const stock = producto.stockActual ?? producto.stock ?? null;
  const unidad = unidadBaseDesdeUnidadMedida(producto.unidad ?? producto.unidadMedida);
  return { stock: stock === null ? null : Number(stock), unidad };
}

/**
 * Suscripción en vivo al historial de modificaciones de UNA receta en UN local,
 * de la más reciente a la más antigua. Cada elemento:
 *   { id, fecha, usuario, usuarioNombre, cambios: [...] }
 * Ordena por un solo campo, así que no pide índice compuesto.
 *
 * @param {string} local
 * @param {string} idReceta
 * @param {(modificaciones: object[]) => void} callback
 * @param {{limite?: number|null}} [opciones]
 * @returns {function} para cancelar la suscripción
 */
export function suscribirModificacionesReceta(local, idReceta, callback, opciones = {}) {
  if (!local || !idReceta) {
    callback([]);
    return () => {};
  }

  const restricciones = [orderBy('fecha', 'desc')];
  if (opciones.limite) restricciones.push(limit(opciones.limite));
  const q = query(modificacionesRecetaColRef(local, idReceta), ...restricciones);

  return onSnapshot(
    q,
    async (snap) => {
      const base = snap.docs.map((d) => {
        const data = d.data();
        return { id: d.id, ...data, cambios: Array.isArray(data.cambios) ? data.cambios : [] };
      });
      const conUsuario = await Promise.all(
        base.map(async (m) => ({ ...m, usuarioNombre: await obtenerNombreUsuario(m.usuario) })),
      );
      callback(conUsuario);
    },
    (error) => {
      console.error('[modificacionesReceta] Falló la consulta del historial:', error);
      callback([]);
    },
  );
}

/**
 * Compara la asignación guardada con la nueva y devuelve la lista de cambios
 * lista para guardar en el historial (sin `undefined`: Firestore no los acepta).
 */
export function calcularCambiosAsignacion({ receta, asignacionAnterior, asignacionNueva, productosLocal }) {
  const cambios = [];

  const precioAnterior = Number(asignacionAnterior.precioVenta);
  const precioNuevo = Number(asignacionNueva.precioVenta);
  if (precioAnterior !== precioNuevo) {
    cambios.push({ campo: 'precioVenta', anterior: precioAnterior, nuevo: precioNuevo });
  }

  receta.ingredientes.forEach((ing) => {
    const idAnterior = asignacionAnterior.ingredientes
      .find((a) => a.idIngredienteGlobal === ing.id)?.idProductoLocal ?? null;
    const idNuevo = asignacionNueva.ingredientes
      .find((a) => a.idIngredienteGlobal === ing.id)?.idProductoLocal ?? null;
    if (idAnterior === idNuevo) return;

    const prodAnterior = productosLocal.find((p) => p.id === idAnterior);
    const prodNuevo = productosLocal.find((p) => p.id === idNuevo);
    const sAnterior = leerStockBase(prodAnterior);
    const sNuevo = leerStockBase(prodNuevo);

    cambios.push({
      campo: 'ingrediente',
      idIngrediente: ing.id,
      ingrediente: ing.nombre,
      idProductoAnterior: idAnterior,
      idProductoNuevo: idNuevo,
      anterior: prodAnterior?.nombre ?? null,
      nuevo: prodNuevo?.nombre ?? null,
      // Stock que tenía cada producto EN EL MOMENTO del cambio
      stockAnterior: sAnterior.stock,
      stockNuevo: sNuevo.stock,
      unidadAnterior: sAnterior.unidad,
      unidadNueva: sNuevo.unidad,
    });
  });

  return cambios;
}

/**
 * Guarda los cambios de precio y/o de productos asignados a los ingredientes y
 * deja constancia en el historial de modificaciones de la receta.
 *
 * Reutiliza `guardarAsignacionReceta` (misma validación que el formulario) y,
 * solo si el guardado salió bien, escribe el registro del historial.
 * Si el registro del historial fallara, NO se deshace el guardado (solo se
 * avisa en consola): lo importante es que el cambio quedó aplicado.
 *
 * @returns {Promise<{guardada: object, cambios: object[]}>}
 * @throws el mismo error (con `.errores`) que lance guardarAsignacionReceta
 */
export async function guardarCambiosAsignacionReceta({
  local, receta, asignacionAnterior, asignacionNueva, productosLocal, usuario,
}) {
  const cambios = calcularCambiosAsignacion({ receta, asignacionAnterior, asignacionNueva, productosLocal });
  if (cambios.length === 0) return { guardada: asignacionAnterior, cambios };

  const guardada = await guardarAsignacionReceta(local, asignacionNueva);

  try {
    const uid = typeof usuario === 'string' ? usuario : (usuario?.uid ?? usuario?.id ?? null);
    await addDoc(modificacionesRecetaColRef(local, receta.id), {
      fecha: serverTimestamp(),
      usuario: uid,
      cambios,
    });
  } catch (error) {
    console.error('[modificacionesReceta] El cambio se guardó, pero no se pudo registrar en el historial:', error);
  }

  return { guardada, cambios };
}