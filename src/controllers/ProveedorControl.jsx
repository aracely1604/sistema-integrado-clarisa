import {
  doc, setDoc, getDoc, getDocs, updateDoc,
  onSnapshot, collectionGroup,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  ProveedorModel, validarProveedorGlobal, validarDatosContacto, validarDias, limpiarTelefono,
} from '../models/ProveedorModel';
import {
  proveedoresColRef, proveedorAsignadoDocRef, proveedorGlobalDocRef, proveedorGlobalColRef,
} from '../models/LocalModel';

/** Error con el mapa de validación adjunto, para que la UI pinte cada campo. */
class ProveedorInvalidoError extends Error {
  constructor(errores) {
    super('Datos de proveedor inválidos');
    this.errores = errores;
  }
}

/**
 * @param {object} datos
 * @param {string} datos.nombre
 * @param {string} datos.empresa
 * @param {string} datos.telefono
 * @returns {Promise<{id: string, nombre: string, empresa: string, telefono: string}>}
 */
export async function crearProveedorGlobal({ nombre, empresa, telefono }) {
  const errores = validarProveedorGlobal({ nombre, empresa, telefono });
  if (Object.keys(errores).length > 0) throw new ProveedorInvalidoError(errores);

  const nuevoRef = doc(proveedorGlobalColRef());
  const id = nuevoRef.id;
  const datos = { nombre: nombre.trim(), empresa: empresa.trim(), telefono: limpiarTelefono(telefono) };
  await setDoc(nuevoRef, datos);

  return { id, ...datos };
}

/**
 * @param {string} id
 * @param {{nombre: string, telefono: string}} datos
 */
export async function actualizarProveedorGlobal(id, { nombre, telefono }) {
  const errores = validarDatosContacto({ nombre, telefono });
  if (Object.keys(errores).length > 0) throw new ProveedorInvalidoError(errores);

  await updateDoc(proveedorGlobalDocRef(id), {
    nombre: nombre.trim(),
    telefono: limpiarTelefono(telefono),
  });
}

/**
 * @returns {Promise<Array<{id: string, nombre: string, empresa: string, telefono: string}>>}
 */
export async function obtenerProveedoresGlobales() {
  const snap = await getDocs(proveedorGlobalColRef());
  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * @param {function} callback - Recibe Array<{id, nombre, empresa, telefono}>
 * @returns {function} para cancelar la suscripción
 */
export function suscribirProveedoresGlobales(callback) {
  return onSnapshot(proveedorGlobalColRef(), (snap) => {
    callback(snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
  });
}

/**
 * Proveedores globales que TODAVÍA NO están asignados a un local puntual.
 * Es lo que alimenta el selector del formulario "asignar proveedor" de ese local.
 * @param {string} local
 * @returns {Promise<Array<{id: string, nombre: string, empresa: string, telefono: string}>>}
 */
export async function obtenerProveedoresGlobalesDisponibles(local) {
  const [globalSnap, asignSnap] = await Promise.all([
    getDocs(proveedorGlobalColRef()),
    getDocs(proveedoresColRef(local)),
  ]);
  if (globalSnap.empty) return [];

  const yaAsignados = new Set(asignSnap.docs.map(d => d.id));
  return globalSnap.docs
    .filter(docSnap => !yaAsignados.has(docSnap.id))
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * @param {string} local        - Local al que se quiere asignar
 * @param {string} id           - Id del proveedor (proveedor/{id})
 * @param {number[]} dias       - Días de visita para ESTE local
 * @param {boolean} [activo]    - Estado inicial de la asignación (default: true)
 */
export async function asignarProveedorExistenteALocal(local, id, dias, activo = true) {
  if (!validarDias(dias)) {
    throw new ProveedorInvalidoError({ dias: 'Selecciona al menos un día de visita' });
  }
  const proveedorTemp = new ProveedorModel({ id, dias, activo });
  await setDoc(proveedorAsignadoDocRef(local, id), proveedorTemp.toFirebaseAsignacion(), { merge: true });
}

/**
 * @param {string} local
 * @param {string} id
 * @param {number[]} dias
 */
export async function actualizarDiasProveedorLocal(local, id, dias) {
  if (!validarDias(dias)) {
    throw new ProveedorInvalidoError({ dias: 'Selecciona al menos un día de visita' });
  }
  const proveedorTemp = new ProveedorModel({ id, dias });
  await updateDoc(proveedorAsignadoDocRef(local, id), { dias: proveedorTemp.toFirebaseAsignacion().dias });
}

/**
 * @param {string} local - Local del que cuelga la asignación
 * @param {string} id
 * @param {boolean} activo
 */
export async function cambiarEstadoProveedor(local, id, activo) {
  await updateDoc(proveedorAsignadoDocRef(local, id), { activo });
}

/**
 * @param {string} local
 * @returns {Promise<ProveedorModel[]>}
 */
export async function obtenerProveedoresPorLocal(local) {
  const asignSnap = await getDocs(proveedoresColRef(local));
  if (asignSnap.empty) return [];

  const entradas = asignSnap.docs.map(docSnap => ({ id: docSnap.id, asignacion: docSnap.data() }));

  const datosProveedores = await Promise.all(
    entradas.map(({ id }) => getDoc(proveedorGlobalDocRef(id)))
  );

  return entradas.map(({ id, asignacion }, i) => {
    const datosProveedor = datosProveedores[i].exists() ? datosProveedores[i].data() : {};
    return ProveedorModel.fromFirebase(local, id, datosProveedor, asignacion);
  });
}

/**
 * @param {string} local
 * @param {function} callback - Recibe ProveedorModel[]
 * @returns {function} para cancelar la suscripción
 */
export function suscribirProveedoresPorLocal(local, callback) {
  let ultimasAsignaciones = null;
  let ultimosProveedores = null;

  const recalcular = () => {
    if (ultimasAsignaciones === null || ultimosProveedores === null) return;
    const lista = Object.entries(ultimasAsignaciones).map(([id, asignacion]) =>
      ProveedorModel.fromFirebase(local, id, ultimosProveedores[id] ?? {}, asignacion)
    );
    callback(lista);
  };

  const unsubAsign = onSnapshot(proveedoresColRef(local), (snap) => {
    const mapa = {};
    snap.forEach(docSnap => { mapa[docSnap.id] = docSnap.data(); });
    ultimasAsignaciones = mapa;
    recalcular();
  });

  const unsubProv = onSnapshot(proveedorGlobalColRef(), (snap) => {
    const mapa = {};
    snap.forEach(docSnap => { mapa[docSnap.id] = docSnap.data(); });
    ultimosProveedores = mapa;
    recalcular();
  });

  return () => {
    unsubAsign();
    unsubProv();
  };
}

/**
 * @param {function} callback - Recibe ProveedorModel[]
 * @returns {function} para cancelar la suscripción
 */
export function suscribirProveedores(callback) {
  let ultimasAsignaciones = null; // { [local]: { [id]: asignacion } }
  let ultimosProveedores = null;  // { [id]: datosGlobales }

  const recalcular = () => {
    if (ultimasAsignaciones === null || ultimosProveedores === null) return;
    const lista = [];
    Object.entries(ultimasAsignaciones).forEach(([local, asignaciones]) => {
      Object.entries(asignaciones).forEach(([id, asignacion]) => {
        lista.push(ProveedorModel.fromFirebase(local, id, ultimosProveedores[id] ?? {}, asignacion));
      });
    });
    callback(lista);
  };

  const unsubAsign = onSnapshot(collectionGroup(db, 'proveedores'), (snap) => {
    const porLocal = {};
    snap.forEach(docSnap => {
      // locales/{local}/proveedores/{id} → el local es el abuelo del doc.
      const local = docSnap.ref.parent.parent.id;
      if (!porLocal[local]) porLocal[local] = {};
      porLocal[local][docSnap.id] = docSnap.data();
    });
    ultimasAsignaciones = porLocal;
    recalcular();
  });

  const unsubProv = onSnapshot(proveedorGlobalColRef(), (snap) => {
    const mapa = {};
    snap.forEach(docSnap => { mapa[docSnap.id] = docSnap.data(); });
    ultimosProveedores = mapa;
    recalcular();
  });

  return () => {
    unsubAsign();
    unsubProv();
  };
}
