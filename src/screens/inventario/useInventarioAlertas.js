// screens/inventario/useInventarioAlertas.js
//
// Conecta el dashboard de inventario (STOCK CRÍTICO / POR VENCER / INGRESADOS
// HOY) a datos reales de Firestore, en lugar de los mocks de inventarioData.js
// (STOCK_DATA, VENCIMIENTOS_DATA, inventarioReciente). Entrega los arrays con
// la MISMA forma de campos que esperaban esos mocks (qty, min, max, unit,
// vence, lote, cantidad, hora, fecha), así AlertCards.jsx, inventarioHelpers.js
// y DetalleModals.jsx no necesitan cambios más allá de sus umbrales.
//
// Todo es en vivo (onSnapshot): el stock se actualiza solo con cada
// reposición/venta/transferencia, y "por vencer"/"ingresados hoy" se
// recalculan solos con cada movimiento nuevo en historialStock.

import { useEffect, useMemo, useState } from 'react';
import { suscribirProductosLocalEnriquecidos } from '../../controllers/RecetaLocalControl';
import { suscribirVencimientosProximos, suscribirMovimientosHoy } from '../../controllers/HistorialStockControl';
import {
  unidadBaseDesdeUnidadMedida, convertirBaseAIngreso, etiquetaUnidadIngreso,
} from './gestionProductosData';

const DIA_MS = 24 * 60 * 60 * 1000;

// La fecha de vencimiento se guarda tal como se escribe en el formulario de
// reposición: "DD/MM/AAAA". `new Date('05/10/2026')` la leería como MM/DD (y
// con día > 12 da Invalid Date), así que se parsea a mano. También acepta
// "AAAA-MM-DD" y "DD-MM-AAAA". Devuelve una Date local a medianoche, o null.
function parsearFechaVencimiento(valor) {
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

function diasHastaVencimiento(fechaVencimiento) {
  const fin = parsearFechaVencimiento(fechaVencimiento);
  if (!fin) return null;
  const hoy = new Date();
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((fin.getTime() - inicioHoy.getTime()) / DIA_MS);
}

function formatFechaVencimiento(fechaVencimiento) {
  const fecha = parsearFechaVencimiento(fechaVencimiento);
  if (!fecha) return String(fechaVencimiento ?? 'fecha desconocida');
  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatHora(fecha) {
  if (!fecha || typeof fecha.toDate !== 'function') return '--:--';
  return fecha.toDate().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function formatFechaCorta(fecha) {
  if (!fecha || typeof fecha.toDate !== 'function') return 'fecha desconocida';
  return fecha.toDate().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * @param {string} local - local activo; el hook se re-suscribe solo al cambiar.
 * @returns {{ stockData: object[], vencimientosData: object[], inventarioReciente: object[] }}
 */
export function useInventarioAlertas(local) {
  const [productos, setProductos] = useState([]);
  const [vencimientosPorProducto, setVencimientosPorProducto] = useState(new Map());
  const [movimientosHoy, setMovimientosHoy] = useState([]);

  // Productos del local (stock en vivo), ya enriquecidos con nombre/unidad
  // del catálogo global — misma función que ya usa la estimación de recetas.
  useEffect(() => {
    const unsubscribe = suscribirProductosLocalEnriquecidos(local, setProductos);
    return () => unsubscribe?.();
  }, [local]);

  // "Próximo vencimiento" por producto: la reposición más reciente con
  // fecha de vencimiento (sin lotes, es una aproximación — ver nota en
  // HistorialStockControl.js).
  useEffect(() => {
    const unsubscribe = suscribirVencimientosProximos(local, setVencimientosPorProducto);
    return () => unsubscribe?.();
  }, [local]);

  // Movimientos de hoy, cualquier tipo.
  useEffect(() => {
    const unsubscribe = suscribirMovimientosHoy(local, setMovimientosHoy);
    return () => unsubscribe?.();
  }, [local]);

  // ─── STOCK_DATA-shaped ──────────────────────────────────────────────────
  const stockData = useMemo(() => productos.map((p) => {
    const unidadBase = unidadBaseDesdeUnidadMedida(p.unidadMedida);
    const min = convertirBaseAIngreso(p.stockMinimo, unidadBase);
    return {
      id: p.id,
      nombre: p.nombre,
      local,
      qty: convertirBaseAIngreso(p.stockActual, unidadBase),
      min,
      // No tenemos un "stock máximo objetivo" real — se usa 2× el mínimo
      // (el mismo límite del umbral amarillo) solo para que la barra de
      // progreso visual tenga un tope con sentido.
      max: Math.max(min * 2, 1),
      unit: etiquetaUnidadIngreso(unidadBase),
    };
  }), [productos, local]);

  // ─── VENCIMIENTOS_DATA-shaped ───────────────────────────────────────────
  const vencimientosData = useMemo(() => {
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    const lista = [];
    vencimientosPorProducto.forEach((info, idProducto) => {
      const producto = productosPorId.get(idProducto);
      if (!producto) return;
      const dias = diasHastaVencimiento(info.fechaVencimiento);
      if (dias === null || dias > 30) return; // solo lo cercano, igual que el mock original
      const unidadBase = unidadBaseDesdeUnidadMedida(producto.unidadMedida);
      lista.push({
        id: idProducto,
        nombre: producto.nombre,
        local,
        vence: dias,
        unit: dias === 1 ? 'día' : 'días',
        qty: convertirBaseAIngreso(producto.stockActual, unidadBase),
        unitQty: etiquetaUnidadIngreso(unidadBase),
        // Fecha de vencimiento de la última reposición (o, si el producto llegó
        // por transferencia, la de la reposición del local de origen).
        fechaVencimiento: formatFechaVencimiento(info.fechaVencimiento),
        // No usamos número de lote — mostramos la fecha de esa misma reposición.
        fechaReposicion: formatFechaCorta(info.fecha),
        // Alias de compatibilidad con vistas que aún lean `lote`.
        lote: formatFechaCorta(info.fecha),
      });
    });
    return lista;
  }, [vencimientosPorProducto, productos, local]);

  // ─── inventarioReciente-shaped ("ingresados hoy") ───────────────────────
  const inventarioReciente = useMemo(() => {
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    // Fecha LOCAL (toISOString da la fecha UTC: de noche en Chile ya sería "mañana").
    const ahora = new Date();
    const hoyKey = [
      ahora.getFullYear(),
      String(ahora.getMonth() + 1).padStart(2, '0'),
      String(ahora.getDate()).padStart(2, '0'),
    ].join('-');
    return movimientosHoy.map((mov) => {
      const producto = productosPorId.get(mov.idProducto);
      const unidadBase = producto ? unidadBaseDesdeUnidadMedida(producto.unidadMedida) : 'uds';
      return {
        id: mov.id,
        nombre: producto?.nombre ?? 'Producto',
        cantidad: convertirBaseAIngreso(mov.cantidad, unidadBase),
        unit: etiquetaUnidadIngreso(unidadBase),
        local,
        hora: formatHora(mov.fecha),
        fecha: hoyKey,
      };
    });
  }, [movimientosHoy, productos, local]);

  return { stockData, vencimientosData, inventarioReciente };
}