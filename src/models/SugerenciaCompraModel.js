// models/SugerenciaCompraModel.js
//
// Lógica PURA (sin Firestore ni React) de la "sugerencia de compra": cuando un producto está en
// stock crítico, sin stock o bajo, a qué proveedor se le puede comprar.
//
// El vínculo producto → proveedores es `idsProveedores` (los que ya repusieron ese producto en el
// local; se llena solo con cada reposición). Solo cuentan los proveedores ACTIVOS asignados al local.
// Para cada producto se elige como "mejor" el proveedor que visita primero.

import { nombreProveedor } from './ProveedorModel';

const ORDEN_NIVEL = { out: 0, critical: 1, low: 2 };

/**
 * Días hasta la próxima visita: 0 = hoy, 1 = mañana... Infinity si no tiene días programados.
 * @param {number[]} dias   índices de día (0 = domingo ... 6 = sábado)
 * @param {number} hoyIdx   día de hoy con el mismo índice
 */
export function diasHastaProximaVisita(dias, hoyIdx) {
  if (!Array.isArray(dias) || dias.length === 0) return Infinity;
  return Math.min(...dias.map((d) => (((d - hoyIdx) % 7) + 7) % 7));
}

export function textoProximaVisita(diasHasta) {
  if (diasHasta === Infinity) return 'sin visita programada';
  if (diasHasta === 0) return 'hoy';
  if (diasHasta === 1) return 'mañana';
  return `en ${diasHasta} días`;
}

/**
 * @param {object} params
 * @param {Array<{id, nombre, qty, min, unit, nivel, idsProveedores}>} params.alertas
 *        productos en alerta; `nivel` es 'out' | 'critical' | 'low' (el resto se ignora)
 * @param {Array<{id, nombre, empresa, dias, activo}>} params.proveedores  proveedores asignados al local
 *        (en pantalla se muestra la empresa; ver nombreProveedor)
 * @param {number} params.hoyIdx
 * @returns {{
 *   porProducto: Map<string, {proveedores: object[], mejor: object|null}>,
 *   porProveedor: Map<string, object[]>,   // productos que conviene pedirle a cada proveedor
 *   sinProveedor: object[],                // productos en alerta sin ningún proveedor activo conocido
 * }}
 * Cada producto sugerido trae además `faltante` = lo que falta para llegar al stock mínimo
 * (en la misma unidad que `qty`).
 */
export function calcularSugerenciasCompra({ alertas, proveedores, hoyIdx }) {
  const activos = new Map((proveedores ?? []).filter((p) => p.activo !== false).map((p) => [p.id, p]));
  const porProducto = new Map();
  const porProveedor = new Map();
  const sinProveedor = [];

  const ordenadas = (alertas ?? [])
    .filter((a) => a.nivel in ORDEN_NIVEL)
    .sort((a, b) => (ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]) || a.nombre.localeCompare(b.nombre, 'es'));

  for (const alerta of ordenadas) {
    const faltante = Math.max(0, Math.round(((Number(alerta.min) || 0) - (Number(alerta.qty) || 0)) * 100) / 100);
    const producto = { ...alerta, faltante };

    const candidatos = (alerta.idsProveedores ?? [])
      .map((id) => activos.get(id))
      .filter(Boolean)
      .map((p) => ({
        id: p.id,
        etiqueta: nombreProveedor(p), // lo que se muestra: la empresa
        diasHasta: diasHastaProximaVisita(p.dias, hoyIdx),
      }))
      .sort((a, b) => (a.diasHasta - b.diasHasta) || a.etiqueta.localeCompare(b.etiqueta, 'es'));

    porProducto.set(alerta.id, { proveedores: candidatos, mejor: candidatos[0] ?? null });

    if (candidatos.length === 0) {
      sinProveedor.push(producto);
      continue;
    }
    candidatos.forEach((c) => {
      const lista = porProveedor.get(c.id) ?? [];
      lista.push(producto);
      porProveedor.set(c.id, lista);
    });
  }

  return { porProducto, porProveedor, sinProveedor };
}