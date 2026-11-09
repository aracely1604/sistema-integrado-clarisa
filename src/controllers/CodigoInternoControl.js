// controllers/CodigoInternoControl.js
//
// Códigos de barras INTERNOS, para productos que no traen uno (a granel, preparados).
//
//  · Formato EAN-13 válido que empieza con "29": GS1 reserva el rango 200–299 para uso
//    interno de cada negocio, así que ningún fabricante puede tener un código igual.
//  · Los números salen de un contador en Firestore (configuracion/codigosInternos),
//    que se incrementa en una transacción: dos personas generando a la vez nunca
//    reciben el mismo.
//  · Productos a granel: Code 128 "GR-0000" (generarCodigoGranel), con su propio contador
//    (configuracion/codigosGranel). Los antiguos EAN-13 "29…" siguen siendo válidos.
//  · Aun así, cada código se compara contra el catálogo global por si alguien ya
//    registró a mano uno parecido; si existe, se salta al siguiente.

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { obtenerProductoPorCodigoBarra } from './ProductoControl';

const PREFIJO = '29';
const LARGO_SECUENCIA = 10;   // 2 + 10 + dígito verificador = 13 dígitos
const MAX_INTENTOS = 20;

const contadorRef = () => doc(db, 'configuracion', 'codigosInternos');
const contadorGranelRef = () => doc(db, 'configuracion', 'codigosGranel');

function digitoVerificadorEan13(doce) {
  let suma = 0;
  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

// true si el código tiene el formato interno (acepta 12 dígitos por si el
// lector omite el verificador).
export function esCodigoInterno(codigo) {
  return /^29\d{10,11}$/.test(String(codigo ?? '').trim());
}

async function siguienteNumero() {
  return runTransaction(db, async (tx) => {
    const ref = contadorRef();
    const snap = await tx.get(ref);
    const siguiente = (snap.exists() ? Number(snap.data()?.ultimo) || 0 : 0) + 1;
    tx.set(ref, { ultimo: siguiente, actualizadoEn: new Date().toISOString() });
    return siguiente;
  });
}

// Devuelve un código de 13 dígitos que no existe en el catálogo.
export async function generarCodigoInterno() {
  for (let intento = 0; intento < MAX_INTENTOS; intento += 1) {
    const numero = await siguienteNumero();
    const doce = PREFIJO + String(numero).padStart(LARGO_SECUENCIA, '0');
    const codigo = doce + digitoVerificadorEan13(doce);
    if (!(await obtenerProductoPorCodigoBarra(codigo))) return codigo;
  }
  throw new Error('No se pudo generar un código disponible. Intenta nuevamente.');
}
// ── Productos a granel: Code 128 "GR-0000" ──────────────────────────────────
async function siguienteNumeroGranel() {
  return runTransaction(db, async (tx) => {
    const ref = contadorGranelRef();
    const snap = await tx.get(ref);
    const siguiente = (snap.exists() ? Number(snap.data()?.ultimo) || 0 : 0) + 1;
    tx.set(ref, { ultimo: siguiente, actualizadoEn: new Date().toISOString() });
    return siguiente;
  });
}

// Devuelve "GR-0001", "GR-0002"... (4 dígitos; pasa a 5 si algún día se superan 9999).
export async function generarCodigoGranel() {
  for (let intento = 0; intento < MAX_INTENTOS; intento += 1) {
    const numero = await siguienteNumeroGranel();
    const codigo = `GR-${String(numero).padStart(4, '0')}`;
    if (!(await obtenerProductoPorCodigoBarra(codigo))) return codigo;
  }
  throw new Error('No se pudo generar un código disponible. Intenta nuevamente.');
}