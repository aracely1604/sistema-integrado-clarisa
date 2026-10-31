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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { suscribirProductosLocalEnriquecidos } from '../../controllers/RecetaLocalControl';
import { suscribirVencimientosProximos, suscribirMovimientosHoy } from '../../controllers/HistorialStockControl';
import { cambiarOfertaActivaProductoLocal, suscribirProductosLocal } from '../../controllers/LocalProductoControl';
import {
  unidadBaseDesdeUnidadMedida, convertirBaseAIngreso, etiquetaUnidadIngreso,
} from './gestionProductosData';
import { DIAS_VENCIMIENTO_MAX, getVencLevel, formatearPrecio } from './inventarioHelpers';
import { diasHastaVencimiento, formatFechaVencimiento } from './VencimientoUtils';

const DURACION_AVISO_MS = 8000;

// Referencias estables para "sin datos" (evitan re-renders y re-cálculos de más).
const SIN_PRODUCTOS = [];
const SIN_MOVIMIENTOS = [];
const SIN_VENCIMIENTOS = new Map();
const SIN_DATOS_LOCAL = new Map();

// Devuelve un número que sube en 1 cada vez que cambia el día (a medianoche, o
// al volver a la pestaña si el equipo estuvo dormido). Sirve como dependencia
// para recalcular "días para vencer" y volver a pedir "movimientos de hoy".
function useCambioDeDia() {
  const [dia, setDia] = useState(0);

  useEffect(() => {
    const clave = () => {
      const d = new Date();
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    let ultima = clave();
    let timer;

    const revisar = () => {
      const actual = clave();
      if (actual !== ultima) {
        ultima = actual;
        setDia((n) => n + 1);
      }
    };
    const programar = () => {
      const ahora = new Date();
      const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 0, 0, 1);
      timer = setTimeout(() => { revisar(); programar(); }, medianoche - ahora);
    };
    const alVolver = () => { if (document.visibilityState === 'visible') revisar(); };

    programar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);

  return dia;
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
 * @returns {{
 *   stockData: object[], vencimientosData: object[], inventarioReciente: object[],
 *   ofertasActivas: object[], productosLocal: object[],
 *   avisos: {id: string, texto: string}[], agregarAviso: (texto: string) => void,
 *   descartarAviso: (id: string) => void,
 * }}
 */
export function useInventarioAlertas(local) {
  // Cada dato se guarda junto al local al que pertenece: al cambiar de local, lo
  // del local anterior se ignora al instante (así nunca se activa una oferta o se
  // pinta una alerta con datos de otro local mientras llegan los nuevos).
  const [productosEst, setProductosEst] = useState({ local: null, lista: SIN_PRODUCTOS });
  const [datosLocalEst, setDatosLocalEst] = useState({ local: null, mapa: SIN_DATOS_LOCAL });
  const [vencEst, setVencEst] = useState({ local: null, mapa: SIN_VENCIMIENTOS });
  const [movEst, setMovEst] = useState({ local: null, lista: SIN_MOVIMIENTOS });
  const [avisos, setAvisos] = useState([]);
  const dia = useCambioDeDia();

  const productosEnriquecidos = productosEst.local === local ? productosEst.lista : SIN_PRODUCTOS;
  const datosLocal = datosLocalEst.local === local ? datosLocalEst.mapa : SIN_DATOS_LOCAL;

  // La lista enriquecida (nombre, unidad, stock...) no trae precio ni oferta, así que esos
  // campos se leen DIRECTO del producto del local (locales/{local}/productos/{id}) y se unen por id.
  const productos = useMemo(() => productosEnriquecidos.map((p) => {
    const propio = datosLocal.get(p.id);
    return propio
      ? { ...p, precioVenta: propio.precioVenta, oferta: propio.oferta, ofertaActiva: propio.ofertaActiva }
      : p;
  }), [productosEnriquecidos, datosLocal]);
  const vencimientosPorProducto = vencEst.local === local ? vencEst.mapa : SIN_VENCIMIENTOS;
  const movimientosHoy = movEst.local === local ? movEst.lista : SIN_MOVIMIENTOS;

  // ─── Avisos flotantes (ofertas activadas, mermas registradas, etc.) ───────
  const descartarAviso = useCallback((id) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const agregarAviso = useCallback((texto) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setAvisos((prev) => [...prev, { id, texto }]);
    setTimeout(() => descartarAviso(id), DURACION_AVISO_MS);
  }, [descartarAviso]);

  // Productos del local (stock en vivo), ya enriquecidos con nombre/unidad
  // del catálogo global — misma función que ya usa la estimación de recetas.
  useEffect(() => {
    const unsubscribe = suscribirProductosLocalEnriquecidos(local, (lista) => setProductosEst({ local, lista }));
    return () => unsubscribe?.();
  }, [local]);

  // Precio de venta y oferta de cada producto en este local (en vivo).
  useEffect(() => {
    const unsubscribe = suscribirProductosLocal(local, (lista) => {
      setDatosLocalEst({ local, mapa: new Map(lista.map((p) => [p.idProducto, p])) });
    });
    return () => unsubscribe?.();
  }, [local]);

  // "Próximo vencimiento" por producto: la reposición más reciente con
  // fecha de vencimiento (sin lotes, es una aproximación — ver nota en
  // HistorialStockControl.js).
  useEffect(() => {
    const unsubscribe = suscribirVencimientosProximos(local, (mapa) => setVencEst({ local, mapa }));
    return () => unsubscribe?.();
  }, [local]);

  // Movimientos de hoy, cualquier tipo. Depende de `dia` para volver a pedir
  // "lo de hoy" cuando pasa la medianoche (el rango de fechas se fija al suscribir).
  useEffect(() => {
    const unsubscribe = suscribirMovimientosHoy(local, (lista) => setMovEst({ local, lista }));
    return () => unsubscribe?.();
  }, [local, dia]);

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
  // `dia` está en las dependencias: a medianoche los días restantes se recalculan solos.
  const vencimientosData = useMemo(() => {
    const productosPorId = new Map(productos.map((p) => [p.id, p]));
    const lista = [];
    vencimientosPorProducto.forEach((info, idProducto) => {
      const producto = productosPorId.get(idProducto);
      if (!producto) return;
      // Sin stock no hay nada que vender ni que retirar: no se muestra.
      if (!(Number(producto.stockActual) > 0)) return;
      const dias = diasHastaVencimiento(info.fechaVencimiento);
      // Solo lo cercano (o ya vencido: días negativos).
      if (dias === null || dias > DIAS_VENCIMIENTO_MAX) return;
      const unidadBase = unidadBaseDesdeUnidadMedida(producto.unidadMedida);
      lista.push({
        id: idProducto,
        nombre: producto.nombre,
        local,
        vence: dias,
        unit: dias === 1 ? 'día' : 'días',
        qty: convertirBaseAIngreso(producto.stockActual, unidadBase),
        unitQty: etiquetaUnidadIngreso(unidadBase),
        unidadBase,
        // Precios del producto EN ESTE LOCAL (oferta: 0 = sin precio de oferta definido).
        precioVenta: Number(producto.precioVenta) || 0,
        oferta: Number(producto.oferta) || 0,
        ofertaActiva: Boolean(producto.ofertaActiva),
        // Fecha de vencimiento de la última reposición (o, si el producto llegó
        // por transferencia, la de la reposición del local de origen).
        fechaVencimiento: formatFechaVencimiento(info.fechaVencimiento),
        // Tal cual está guardada (para registrarla en la merma).
        fechaVencimientoRaw: info.fechaVencimiento,
        // No usamos número de lote — mostramos la fecha de esa misma reposición.
        fechaReposicion: formatFechaCorta(info.fecha),
        // Alias de compatibilidad con vistas que aún lean `lote`.
        lote: formatFechaCorta(info.fecha),
      });
    });
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vencimientosPorProducto, productos, local, dia]);

  // ─── Productos con la oferta activa en este local (con stock) ──────────────
  const ofertasActivas = useMemo(() => productos
    .filter((p) => p.ofertaActiva && Number(p.oferta) > 0 && Number(p.stockActual) > 0)
    .map((p) => {
      const unidadBase = unidadBaseDesdeUnidadMedida(p.unidadMedida);
      return {
        id: p.id,
        nombre: p.nombre,
        local,
        precioVenta: Number(p.precioVenta) || 0,
        oferta: Number(p.oferta) || 0,
        qty: convertirBaseAIngreso(p.stockActual, unidadBase),
        unitQty: etiquetaUnidadIngreso(unidadBase),
      };
    }), [productos, local]);

  // ─── Oferta automática para productos críticos ──────────────────────────
  // Un producto crítico (vence hoy o en DIAS_CRITICO días o menos) con precio de
  // oferta definido pasa solo a ofertaActiva = true. Se intenta una sola vez por
  // producto y sesión: si falla (o alguien la desactiva a mano) no se reintenta
  // en bucle. Los ya vencidos no entran: para ellos corresponde retirar el stock.
  const ofertasIntentadas = useRef(new Set());
  useEffect(() => {
    vencimientosData.forEach((item) => {
      if (getVencLevel(item.vence) !== 'critical') return;
      if (item.ofertaActiva || !(item.oferta > 0)) return;

      const clave = `${item.local}:${item.id}`;
      if (ofertasIntentadas.current.has(clave)) return;
      ofertasIntentadas.current.add(clave);

      cambiarOfertaActivaProductoLocal(item.local, item.id, true)
        .then(() => agregarAviso(
          `Oferta activada automáticamente: ${item.nombre} ${item.vence === 0 ? 'vence hoy' : `vence en ${item.vence} ${item.unit}`} ` +
          `y ahora se vende a ${formatearPrecio(item.oferta)} (antes ${formatearPrecio(item.precioVenta)}).`,
        ))
        .catch((error) => console.error(`[oferta automática] No se pudo activar la oferta de "${item.nombre}":`, error));
    });
  }, [vencimientosData, agregarAviso]);

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
    return movimientosHoy
      // La merma es una SALIDA de stock, no un ingreso.
      .filter((mov) => mov.tipoMovimiento !== 'merma')
      .map((mov) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientosHoy, productos, local, dia]);

  return {
    stockData, vencimientosData, inventarioReciente, ofertasActivas,
    productosLocal: productos, // productos del local con su stock en vivo (base: g / ml / uds)
    avisos, agregarAviso, descartarAviso,
  };
}