// screens/inventario/vencimientoUtils.js
//
// Lectura de fechas de vencimiento. Se guardan como texto "DD/MM/AAAA" (así las
// escribe el formulario de reposición). `new Date('05/10/2026')` la leería como
// MM/DD (y con día > 12 da Invalid Date), por eso se parsea a mano. También
// acepta "AAAA-MM-DD", "DD-MM-AAAA", Date y Timestamp de Firestore.

const DIA_MS = 24 * 60 * 60 * 1000;

/** Devuelve una Date local a medianoche, o null si no es una fecha real. */
export function parsearFechaVencimiento(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === 'function') valor = valor.toDate();
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime())
      ? null
      : new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  const texto = String(valor).trim();

  let m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); // DD/MM/AAAA
  let dia, mes, anio;
  if (m) {
    [, dia, mes, anio] = m;
  } else if ((m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { // AAAA-MM-DD
    [, anio, mes, dia] = m;
  } else {
    return null;
  }

  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
  // Rechaza fechas imposibles (31/02, 45/13...) que JS "corrige" solo.
  if (fecha.getDate() !== Number(dia) || fecha.getMonth() !== Number(mes) - 1) return null;
  return fecha;
}

/** Días que faltan para vencer (negativo = ya venció, 0 = vence hoy). null si la fecha no es válida. */
export function diasHastaVencimiento(fechaVencimiento) {
  const fin = parsearFechaVencimiento(fechaVencimiento);
  if (!fin) return null;
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fin.getTime() - inicioHoy.getTime()) / DIA_MS);
}

/** "28 oct 2026" (o el texto original si no se pudo leer). */
export function formatFechaVencimiento(fechaVencimiento) {
  const fecha = parsearFechaVencimiento(fechaVencimiento);
  if (!fecha) return String(fechaVencimiento ?? 'fecha desconocida');
  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}