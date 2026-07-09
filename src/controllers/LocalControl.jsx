import { getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import {
  LocalModel,
  LOCAL_POR_DEFECTO,
  TIPOS_TURNO,
  validarTipoTurno,
  localDocRef,
  localesColRef,
} from '../models/LocalModel';

export { LOCAL_POR_DEFECTO, TIPOS_TURNO };

/**

 * @param {string} nombreLocal
 * @returns {Promise<LocalModel>}
 */
export async function obtenerHorarioLocal(nombreLocal) {
  const snap = await getDoc(localDocRef(nombreLocal));
  return LocalModel.fromFirebase(nombreLocal, snap.exists() ? snap.data() : {});
}

/**
 * Actualiza hora_inicio / hora_fin de un turno específico (Día o Noche) de un local.
 * @param {string} nombreLocal
 * @param {'turnoDia'|'turnoNoche'} tipoTurno
 * @param {{hora_inicio: string, hora_fin: string}} horario
 */
export async function actualizarTurnoLocal(nombreLocal, tipoTurno, horario) {
  if (!validarTipoTurno(tipoTurno)) {
    throw new Error(`Tipo de turno inválido: ${tipoTurno}`);
  }

  await setDoc(localDocRef(nombreLocal), {
    [tipoTurno]: {
      hora_inicio: horario.hora_inicio,
      hora_fin: horario.hora_fin,
    },
  }, { merge: true });
}

/**

 * @param {function} callback
 * @returns {function}
 */
export function suscribirLocales(callback) {
  return onSnapshot(localesColRef(), (snap) => {
    if (snap.empty) {
      callback([]);
      return;
    }
    const locales = snap.docs.map(docSnap => LocalModel.fromFirebase(docSnap.id, docSnap.data()));
    callback(locales);
  });
}
