// controllers/RentabilidadControl.js
//
// Datos y cálculo del reporte de rentabilidad de UN local. No modifica nada:
// solo LEE historialStock (movimientos con costo) y se combina con el precio de
// venta del producto en ese local (locales/{local}/productos → precioVenta).
//
// Es una ESTIMACIÓN: supone que todo lo que ingresó al local en el período
// (reposiciones + transferencias recibidas), menos mermas y lo transferido a otros
// locales, se vende al precio de venta actual. No usa las ventas reales.
//
// Unidades (misma convención que el resto del sistema):
//  · cantidad, stock y valorUnitario de historialStock están en unidad BASE (g / ml / uds);
//    valorUnitario es $ por g, $ por ml o $ por unidad; valorTotal = cantidad × valorUnitario.
//  · precioVenta está en $ por kg / lt / unidad (como lo ve el usuario).

import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { HistorialStockModel } from '../models/HistorialStockModel';

const HISTORIAL_STOCK_COLLECTION = 'historialStock';

// ─── Período ────────────────────────────────────────────────────────────────

// "2026-11-02" → Date local (sin el desfase de zona horaria de new Date('YYYY-MM-DD'))
function fechaDesdeISO(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

// "2026-W45" (input type="week", semana ISO) → lunes de esa semana
function lunesDeSemanaISO(valor) {
  const [anio, sem] = String(valor).split('-W').map(Number);
  const cuatroEnero = new Date(anio, 0, 4);
  const diaSemana = cuatroEnero.getDay() || 7;
  const lunesSemana1 = new Date(cuatroEnero);
  lunesSemana1.setDate(cuatroEnero.getDate() - (diaSemana - 1));
  const lunes = new Date(lunesSemana1);
  lunes.setDate(lunesSemana1.getDate() + (sem - 1) * 7);
  return lunes;
}

/**
 * @returns {{ desde: Date, hasta: Date }}  intervalo [desde, hasta)
 */
export function rangoDelPeriodo({ periodo, fecha, semana, mes, anio }) {
  if (periodo === 'Semanal') {
    const desde = lunesDeSemanaISO(semana);
    const hasta = new Date(desde);
    hasta.setDate(desde.getDate() + 7);
    return { desde, hasta };
  }
  if (periodo === 'Mensual') {
    const desde = new Date(Number(anio), Number(mes) - 1, 1);
    const hasta = new Date(Number(anio), Number(mes), 1);
    return { desde, hasta };
  }
  const desde = fechaDesdeISO(fecha);
  const hasta = new Date(desde);
  hasta.setDate(desde.getDate() + 1);
  return { desde, hasta };
}

// ─── Lectura de movimientos ────────────────────────────────────────────────

const aDate = (f) => (f && typeof f.toDate === 'function' ? f.toDate() : null);

/**
 * Movimientos de stock de UN local dentro de [desde, hasta). Lectura única (no en vivo).
 *
 * Usa el mismo índice compuesto que "Ingresados hoy" (local Asc, fecha Desc). Si todavía
 * no existe, cae a una consulta solo por rango de fecha y filtra el local acá.
 */
export async function obtenerMovimientosPeriodo(local, desde, hasta) {
  const col = collection(db, HISTORIAL_STOCK_COLLECTION);
  const convertir = (docs) => docs
    .map((d) => ({ ...HistorialStockModel.fromFirebase(d.id, d.data()), fechaDate: aDate(d.data().fecha) }))
    .filter((m) => m.fechaDate);

  try {
    const snap = await getDocs(query(
      col,
      where('local', '==', local),
      where('fecha', '>=', desde),
      where('fecha', '<', hasta),
      orderBy('fecha', 'desc'),
    ));
    return convertir(snap.docs);
  } catch (error) {
    if (error?.code !== 'failed-precondition') throw error;
    console.warn('[rentabilidad] Falta el índice (local, fecha); se usa la consulta de respaldo.', error);
    const snap = await getDocs(query(
      col,
      where('fecha', '>=', desde),
      where('fecha', '<', hasta),
      orderBy('fecha', 'desc'),
    ));
    return convertir(snap.docs.filter((d) => d.data().local === local));
  }
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

const FACTOR_DISPLAY = { g: 1000, ml: 1000, uds: 1 };   // base → kg / lt / unidad

// Costo del movimiento: valorTotal, o cantidad × valorUnitario; null si no tiene costo.
function costoDe(m) {
  if (m.valorTotal !== null && m.valorTotal !== undefined) return m.valorTotal;
  if (m.valorUnitario !== null && m.valorUnitario !== undefined) return m.valorUnitario * m.cantidad;
  return null;
}

const nuevaFila = (idProducto) => ({
  idProducto,
  unidadesRepo: 0, costoRepo: 0,
  unidadesTransIn: 0, costoTransIn: 0,
  unidadesTransOut: 0, costoTransOut: 0,
  unidadesMerma: 0, costoMerma: 0,
  sinCosto: 0,   // movimientos que debían tener costo y no lo tienen
});

function acumular(fila, m) {
  const cantidad = Math.abs(Number(m.cantidad) || 0);
  const costo = costoDe(m);
  const tieneCosto = costo !== null;

  if (m.tipoMovimiento === 'reposicion') {
    fila.unidadesRepo += cantidad;
    fila.costoRepo += costo ?? 0;
    if (!tieneCosto) fila.sinCosto += 1;
  } else if (m.tipoMovimiento === 'transferencia') {
    // Mismo tipo para entrada y salida: la dirección se deduce del cambio de stock.
    const entrada = m.stockNuevo >= m.stockAnterior;
    if (entrada) {
      fila.unidadesTransIn += cantidad;
      fila.costoTransIn += costo ?? 0;
      if (!tieneCosto) fila.sinCosto += 1;
    } else {
      fila.unidadesTransOut += cantidad;
      fila.costoTransOut += costo ?? 0;
    }
  } else if (m.tipoMovimiento === 'merma') {
    fila.unidadesMerma += cantidad;
    fila.costoMerma += costo ?? 0;
  }
  // 'devolucion' (de cliente) no tiene costo y no cambia lo que se compró: se ignora.
}

function cerrarFila(fila, info) {
  const unidadBase = info.unidadBase;
  const factor = FACTOR_DISPLAY[unidadBase] ?? 1;
  const precioVenta = Number(info.precioVenta) || 0;

  const unidadesIngresadas = fila.unidadesRepo + fila.unidadesTransIn;
  const gastoBruto = fila.costoRepo + fila.costoTransIn;
  const gastoNeto = gastoBruto - fila.costoTransOut;   // lo transferido a otro local no es gasto de este
  const unidadesVendibles = Math.max(0, unidadesIngresadas - fila.unidadesMerma - fila.unidadesTransOut);

  const ingresoEstimado = (unidadesVendibles / factor) * precioVenta;
  const ganancia = ingresoEstimado - gastoNeto;

  // Costo unitario promedio ponderado de lo comprado/recibido, en $ por unidad BASE.
  const costoUnitarioBase = unidadesIngresadas > 0 && gastoBruto > 0 ? gastoBruto / unidadesIngresadas : null;
  const costoUnitario = costoUnitarioBase === null ? null : costoUnitarioBase * factor;   // $ por kg / lt / ud
  const margenUnitario = costoUnitario !== null && precioVenta > 0 ? precioVenta - costoUnitario : null;

  return {
    ...fila,
    ...info,
    // Hay ingresos/transferencias sin costo registrado: el resultado de este producto
    // quedaría inflado, así que NO entra en los totales (se avisa en el reporte).
    incompleto: fila.sinCosto > 0,
    factor,
    precioVenta,
    unidadesIngresadas, unidadesVendibles,
    gastoBruto, gastoNeto,
    ingresoEstimado, ganancia,
    margen: ingresoEstimado > 0 ? (ganancia / ingresoEstimado) * 100 : null,
    costoUnitario, margenUnitario,
  };
}

/**
 * @param {object[]} movimientos          historialStock del período (HistorialStockModel)
 * @param {Map<string, {nombre, unidadBase, precioVenta}>} infoProductos  por idProducto
 */
export function calcularRentabilidad(movimientos, infoProductos) {
  const porProducto = new Map();
  movimientos.forEach((m) => {
    if (!m.idProducto) return;
    if (!porProducto.has(m.idProducto)) porProducto.set(m.idProducto, nuevaFila(m.idProducto));
    acumular(porProducto.get(m.idProducto), m);
  });

  const filas = [...porProducto.values()]
    .map((fila) => {
      const info = infoProductos.get(fila.idProducto) ?? {};
      return cerrarFila(fila, {
        nombre: info.nombre ?? 'Producto sin datos en catálogo',
        unidadBase: info.unidadBase ?? 'uds',
        precioVenta: info.precioVenta ?? 0,
      });
    })
    // Solo productos que movieron costo o stock "vendible" en el período
    .filter((f) => f.gastoBruto > 0 || f.costoTransOut > 0 || f.costoMerma > 0 || f.unidadesIngresadas > 0)
    .sort((a, b) => (Number(a.incompleto) - Number(b.incompleto)) || (b.ganancia - a.ganancia));

  // Totales: solo productos con costo completo
  const validas = filas.filter((f) => !f.incompleto);
  const suma = (campo) => validas.reduce((t, f) => t + f[campo], 0);
  const gastoNeto = suma('gastoNeto');
  const ingresoEstimado = suma('ingresoEstimado');
  const ganancia = ingresoEstimado - gastoNeto;

  return {
    filas,
    totales: {
      costoRepo: suma('costoRepo'),
      costoTransIn: suma('costoTransIn'),
      costoTransOut: suma('costoTransOut'),
      costoMerma: suma('costoMerma'),
      gastoBruto: suma('gastoBruto'),
      gastoNeto,
      ingresoEstimado,
      ganancia,
      margen: ingresoEstimado > 0 ? (ganancia / ingresoEstimado) * 100 : 0,
      roi: gastoNeto > 0 ? (ganancia / gastoNeto) * 100 : 0,
      movimientosSinCosto: filas.reduce((t, f) => t + f.sinCosto, 0),
      productosIncompletos: filas.length - validas.length,
    },
  };
}

// ─── Evolución dentro del período ──────────────────────────────────────────

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Ganancia estimada por tramo: franjas de 3 h (diario), días (semanal) o días del mes (mensual).
 */
export function evolucionRentabilidad(movimientos, infoProductos, { periodo, desde, hasta }) {
  let etiquetas;
  let indiceDe;

  if (periodo === 'Diario') {
    etiquetas = Array.from({ length: 8 }, (_, i) => `${String(i * 3).padStart(2, '0')}-${String(i * 3 + 3).padStart(2, '0')} h`);
    indiceDe = (f) => Math.floor(f.getHours() / 3);
  } else if (periodo === 'Semanal') {
    etiquetas = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(desde);
      d.setDate(desde.getDate() + i);
      return `${DIAS_CORTOS[d.getDay()]} ${d.getDate()}`;
    });
    indiceDe = (f) => Math.floor((new Date(f.getFullYear(), f.getMonth(), f.getDate()) - desde) / 86400000);
  } else {
    const dias = Math.round((hasta - desde) / 86400000);
    etiquetas = Array.from({ length: dias }, (_, i) => String(i + 1));
    indiceDe = (f) => f.getDate() - 1;
  }

  const grupos = etiquetas.map(() => []);
  movimientos.forEach((m) => {
    const i = indiceDe(m.fechaDate);
    if (i >= 0 && i < grupos.length) grupos[i].push(m);
  });

  return etiquetas.map((etiqueta, i) => ({
    periodo: etiqueta,
    rentabilidad: Math.round(calcularRentabilidad(grupos[i], infoProductos).totales.ganancia),
  }));
}