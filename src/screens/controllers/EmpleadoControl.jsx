// control/EmpleadoControl.js

import {
  collection, doc, addDoc, setDoc, updateDoc, getDoc, getDocs,
  onSnapshot, query, where, limit,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, getAuth } from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { auth, db, firebaseConfig } from '../firebase';
import { EmpleadoModel } from '../models/EmpleadoModel';

const NODO = 'usuarios';
const NODO_HISTORIAL = 'historialPersonal';
const ZONA_HORARIA = 'America/Santiago';

function obtenerFechaHoraCL() {
  const ahora = new Date();
  const fecha = ahora.toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA });
  const hora = ahora.toLocaleTimeString('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: ZONA_HORARIA,
  });

  return `${fecha} ${hora}`;
}

function empleadoDocRef(id) {
  return doc(db, NODO, id);
}

function empleadosColRef() {
  return collection(db, NODO);
}

function historialColRef() {
  return collection(db, NODO_HISTORIAL);
}

/**
 * @param {{ uid?: string, rut?: string, email?: string, user?: string }} sesion
 * @returns {Promise<import('firebase/firestore').DocumentReference|null>}
 */
async function buscarDocumentoUsuario(sesion) {
  const posiblesIds = [sesion.uid, sesion.rut].filter(Boolean);

  for (const id of posiblesIds) {
    const referencia = empleadoDocRef(id);
    const resultado = await getDoc(referencia);
    if (resultado.exists()) return referencia;
  }

  const emailSesion = sesion.email ?? sesion.user;
  const filtros = [
    ['rut', sesion.rut],
    ['uid', sesion.uid],
    ['email', emailSesion],
  ].filter(([, valor]) => Boolean(valor));

  for (const [campo, valor] of filtros) {
    const consulta = query(empleadosColRef(), where(campo, '==', valor), limit(1));
    const resultado = await getDocs(consulta);
    if (!resultado.empty) return resultado.docs[0].ref;
  }

  return null;
}

/**
 * @param {string} rut
 * @param {string} email
 * @returns {Promise<{rutDuplicado: boolean, emailDuplicado: boolean}>}
 */
async function buscarDuplicados(rut, email) {
  const rutNorm   = rut.trim().toLowerCase();
  const emailNorm = email.trim().toLowerCase();
  let rutDuplicado   = false;
  let emailDuplicado = false;

  const snap = await getDocs(empleadosColRef());
  snap.forEach(docSnap => {
    const val = docSnap.data();
    if ((val.rut   ?? '').trim().toLowerCase() === rutNorm)   rutDuplicado   = true;
    if ((val.email ?? '').trim().toLowerCase() === emailNorm) emailDuplicado = true;
  });

  return { rutDuplicado, emailDuplicado };
}

// CRUD

/**
 * @param {string} rut
 * @param {string} email
 * @returns {Promise<{rut: boolean, email: boolean}>}
 */
export async function verificarDuplicadosEmpleado(rut, email) {
  try {
    const { rutDuplicado, emailDuplicado } = await buscarDuplicados(rut, email);
    return { rut: rutDuplicado, email: emailDuplicado };
  } catch (err) {
    console.error('Error al verificar duplicados:', err);
    return { rut: false, email: false };
  }
}

/**
 * @param {object} datosFormulario
 * @param {string} passwordTemporal - Contraseña provisional generada en la pantalla
 * @returns {Promise<string>} UID del nuevo empleado
 */
export async function crearEmpleado(datosFormulario, passwordTemporal) {
  // 0. Verificar que el RUT y el email no estén ya registrados en /usuarios
  const { rutDuplicado, emailDuplicado } = await buscarDuplicados(datosFormulario.rut, datosFormulario.email);
  if (rutDuplicado && emailDuplicado) {
    throw new Error('RUT_Y_EMAIL_DUPLICADO');
  } else if (rutDuplicado) {
    throw new Error('RUT ya está registrado');
  } else if (emailDuplicado) {
    throw new Error('email ya está registrado');
  }
  const appSecundaria = initializeApp(firebaseConfig, `crear-empleado-${Date.now()}`);
  const authSecundaria = getAuth(appSecundaria);
  const credencial = await createUserWithEmailAndPassword(
    authSecundaria,
    datosFormulario.email,
    passwordTemporal,
  );
  const uid = credencial.user.uid;
  await deleteApp(appSecundaria); // limpiar la app secundaria

  await sendPasswordResetEmail(auth, datosFormulario.email);

  // 3. Guardar datos en Firestore usando el UID como id del documento
  const empleado = new EmpleadoModel({ ...datosFormulario, id: uid });
  await setDoc(empleadoDocRef(uid), empleado.toFirebase());

  return uid;
}

/**
 * @param {string} firebaseKey
 * @param {object} datosFormulario
 */
export async function actualizarEmpleado(firebaseKey, datosFormulario) {
  const empleado = new EmpleadoModel(datosFormulario);
  const payload  = empleado.toFirebase();

  await updateDoc(empleadoDocRef(firebaseKey), payload);
}

/**
 * @param {object} sesion - objeto de sesión actual (useAuth)
 * @param {object} datosFormulario - datos editados en el formulario de Perfil
 * @returns {Promise<object>} los datos ya normalizados que quedaron guardados
 */
export async function actualizarMiPerfil(sesion, datosFormulario) {
  const referenciaUsuario = await buscarDocumentoUsuario(sesion);
  if (!referenciaUsuario) {
    throw new Error('USUARIO_NO_ENCONTRADO');
  }

  const empleado = new EmpleadoModel({
    ...sesion,
    ...datosFormulario,
    id: referenciaUsuario.id,
  });
  const payload = empleado.toFirebase();

  await updateDoc(referenciaUsuario, payload);

  return payload;
}

/**
 * Activa o desactiva un empleado.
 * @param {string}  firebaseKey
 * @param {boolean} nuevoEstado
 */
export async function toggleActivoEmpleado(firebaseKey, nuevoEstado) {
  await updateDoc(empleadoDocRef(firebaseKey), {
    activo: nuevoEstado,
  });
}

// Lectura 

/**

 * @param {function} callback - Recibe EmpleadoModel[]
 * @returns {function}
 */
export function suscribirPersonal(callback) {
  return onSnapshot(empleadosColRef(), (snap) => {
    const empleados = snap.docs.map(docSnap =>
      EmpleadoModel.fromFirebase(docSnap.id, docSnap.data())
    );
    callback(empleados);
  });
}

//Historial de sesiones

/**
 * Registra una entrada (inicio de turno).
 * @param {string} firebaseKey
 * @param {string} turno - 'dia' | 'noche'
 */
export async function registrarEntrada(firebaseKey, turno) {
  await addDoc(historialColRef(), {
    empleadoId: firebaseKey,
    entrada:    obtenerFechaHoraCL(),
    salida:     null,
    turno,
  });

  await updateDoc(empleadoDocRef(firebaseKey), {
    ultimaConexion: new Date().toISOString(),
  });
}

/**
 * Registra la salida en el registro pendiente (el más reciente sin salida).
 * @param {string} firebaseKey
 */
export async function registrarSalida(firebaseKey) {
  const qHistorial = query(historialColRef(), where('empleadoId', '==', firebaseKey));
  const snap = await getDocs(qHistorial);
  if (snap.empty) return;

  let keyPendiente = null;
  snap.forEach(docSnap => {
    const val = docSnap.data();
    if (!val.salida) keyPendiente = docSnap.id;
  });
  if (!keyPendiente) return;

  await updateDoc(doc(db, NODO_HISTORIAL, keyPendiente), {
    salida: obtenerFechaHoraCL(),
  });
}

/**
 * Obtiene una sola vez el historial de un empleado (colección externa historialPersonal).
 * @param {string} firebaseKey
 * @returns {Promise<Array<{id: string, entrada: string, salida: string|null, turno: string}>>}
 */
export async function obtenerHistorialEmpleado(firebaseKey) {
  const qHistorial = query(historialColRef(), where('empleadoId', '==', firebaseKey));
  const snap = await getDocs(qHistorial);
  if (snap.empty) return [];

  return snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * @param {string} firebaseKey
 * @param {function} callback - Recibe array de registros de historial
 * @returns {function}
 */
export function suscribirHistorialEmpleado(firebaseKey, callback) {
  const qHistorial = query(historialColRef(), where('empleadoId', '==', firebaseKey));

  return onSnapshot(qHistorial, (snap) => {
    const historial = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    callback(historial);
  });
}