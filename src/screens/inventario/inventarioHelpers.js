// screens/inventario/inventarioHelpers.js
import { HOY_IDX } from './inventarioData';
import { DIAS_VENCIMIENTO_MAX, DIAS_CRITICO } from '../../models/VencimientoConfig';

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

// Umbrales de vencimiento: se definen en models/VencimientoConfig.js (así el controlador
// que bloquea la reposición usa los mismos valores) y se reexportan acá.
//  - DIAS_VENCIMIENTO_MAX: sobre esto el producto ni siquiera se muestra.
//  - DIAS_CRITICO: desde aquí hacia abajo la oferta se activa automáticamente.
export { DIAS_VENCIMIENTO_MAX, DIAS_CRITICO };

// 'expired'  (rojo)    : ya venció (días negativos).
// 'critical' (rojo)    : vence hoy o en DIAS_CRITICO días o menos.
// 'warning'  (amarillo): vence en más de DIAS_CRITICO y hasta DIAS_VENCIMIENTO_MAX días.
export function getVencLevel(dias) {
  if (dias < 0)             return 'expired';
  if (dias <= DIAS_CRITICO) return 'critical';
  return 'warning';
}

// $1.234 (pesos, sin decimales)
export function formatearPrecio(valor) {
  return `$${Math.round(Number(valor) || 0).toLocaleString('es-CL')}`;
}

// Versión compacta para tarjetas chicas: $850 · $12.500 · $1,2 M
export function formatearPrecioCorto(valor) {
  const n = Math.round(Number(valor) || 0);
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`;
  return formatearPrecio(n);
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