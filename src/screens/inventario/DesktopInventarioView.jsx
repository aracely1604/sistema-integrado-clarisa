import { useEffect, useState } from 'react';
import { FiChevronDown, FiCheckCircle, FiInbox } from 'react-icons/fi';

import { LOCAL_LABELS, HOY_IDX } from './inventarioData';
import { getLevel, getVencLevel, nextVisitOffset, formatearPrecioCorto } from './inventarioHelpers';

import { Badge } from './InventarioShared';
import {
  Subseccion, FilaStockConVencimiento, TituloConAyuda, DetalleMetricas, DetalleRecetas, resumenMetricasLocal,
} from './AlertasInventarioShared';
import { useRecetasLocal } from './useRecetasLocal';
import { StockAlertCard, VencimientoCard, ProductoRecienteCard, CalendarioSemanal } from './AlertCards';
import { FloatingKPIList, FloatingSheet, FloatingReporte, FloatingVisitanHoy } from './FloatingSheet';
import {
  ModalDetalleStock, ModalDetalleVencimiento,
  ModalDetalleProveedor, ModalNuevoProveedor,
} from './DetalleModals';

import '../../css/DesktopInventarioView.css';

// ─────────────────────────────────────────────────────────────────────────────
// VISTA DESKTOP · MODO INVENTARIO
// ─────────────────────────────────────────────────────────────────────────────
export default function DesktopInventarioView({
  activeLocal,
  alertas,   // resultado de useInventarioAlertas(activeLocal): se llama UNA vez, en DesktopLayout
  proveedores,
  productosData,
  inventarioReciente,
  modalStock,     setModalStock,
  modalVenc,      setModalVenc,
  modalProv,      setModalProv,
  modalNuevoProv, setModalNuevoProv,
  handleGuardarProveedor,
  setProductosData,
  visitanHoyVisible,        setVisitanHoyVisible,
  visitanHoyDismissedToday, setVisitanHoyDismissedToday,
}) {
  const [kpiMetricas,    setKpiMetricas]    = useState(false);
  const [kpiRecetas,     setKpiRecetas]     = useState(false);
  const [kpiProveedores, setKpiProveedores] = useState(false);
  const [agendaHoyModal, setAgendaHoyModal] = useState(false);
  const [reporteModal,   setReporteModal]   = useState(false);

  // ── Stock / vencimiento / ingresados hoy: EN VIVO desde Firestore ──
  // El hook ya entrega todo filtrado al local activo, con la misma forma
  // de campos que usaba el mock (qty, min, max, unit, vence, lote, etc.)
  const {
    stockData: stockLocal, vencimientosData: vencLocal, inventarioReciente: recienteLocal,
    ofertasActivas, productosLocal, agregarAviso,
  } = alertas;

  // Recetas REALES del local (recetario global + asignaciones), con el stock en vivo.
  const { resumen: resumenRecetas, cargando: cargandoRecetas } = useRecetasLocal(activeLocal, productosLocal);

  // El modal de vencimiento se alimenta de la lista EN VIVO (no de la copia que se
  // guardó al hacer clic): así refleja al instante que la oferta quedó activa, y se
  // cierra solo cuando el producto sale de la lista (p. ej. tras eliminar su stock).
  const itemVencimiento = modalVenc ? (vencLocal.find(i => i.id === modalVenc.id) ?? null) : null;
  useEffect(() => {
    if (modalVenc && !itemVencimiento) setModalVenc(null);
  }, [modalVenc, itemVencimiento, setModalVenc]);

  // ── Derivados ──
  const criticos       = stockLocal.filter(i => ['critical', 'out'].includes(getLevel(i)));
  const bajos          = stockLocal.filter(i => getLevel(i) === 'low');
  // El hook ya entrega solo lo que vence en ≤ 30 días (o ya venció), del más urgente al menos.
  const metricas       = resumenMetricasLocal(vencLocal, ofertasActivas);
  const vencimientosOrdenados = [...vencLocal].sort((a, b) => a.vence - b.vence);
  const vencidos       = vencimientosOrdenados.filter(i => getVencLevel(i.vence) === 'expired');
  const porVencer      = vencimientosOrdenados.filter(i => getVencLevel(i.vence) !== 'expired');
  const provLocal      = proveedores.filter(p => p.locales.includes(activeLocal));
  const provHoy        = provLocal.filter(p => p.dias.includes(HOY_IDX));
  const provProximos   = [...provLocal].sort((a, b) => nextVisitOffset(a.dias) - nextVisitOffset(b.dias));
  const totalProvLocal = provLocal.length;
  // Productos en alerta de stock que además están vencidos (reposición bloqueada hasta
  // eliminar su stock) o por vencer (solo se recomienda priorizar su venta al reponer).
  const vencPorId = new Map(vencLocal.map(i => [i.id, i]));

  // Ítem del modal de detalle de stock, en vivo y con su vencimiento (si lo tiene), para que
  // el modal muestre la recomendación o el aviso de reposición no disponible.
  const itemStockModal = modalStock
    ? { ...(stockLocal.find(i => i.id === modalStock.id) ?? modalStock), venc: vencPorId.get(modalStock.id) ?? null }
    : null;
  const renderAlertaStock = (item) => {
    const card = <StockAlertCard item={item} onVerDetalle={setModalStock} compact />;
    const venc = vencPorId.get(item.id);
    if (!venc) return <div key={item.id}>{card}</div>;
    return (
      <FilaStockConVencimiento
        key={item.id}
        vencido={getVencLevel(venc.vence) === 'expired'}
        onAbrir={() => setModalStock(item)}
      >
        {card}
      </FilaStockConVencimiento>
    );
  };


  return (
    <>
      <div className="div-scroll">

        {/* ── Fila KPIs + agenda ── */}
        <div className="div-kpi-row">

          {/* KPI Métricas */}
          <button data-tour="inv-metricas" type="button" onClick={() => setKpiMetricas(true)} className="div-kpi-card">
            <span className="div-section-label">MÉTRICAS</span>
            <div className="div-metric-grid">
              {[
                { label: 'Stock bajo',      value: criticos.length + bajos.length, color: criticos.length > 0 ? '#E24B4A' : '#BA7517' },
                { label: 'En riesgo',       value: formatearPrecioCorto(metricas.valorRiesgo),
                  color: metricas.valorVencido > 0 ? '#E24B4A' : metricas.valorPorVencer > 0 ? '#BA7517' : 'var(--c-textPrimary)' },
                { label: 'Ofertas',         value: metricas.nOfertas, color: metricas.nOfertas > 0 ? '#639922' : 'var(--c-textPrimary)' },
              ].map((m, i) => (
                <div key={i} className="div-metric-card">
                  <span className="div-metric-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.label}</span>
                  <span
                    className="div-metric-value"
                    style={{
                      color: m.color, whiteSpace: 'nowrap', maxWidth: '100%',
                      // montos ($12.500, $1,3 M): se achican un poco en vez de pisar al vecino
                      ...(typeof m.value === 'string' ? { fontSize: 'clamp(12px, 1.6vw, 17px)' } : null),
                    }}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="div-kpi-tap">
              <FiChevronDown size={12} />
              <span>Ver detalle</span>
            </div>
          </button>

          {/* KPI Recetas */}
          <button data-tour="inv-recetas" type="button" onClick={() => setKpiRecetas(true)} className="div-kpi-card">
            <span className="div-section-label">RECETAS</span>
            <div className="div-metric-grid">
              {[
                { label: 'Total', value: cargandoRecetas ? '…' : resumenRecetas.total, color: 'var(--c-textPrimary)' },
                { label: 'Preparables', value: cargandoRecetas ? '…' : `${resumenRecetas.preparables}/${resumenRecetas.activas}`,
                  color: resumenRecetas.activas > resumenRecetas.preparables ? '#E24B4A' : '#639922' },
                { label: 'Más usado', value: cargandoRecetas ? '…' : (resumenRecetas.ingredienteClave?.nombre ?? '—'),
                  color: 'var(--c-textPrimary)' },
              ].map((m, i) => (
                <div key={i} className="div-metric-card">
                  <span className="div-metric-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.label}</span>
                  <span
                    className="div-metric-value"
                    style={{
                      color: m.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                      // textos largos (nombre de ingrediente): más chicos, con "…" si aun así no caben
                      ...(String(m.value).length > 5 ? { fontSize: 'clamp(12px, 1.6vw, 17px)' } : null),
                    }}
                  >
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
            <div className="div-kpi-tap">
              <FiChevronDown size={12} />
              <span>Ver detalle</span>
            </div>
          </button>

          {/* KPI Proveedores */}
          <button data-tour="inv-proveedores" type="button" onClick={() => setKpiProveedores(true)} className="div-kpi-card">
            <span className="div-section-label">PROVEEDORES</span>
            <div className="div-metric-grid">
              {[
                { label: 'Total',       value: totalProvLocal, color: 'var(--c-textPrimary)' },
                { label: 'Visitan hoy', value: provHoy.length, color: provHoy.length > 0 ? '#BA7517' : 'var(--c-textPrimary)' },
              ].map((m, i) => (
                <div key={i} className="div-metric-card">
                  <span className="div-metric-label">{m.label}</span>
                  <span className="div-metric-value" style={{ color: m.color }}>{m.value}</span>
                </div>
              ))}
            </div>
            <div className="div-kpi-tap">
              <FiChevronDown size={12} />
              <span>Ver próximas visitas</span>
            </div>
          </button>

          {/* Agenda semanal (no es botón: el click vive en cada día del calendario) */}
          <div data-tour="inv-agenda" className="div-kpi-card div-kpi-agenda">
            <span className="div-section-label" style={{ marginBottom: 8, display: 'block' }}>AGENDA SEMANAL</span>
            <CalendarioSemanal
              proveedores={provLocal}
              compact
              onDiaPress={() => setAgendaHoyModal(true)}
            />
            <div className="div-kpi-agenda-hint">
              Presiona en el día de hoy para mas información
            </div>
          </div>

        </div>

        {/* ── 3 columnas inferiores ── */}
        <div className="div-content-area">

          {/* Col 1: Stock a reponer (crítico arriba, bajo abajo) */}
          <div data-tour="inv-stock-critico" className="div-col3">
            <div className="div-card">
              <div className="div-card-header">
                <TituloConAyuda titulo="STOCK A REPONER" />
                <Badge label={`${criticos.length + bajos.length} productos`} level={criticos.length > 0 ? 'critical' : 'low'} />
              </div>
              {criticos.length === 0 && bajos.length === 0 ? (
                <div className="div-empty-card">
                  <FiCheckCircle size={18} color="#639922" />
                  <span>Sin alertas en {LOCAL_LABELS[activeLocal]}</span>
                </div>
              ) : (
                <>
                  <Subseccion titulo="Stock crítico" cantidad={criticos.length} color="#E24B4A" textoVacio="Sin productos en nivel crítico">
                    {criticos.map(renderAlertaStock)}
                  </Subseccion>
                  <Subseccion titulo="Stock bajo" cantidad={bajos.length} color="#BA7517" textoVacio="Sin productos con stock bajo">
                    {bajos.map(renderAlertaStock)}
                  </Subseccion>
                </>
              )}
            </div>
          </div>

          {/* Col 2: Control de vencimientos (vencidos arriba, por vencer abajo) */}
          <div data-tour="inv-por-vencer" className="div-col3">
            <div className="div-card">
              <div className="div-card-header">
                <TituloConAyuda titulo="CONTROL DE VENCIMIENTOS" />
                <Badge
                  label={`${vencLocal.length} productos`}
                  level={vencidos.length > 0 ? 'critical' : porVencer.length > 0 ? 'warning' : 'ok'}
                />
              </div>
              {vencLocal.length === 0 ? (
                <div className="div-empty-card">
                  <FiCheckCircle size={18} color="#639922" />
                  <span>Sin vencimientos próximos</span>
                </div>
              ) : (
                <>
                  <Subseccion titulo="Vencidos" cantidad={vencidos.length} color="#E24B4A" textoVacio="Sin productos vencidos">
                    {vencidos.map(item => (
                      <VencimientoCard key={item.id} item={item} onVerDetalle={setModalVenc} compact />
                    ))}
                  </Subseccion>
                  <Subseccion titulo="Por vencer" cantidad={porVencer.length} color="#BA7517" textoVacio="Sin productos por vencer">
                    {porVencer.map(item => (
                      <VencimientoCard key={item.id} item={item} onVerDetalle={setModalVenc} compact />
                    ))}
                  </Subseccion>
                </>
              )}
            </div>
          </div>

          {/* Col 3: Productos recientes */}
          <div data-tour="inv-ingresados" className="div-col3">
            <div className="div-card">
              <div className="div-card-header">
                <span className="div-section-label">INGRESADOS HOY</span>
                <Badge label={`${recienteLocal.length}`} level="info" />
              </div>
              {recienteLocal.length === 0 ? (
                <div className="div-empty-card">
                  <FiInbox size={18} color="var(--c-placeholder, #B0ADA8)" />
                  <span>Sin ingresos hoy</span>
                </div>
              ) : (
                recienteLocal.map(item => <ProductoRecienteCard key={item.id} item={item} />)
              )}
            </div>
          </div>

        </div>

        <div style={{ height: 24 }} />
      </div>

      {/* ── Modales de detalle ── */}
      <ModalDetalleStock
        item={itemStockModal}
        onClose={() => setModalStock(null)}
        onVerVencimiento={(venc) => { setModalStock(null); setModalVenc(venc); }}
      />
      <ModalDetalleVencimiento item={itemVencimiento} onClose={() => setModalVenc(null)} onAviso={agregarAviso} />
      <ModalNuevoProveedor     visible={modalNuevoProv} onClose={() => setModalNuevoProv(false)} onGuardar={handleGuardarProveedor} localFijo={activeLocal} />

      {/* ── KPI Flotantes ── */}
      <FloatingSheet
        visible={kpiMetricas}
        onClose={() => setKpiMetricas(false)}
        title={`Valor en riesgo y ofertas · ${LOCAL_LABELS[activeLocal]}`}
      >
        <DetalleMetricas vencLocal={vencLocal} ofertasActivas={ofertasActivas} />
      </FloatingSheet>

      <FloatingSheet
        visible={kpiRecetas}
        onClose={() => setKpiRecetas(false)}
        title={`Recetas · ${LOCAL_LABELS[activeLocal]}`}
      >
        <DetalleRecetas resumen={resumenRecetas} localLabel={LOCAL_LABELS[activeLocal]} />
      </FloatingSheet>

      <FloatingKPIList
        visible={kpiProveedores}
        onClose={() => setKpiProveedores(false)}
        title={`Próximas visitas · ${LOCAL_LABELS[activeLocal]}`}
        items={provProximos}
        renderItem={p => (
          <button type="button" key={p.id} onClick={() => setModalProv(p)} className="div-kpi-prov-row">
            <span className="div-kpi-prov-avatar">{p.initials}</span>
            <span className="div-kpi-prov-info">
              <span className="div-kpi-prov-nombre">{p.nombre}</span>
              <span className="div-kpi-prov-empresa">{p.empresa}</span>
              <span className="div-kpi-prov-hint">Presiona para mas información</span>
            </span>
            <Badge label={`En ${nextVisitOffset(p.dias)} días`} level="info" />
          </button>
        )}
      />

      {/* Flotante Agenda HOY */}
      <FloatingSheet
        visible={agendaHoyModal}
        onClose={() => setAgendaHoyModal(false)}
        title="Proveedores que visitan hoy"
      >
        {provHoy.length === 0
          ? <p className="div-agenda-empty">Ningún proveedor visita hoy</p>
          : provHoy.map(p => (
              <button type="button" key={p.id} onClick={() => setModalProv(p)} className="div-kpi-prov-row" style={{ marginBottom: 10 }}>
                <span className="div-kpi-prov-avatar">{p.initials}</span>
                <span className="div-kpi-prov-info">
                  <span className="div-kpi-prov-nombre">{p.nombre}</span>
                  <span className="div-kpi-prov-empresa">{p.empresa}</span>
                  <span className="div-kpi-prov-hint">Presiona para mas información</span>
                </span>
              </button>
            ))
        }
      </FloatingSheet>

      {/* Reporte flotante */}
      <FloatingReporte
        visible={reporteModal}
        onClose={() => setReporteModal(false)}
        activeLocal={activeLocal}
        localLabels={LOCAL_LABELS}
      />

      {/* Recordatorio de proveedores al entrar */}
      <FloatingVisitanHoy
        visible={visitanHoyVisible}
        onClose={() => setVisitanHoyVisible(false)}
        onNoMostrarHoy={() => {
          setVisitanHoyVisible(false);
          setVisitanHoyDismissedToday(true);
        }}
        provHoy={provHoy}
      />

      {/*
        Modal de detalle de proveedor: se renderiza AL FINAL, después de
        FloatingKPIList / FloatingSheet, a propósito. Estos modales comparten
        el mismo z-index (mismo overlay/clase), así que cuando dos elementos
        position:fixed tienen igual z-index, gana el que está más abajo en el
        DOM. Si este modal se declara antes que la lista de proveedores,
        queda "detrás" al abrirse desde ahí. Al ir al final, siempre se
        pinta por encima sin importar desde qué lista/tarjeta se abrió.
      */}
      <ModalDetalleProveedor proveedor={modalProv} onClose={() => setModalProv(null)} />
    </>
  );
}