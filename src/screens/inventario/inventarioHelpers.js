// screens/inventario/inventarioHelpers.js
import { HOY_IDX } from './inventarioData';

// Rojo: stockActual <= stockMínimo (hay que reponer ya).
// Amarillo: stockActual <= 2 × stockMínimo (reponer pronto).
// Si no, está ok (no se muestra en las alertas).
export function getLevel(item) {
  if (item.qty <= 0)          return 'out';
  if (item.qty <= item.min)   return 'critical';
  if (item.qty <= item.min*2) return 'low';
  return 'ok';
}

export function getPct(item) {
  return Math.min(100, Math.round((item.qty / item.max) * 100));
}

// Rojo: vence en 7 días o menos (o ya venció). Amarillo: vence en 30 días o menos.
export function getVencLevel(dias) {
  if (dias <= 7)  return 'critical';
  if (dias <= 30) return 'warning';
  return 'soon';
}

export function getInitials(nombre) {
  return nombre.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function nextVisitOffset(diasArr) {
  return Math.min(
    ...diasArr.map(dia => {
      let diff = dia - HOY_IDX;
      // Si la visita es hoy o ya pasó, corresponde a la siguiente semana
      if (diff <= 0) diff += 7;
      return diff;
    })
  );
}

export function formatHora(fecha) {
  return fecha;
}