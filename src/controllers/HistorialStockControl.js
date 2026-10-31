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

import { collection, query, where, orderBy, limit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { HistorialStockModel } from '../models/HistorialStockModel';
import { proveedorGlobalDocRef, modificacionesProductoColRef } from '../models/LocalModel';

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
 * Qué vencimiento aporta un movimiento de TRANSFERENCIA a su local.
 *
 * - Movimientos nuevos (`vencimientoVigente: true`): el movimiento es una "foto" del
 *   vencimiento vigente de ese local en ese momento (ultimaReposicionFecha /
 *   ultimaReposicionVencimiento). Se ordena por la fecha DEL MOVIMIENTO: así, si el local
 *   estaba en 0 (o su vencimiento era más viejo), el que llega con la transferencia
 *   reemplaza al anterior y no queda "pegado" un vencimiento de stock que ya no existe.
 * - Movimientos antiguos (sin la marca): se ordenan por la fecha de la reposición que
 *   traían copiada, como antes.
 *
 * @returns {{fecha: any, vencimiento: string|null, orden: any}|null}
 *   `fecha` = fecha de la reposición de origen (para mostrar), `orden` = con qué se compara.
 */
export function candidatoDeTransferencia(data) {
  if (!data) return null;
  if (data.vencimientoVigente) {
    return {
      fecha: data.ultimaReposicionFecha ?? null,
      vencimiento: data.ultimaReposicionVencimiento ?? null,
      orden: data.fecha ?? null,
    };
  }
  if (data.ultimaReposicionFecha) {
    return {
      fecha: data.ultimaReposicionFecha,
      vencimiento: data.ultimaReposicionVencimiento ?? null,
      orden: data.ultimaReposicionFecha,
    };
  }
  return null;
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
 * @param {{limite?: number|null}} [opciones] - si trae `limite`, solo se leen (y cobran)
 *        los `limite` movimientos más recientes; sin límite se lee todo el historial.
 * @returns {function} para cancelar la suscripción
 */
export function suscribirHistorialProductoLocal(local, idProducto, callback, opciones = {}) {
  if (!local || !idProducto) {
    callback([]);
    return () => {};
  }

  const restricciones = [
    where('local', '==', local),
    where('idProducto', '==', idProducto),
    orderBy('fecha', 'desc'),
  ];
  if (opciones.limite) restricciones.push(limit(opciones.limite));
  const q = query(collection(db, HISTORIAL_STOCK_COLLECTION), ...restricciones);

  const unsubscribe = onSnapshot(q, async (snap) => {
    // Se preservan los campos que la transferencia copia de la última reposición
    // del local de origen, por si el modelo no los incluye en fromFirebase.
    const base = snap.docs.map((d) => ({
      ...HistorialStockModel.fromFirebase(d.id, d.data()),
      ultimaReposicionFecha: d.data().ultimaReposicionFecha ?? null,
      ultimaReposicionVencimiento: d.data().ultimaReposicionVencimiento ?? null,
    }));
    const enriquecidos = await Promise.all(base.map(enriquecerMovimiento));
    callback(enriquecidos);
  });

  return unsubscribe;
}

/**
 * Suscripción en vivo a la ÚLTIMA reposición conocida de un producto en un local:
 * proveedor, fecha y vencimiento. Reemplaza el cálculo que antes se hacía
 * recorriendo todo el historial: ahora son 2 consultas de 1 documento cada una
 * (la última reposición propia y la última transferencia, que trae copiada la
 * reposición del local de origen). Gana la de fecha de reposición más reciente.
 *
 * ⚠️ Pide un índice compuesto: local Asc, idProducto Asc, tipoMovimiento Asc,
 * fecha Desc (la consola del navegador da el link para crearlo en un clic).
 *
 * @param {string} local
 * @param {string} idProducto
 * @param {(r: {fecha: any, vencimiento: string|null, proveedorNombre: string|null, proveedorEmpresa: string|null}|null) => void} callback
 *        recibe null si el producto nunca ha tenido una reposición conocida
 * @returns {function} para cancelar la suscripción
 */
export function suscribirUltimaReposicionProducto(local, idProducto, callback) {
  if (!local || !idProducto) {
    callback(null);
    return () => {};
  }

  const col = collection(db, HISTORIAL_STOCK_COLLECTION);
  const ultimoDe = (tipo) => query(
    col,
    where('local', '==', local),
    where('idProducto', '==', idProducto),
    where('tipoMovimiento', '==', tipo),
    orderBy('fecha', 'desc'),
    limit(1),
  );

  const aMillis = (f) => (f && typeof f.toMillis === 'function' ? f.toMillis() : 0);
  let repo;   // undefined = todavía no llegó la primera respuesta
  let transf;
  let cancelado = false;

  const emitir = async () => {
    if (repo === undefined || transf === undefined) return;

    const candidatos = [];
    if (repo?.fecha) {
      candidatos.push({ fecha: repo.fecha, vencimiento: repo.fechaVencimiento ?? null, orden: repo.fecha });
    }
    const deTransferencia = candidatoDeTransferencia(transf);
    if (deTransferencia) candidatos.push(deTransferencia);
    candidatos.sort((a, b) => aMillis(b.orden) - aMillis(a.orden));
    const mejor = candidatos[0] ?? null;

    const proveedor = await obtenerDatosProveedor(repo?.idProveedor);
    if (cancelado) return;

    callback(mejor ? {
      fecha: mejor.fecha,
      vencimiento: mejor.vencimiento,
      proveedorNombre: proveedor?.nombre ?? null,
      proveedorEmpresa: proveedor?.empresa ?? null,
    } : null);
  };

  const alError = (cual) => (error) => {
    console.error(`[historialStock] Falló la consulta de última ${cual}:`, error);
    if (cual === 'reposicion') repo = null; else transf = null;
    emitir();
  };

  const u1 = onSnapshot(ultimoDe('reposicion'), (snap) => { repo = snap.docs[0]?.data() ?? null; emitir(); }, alError('reposicion'));
  const u2 = onSnapshot(ultimoDe('transferencia'), (snap) => { transf = snap.docs[0]?.data() ?? null; emitir(); }, alError('transferencia'));

  return () => { cancelado = true; u1(); u2(); };
}

/**
 * Suscripción en vivo al historial de MODIFICACIONES (stock mínimo / precio) de
 * UN producto dentro de UN local, de la más reciente a la más antigua:
 *   locales/{local}/productos/{idProducto}/modificaciones
 * Cada elemento: { id, fecha, usuario, usuarioNombre, cambios: [{campo, anterior, nuevo}] }
 * (usuarioNombre se resuelve desde el uid, igual que en el historial de movimientos).
 * Ordena por un solo campo, así que no pide índice compuesto.
 *
 * @param {string} local
 * @param {string} idProducto
 * @param {(modificaciones: object[]) => void} callback
 * @param {{limite?: number|null}} [opciones] - igual que en el historial de movimientos
 * @returns {function} para cancelar la suscripción
 */
export function suscribirModificacionesProducto(local, idProducto, callback, opciones = {}) {
  if (!local || !idProducto) {
    callback([]);
    return () => {};
  }

  const restricciones = [orderBy('fecha', 'desc')];
  if (opciones.limite) restricciones.push(limit(opciones.limite));
  const q = query(modificacionesProductoColRef(local, idProducto), ...restricciones);

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
      console.error('[modificaciones] Falló la consulta del historial de modificaciones:', error);
      callback([]);
    },
  );
}

/**
 * onSnapshot con red de seguridad para los paneles del dashboard.
 *
 * Problema que resuelve: si una consulta necesita un índice compuesto que
 * todavía no existe, Firestore corta la suscripción con un error
 * ("failed-precondition") y, sin manejador de error, el panel queda vacío en
 * silencio. Acá:
 *  1) el error SIEMPRE se muestra en la consola (trae el link para crear el índice), y
 *  2) si es por falta de índice, se cae automáticamente a una consulta de
 *     respaldo que no lo necesita (más simple; el filtrado/orden fino se hace
 *     en el cliente con `preparar`), así el panel funciona igual.
 *
 * @param {object} cfg
 * @param {string} cfg.etiqueta  - nombre del panel, solo para los mensajes de consola
 * @param {Query}  cfg.principal - consulta ideal (necesita índice compuesto)
 * @param {Query}  cfg.respaldo  - consulta sin índice compuesto
 * @param {(docs: QueryDocumentSnapshot[]) => QueryDocumentSnapshot[]} cfg.preparar
 *        - filtra/ordena los docs del respaldo para que queden como los de la principal
 * @param {(docs: QueryDocumentSnapshot[]) => void} cfg.alRecibir
 * @returns {function} para cancelar la suscripción (la activa en ese momento)
 */
function suscribirConRespaldo({ etiqueta, principal, respaldo, preparar, alRecibir }) {
  let cancelar = () => {};

  cancelar = onSnapshot(
    principal,
    (snap) => alRecibir(snap.docs),
    (error) => {
      console.error(`[historialStock] Falló la consulta de "${etiqueta}":`, error);
      if (error?.code !== 'failed-precondition') return;

      console.warn(
        `[historialStock] "${etiqueta}" necesita un índice compuesto (el link para crearlo está en el error de arriba). ` +
        'Mientras tanto se usa una consulta de respaldo sin índice.',
      );
      cancelar = onSnapshot(
        respaldo,
        (snap) => alRecibir(preparar(snap.docs)),
        (err) => console.error(`[historialStock] Falló también el respaldo de "${etiqueta}":`, err),
      );
    },
  );

  return () => cancelar();
}

/**
 * Suscripción en vivo a "próximo vencimiento conocido" por producto, en UN
 * local. Como no usamos lotes, no se sabe qué parte del stock corresponde a
 * cuál reposición — esto toma la reposición MÁS RECIENTE con fecha de
 * vencimiento como aproximación (decisión explícita del usuario).
 *
 * Fuentes consideradas, por producto:
 *  - reposiciones de este local (fecha + fechaVencimiento propias), y
 *  - transferencias recibidas/enviadas, que traen copiada la última
 *    reposición del local de ORIGEN (ultimaReposicionFecha /
 *    ultimaReposicionVencimiento), así un producto que llegó por
 *    transferencia también tiene vencimiento.
 * Gana la de fecha de reposición más reciente (una transferencia de hoy puede traer
 * una reposición vieja), salvo las transferencias nuevas, que son una "foto" del
 * vencimiento vigente y se ordenan por la fecha del movimiento (ver candidatoDeTransferencia).
 *
 * @param {string} local
 * @param {(porProducto: Map<string, {fechaVencimiento: string, fecha: any}>) => void} callback
 *        `fecha` es la fecha de la reposición (Timestamp) que originó ese vencimiento.
 * @returns {function} para cancelar la suscripción
 */
export function suscribirVencimientosProximos(local, callback) {
  if (!local) {
    callback(new Map());
    return () => {};
  }

  const col = collection(db, HISTORIAL_STOCK_COLLECTION);
  const tipos = ['reposicion', 'transferencia'];

  // Una reposición recién creada todavía no resolvió su serverTimestamp (null):
  // se trata como "ahora", o sea la más reciente.
  const aMillis = (f) => (f && typeof f.toMillis === 'function' ? f.toMillis() : Date.now());

  const procesar = (docs) => {
    const porProducto = new Map();
    docs.forEach((d) => {
      const data = d.data();
      let candidato = null;
      if (data.tipoMovimiento === 'reposicion' && data.fechaVencimiento) {
        candidato = { fechaVencimiento: data.fechaVencimiento, fecha: data.fecha ?? null, orden: data.fecha ?? null };
      } else if (data.tipoMovimiento === 'transferencia') {
        const c = candidatoDeTransferencia(data);
        // Una "foto" sin vencimiento SÍ cuenta: significa que el stock que llegó no tiene
        // fecha conocida y reemplaza a un vencimiento anterior que ya no corresponde.
        if (c && (c.vencimiento || data.vencimientoVigente)) {
          candidato = { fechaVencimiento: c.vencimiento, fecha: c.fecha, orden: c.orden };
        }
      }
      if (!candidato) return;

      const actual = porProducto.get(data.idProducto);
      if (!actual || aMillis(candidato.orden) > aMillis(actual.orden)) {
        porProducto.set(data.idProducto, candidato);
      }
    });
    callback(porProducto);
  };

  return suscribirConRespaldo({
    etiqueta: 'Por vencer',
    // Ideal: acotada y ordenada. Necesita índice compuesto
    // (local Asc, tipoMovimiento Asc, fecha Desc).
    principal: query(
      col,
      where('local', '==', local),
      where('tipoMovimiento', 'in', tipos),
      orderBy('fecha', 'desc'),
      limit(300), // cota razonable mientras el historial crece
    ),
    // Respaldo: solo igualdades (Firestore las resuelve combinando índices
    // simples, sin índice compuesto). Trae todo el historial del local, pero
    // `procesar` no depende del orden de llegada.
    respaldo: query(col, where('local', '==', local), where('tipoMovimiento', 'in', tipos)),
    preparar: (docs) => docs,
    alRecibir: procesar,
  });
}

/**
 * Suscripción en vivo a los movimientos de stock registrados HOY en un local
 * (cualquier tipo: reposición, transferencia, devolución).
 *
 * ⚠️ Combina 1 igualdad (local) + un rango (fecha) — también puede pedir
 * índice compuesto según tu proyecto.
 *
 * @param {string} local
 * @param {(movimientos: object[]) => void} callback
 * @returns {function} para cancelar la suscripción
 */
export function suscribirMovimientosHoy(local, callback) {
  if (!local) {
    callback([]);
    return () => {};
  }

  const ahora = new Date();
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioManana = new Date(inicioHoy);
  inicioManana.setDate(inicioManana.getDate() + 1);

  const col = collection(db, HISTORIAL_STOCK_COLLECTION);
  const alRecibir = (docs) => {
    callback(docs.map((d) => HistorialStockModel.fromFirebase(d.id, d.data())));
  };

  return suscribirConRespaldo({
    etiqueta: 'Ingresados hoy',
    // Ideal: necesita índice compuesto (local Asc, fecha Desc).
    principal: query(
      col,
      where('local', '==', local),
      where('fecha', '>=', inicioHoy),
      where('fecha', '<', inicioManana),
      orderBy('fecha', 'desc'),
    ),
    // Respaldo: solo el rango de fecha (índice simple, automático). Lo de hoy
    // en todos los locales es poco, así que el local se filtra acá.
    respaldo: query(
      col,
      where('fecha', '>=', inicioHoy),
      where('fecha', '<', inicioManana),
      orderBy('fecha', 'desc'),
    ),
    preparar: (docs) => docs.filter((d) => d.data().local === local),
    alRecibir,
  });
}