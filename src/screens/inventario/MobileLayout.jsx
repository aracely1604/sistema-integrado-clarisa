import { useState, useEffect } from 'react';
import {
  FiMenu, FiBox, FiBookOpen, FiTruck, FiArrowRight,
  FiCheckCircle, FiUserPlus, FiFileText, FiLogOut,
  FiPlusCircle,
} from 'react-icons/fi';

import { useAuth, localesAsignados } from '../../controllers/AuthContext';
import { logoutEmpleado } from '../../controllers/AuthControl';
import { useTheme } from '../../context/ThemeContext';
import SessionWarningBanner from '../../controllers/SessionWarningBanner';
import GestionProductosModal from './GestionProductosModal';
import GestionRecetasModal from './GestionRecetasModal';

import { Badge, ToggleSwitch } from './InventarioShared';
import {
  StockAlertCard, VencimientoCard, ProductoRecienteCard,
  ProveedorCard, CalendarioSemanal,
} from './AlertCards';
import { FloatingKPIList, FloatingSheet, FloatingReporte, FloatingVisitanHoy } from './FloatingSheet';
import {
  ModalDetalleStock, ModalDetalleVencimiento,
  ModalDetalleProveedor, ModalNuevoProveedor, ModalGestionProveedores,
  ModalRegistrarProductoGlobal, ModalRecetaGlobal, AvisosFlotantes,
} from './DetalleModals';
import {
  Subseccion, FilaStockConVencimiento, TituloConAyuda, resumenEstadoLocal,
  DetalleMetricas, DetalleRecetas, resumenMetricasLocal, colorPreparables, textoUnidades, textoLimitante,
} from './AlertasInventarioShared';
import { useRecetasLocal } from './useRecetasLocal';
import {
  LOCAL_LABELS, LOCAL_COLORS, LOCALES_LIST, HOY_IDX,
} from './inventarioData';
import { getLevel, getVencLevel, nextVisitOffset, formatearPrecioCorto } from './inventarioHelpers';
import { useInventarioAlertas } from './useInventarioAlertas';
import { LOCAL_ICON_COMPONENTS } from './localIcons';

import '../../css/MobileLayout.css';

export default function MobileLayout({ state, actions }) {
  const { usuario } = useAuth();
  const { colors, isDark, toggle } = useTheme();

  const [drawerOpen,      setDrawerOpen]      = useState(false);
  const [agendaHoyModal,  setAgendaHoyModal]  = useState(false);
  const [kpiMetricas,     setKpiMetricas]     = useState(false);
  const [kpiRecetas,      setKpiRecetas]      = useState(false);
  const [kpiProveedores,  setKpiProveedores]  = useState(false);
  const [reporteModal,    setReporteModal]    = useState(false);
  const [proveedoresGlobalVisible, setProveedoresGlobalVisible] = useState(false);
  // Local que disparó el modal de nuevo proveedor o reporte desde el drawer
  const [localDelModal,   setLocalDelModal]   = useState(null);
  // Modal del nodo global de productos (datos base: nombre, categoría, código, unidad)
  const [modalProductoGlobal, setModalProductoGlobal] = useState(false);
  // Modal de creación de receta global (plantilla única para todo el sistema)
  const [modalRecetaGlobalVisible, setModalRecetaGlobalVisible] = useState(false);
  // Modal de gestión de productos: { local, autoAbrirRegistro } o null si está cerrado
  const [modalProductosGestion, setModalProductosGestion] = useState(null);
  // Modal de gestión de recetas: { local } o null si está cerrado
  const [modalRecetasGestion,   setModalRecetasGestion]   = useState(null);

  const {
    activeLocal, activeTab, proveedores, modalStock, modalVenc, modalProv, modalNuevoProv,
    productosData, inventarioReciente,
    visitanHoyVisible, visitanHoyDismissedToday,
  } = state;
  const {
    setActiveLocal, setActiveTab, setModalStock, setModalVenc, setModalProv,
    setModalNuevoProv, handleGuardarProveedor, setProductosData,
    setVisitanHoyVisible, setVisitanHoyDismissedToday,
  } = actions;

  // ── Permisos según rol ──
  const esCajero        = usuario?.rol === 'cajero';
  const localesUsuario  = localesAsignados(usuario?.localAsignado || usuario?.local);
  const localesVisibles = LOCALES_LIST.filter(l => localesUsuario.includes(l));

  // Iniciales y rol para el drawer
  const inicialesUsuario = (usuario?.nombre ?? '')
    .split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  const rolLabel = {
    admin:   'Administrador',
    cajero:  'Cajero',
    gerente: 'Gerente',
  }[usuario?.rol] ?? (usuario?.rol ?? '');

  // Stock / vencimiento / ingresados hoy: EN VIVO desde Firestore
  const {
    stockData: stockLocal, vencimientosData: vencLocal, inventarioReciente: recienteLocal,
    ofertasActivas, productosLocal, avisos, agregarAviso, descartarAviso,
  } = useInventarioAlertas(activeLocal);

  // Recetas REALES del local (recetario global + asignaciones), con el stock en vivo.
  const { resumen: resumenRecetas, cargando: cargandoRecetas } = useRecetasLocal(activeLocal, productosLocal);

  // ── Derivados ──
  const criticos       = stockLocal.filter(i => ['critical', 'out'].includes(getLevel(i)));
  const bajos          = stockLocal.filter(i => getLevel(i) === 'low');
  // Del más urgente al menos: primero los ya vencidos, después los que están por vencer.
  const vencimientosOrdenados = [...vencLocal].sort((a, b) => a.vence - b.vence);
  const vencidos       = vencimientosOrdenados.filter(i => getVencLevel(i.vence) === 'expired');
  const porVencer      = vencimientosOrdenados.filter(i => getVencLevel(i.vence) !== 'expired');
  const estadoLocal    = resumenEstadoLocal(stockLocal, vencLocal);
  const metricas       = resumenMetricasLocal(vencLocal, ofertasActivas);

  // Productos en alerta de stock que además están vencidos (reposición bloqueada hasta
  // eliminar su stock) o por vencer (solo se recomienda priorizar su venta al reponer).
  const vencPorId = new Map(vencLocal.map(i => [i.id, i]));

  // Ítems de los modales de detalle, EN VIVO (no la copia que se guardó al presionar):
  // reflejan al instante una oferta activada y se cierran solos si el producto sale de la lista.
  const itemVencimiento = modalVenc ? (vencLocal.find(i => i.id === modalVenc.id) ?? null) : null;
  const itemStockModal  = modalStock
    ? { ...(stockLocal.find(i => i.id === modalStock.id) ?? modalStock), venc: vencPorId.get(modalStock.id) ?? null }
    : null;
  useEffect(() => {
    if (modalVenc && !itemVencimiento) setModalVenc(null);
  }, [modalVenc, itemVencimiento, setModalVenc]);

  const renderAlertaStock = (item) => {
    const card = <StockAlertCard item={item} onVerDetalle={setModalStock} />;
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
  const provLocal      = proveedores.filter(p => p.locales.includes(activeLocal));
  const provHoy        = provLocal.filter(p => p.dias.includes(HOY_IDX));
  const provProximos   = [...provLocal].sort((a, b) => nextVisitOffset(a.dias) - nextVisitOffset(b.dias));

  // Tabs: cajero ve Inventario y Proveedores
  const TABS = esCajero
    ? [
        { id: 'inventario',  label: 'Inventario',  icon: FiBox },
        { id: 'proveedores', label: 'Proveedores', icon: FiTruck },
      ]
    : [
        { id: 'inventario',  label: 'Inventario',  icon: FiBox },
        { id: 'recetas',     label: 'Recetas',     icon: FiBookOpen },
        { id: 'proveedores', label: 'Proveedores', icon: FiTruck },
      ];

  // Locales del selector de píldoras: solo los asignados al usuario
  const LOCALES_KPI = localesVisibles.map(id => ({ id, label: LOCAL_LABELS[id] }));

  useEffect(() => {
    if (provHoy.length > 0 && !visitanHoyDismissedToday) {
      setVisitanHoyVisible(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocal]);

  // Variables CSS de tema para todo el layout
  const themeVars = {
    '--c-bg': colors.bg,
    '--c-surface': colors.surface,
    '--c-surface2': colors.surface2,
    '--c-border': colors.border,
    '--c-textPrimary': colors.textPrimary,
    '--c-textSecondary': colors.textSecondary,
    '--c-placeholder': colors.placeholder,
    '--c-btnBg': colors.btnBg,
    '--c-btnText': colors.btnText,
    '--c-accentText': colors.accentText,
  };

  return (
    <div className="ml-screen" style={themeVars}>

      {/* Overlay drawer */}
      <div
        className={`ml-drawer-overlay ${drawerOpen ? 'ml-drawer-overlay-open' : ''}`}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      {/* ── Drawer ── */}
      <div className={`ml-drawer ${drawerOpen ? 'ml-drawer-open' : 'ml-drawer-closed'}`} aria-hidden={!drawerOpen}>
        {/* Perfil dinámico */}
        <div className="ml-drawer-profile">
          <div className="ml-drawer-avatar">{inicialesUsuario}</div>
          <p className="ml-drawer-name">{usuario?.nombre ?? ''}</p>
          <p className="ml-drawer-role">{rolLabel}</p>
          <span className="ml-drawer-local-badge">
            {localesVisibles.length === 1 ? LOCAL_LABELS[localesVisibles[0]] : `${localesVisibles.length} locales`}
          </span>
        </div>

        <div className="ml-drawer-scroll">

          {/* LOCAL · acciones del local seleccionado (el menú NO se cierra al presionar) */}
          {!esCajero && (
            <div className="ml-drawer-section">
              <p className="ml-drawer-section-label">LOCAL · {LOCAL_LABELS[activeLocal].toUpperCase()}</p>
              <button
                type="button"
                className="ml-drawer-btn"
                onClick={() => {
                  setLocalDelModal(activeLocal);
                  setReporteModal(true);
                }}
              >
                <FiFileText size={15} />
                <span>Reporte</span>
              </button>
            </div>
          )}

          {/* GESTIÓN GLOBAL — igual que el menú inferior de la versión desktop */}
          <div className="ml-drawer-section">
            <p className="ml-drawer-section-label">GESTIÓN GLOBAL</p>

            <button
              type="button"
              className="ml-drawer-btn"
              onClick={() => setModalProductoGlobal(true)}
            >
              <FiPlusCircle size={15} />
              <span>Registrar producto</span>
            </button>

            {!esCajero && (
              <button
                type="button"
                className="ml-drawer-btn"
                onClick={() => setModalRecetaGlobalVisible(true)}
              >
                <FiBookOpen size={15} />
                <span>Gestionar recetas</span>
              </button>
            )}

            <button
              type="button"
              className="ml-drawer-btn"
              onClick={() => setProveedoresGlobalVisible(true)}
            >
              <FiUserPlus size={15} />
              <span>Gestionar proveedores</span>
            </button>
          </div>
        </div>

        <div className="ml-drawer-bottom">
          <div className="ml-drawer-btn ml-drawer-btn-between">
            <span className="ml-drawer-btn-label">{isDark ? '🌙' : '☀️'} Modo oscuro</span>
            <ToggleSwitch value={isDark} onToggle={toggle} />
          </div>
          <button
            type="button"
            className="ml-drawer-btn ml-drawer-logout"
            onClick={async () => { await logoutEmpleado(); }}
          >
            <FiLogOut size={15} color="#E24B4A" />
            <span style={{ color: '#E24B4A' }}>Cerrar sesión</span>
          </button>
        </div>
      </div>

      {/* ── Header ── */}
      <div className="ml-header">
        <button data-tour="inv-m-menu" type="button" onClick={() => setDrawerOpen(true)} className="ml-menu-btn">
          <FiMenu size={16} />
        </button>
        <div className="ml-header-center">
          <p className="ml-header-title">Dashboard Operacional</p>
          <p className="ml-header-sub">
            {localesVisibles.length === 1 ? LOCAL_LABELS[localesVisibles[0]] : `${localesVisibles.length} locales`}
          </p>
          <span
            data-tour="inv-m-estado"
            role="status"
            title={estadoLocal.detalle}
            aria-label={`Estado de ${LOCAL_LABELS[activeLocal]}: ${estadoLocal.texto}. ${estadoLocal.detalle}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 8px',
              borderRadius: 999, fontSize: 11, fontWeight: 600,
              backgroundColor: estadoLocal.bg, color: estadoLocal.color,
            }}
          >
            <estadoLocal.Icono size={11} />
            {estadoLocal.texto}
          </span>
        </div>
        <div className="ml-header-spacer" />
      </div>

      <SessionWarningBanner />

      {/* ── Selector de local ── */}
      <div data-tour="inv-m-locales" className="ml-local-bar">
        {LOCALES_KPI.map(loc => {
          const isActive  = activeLocal === loc.id;
          const col       = LOCAL_COLORS[loc.id];
          const LocalIcon = LOCAL_ICON_COMPONENTS[loc.id];
          return (
            <button
              type="button"
              key={loc.id}
              onClick={() => setActiveLocal(loc.id)}
              className="ml-loc-pill"
              style={{
                borderColor: isActive ? col.text : 'var(--c-border)',
                backgroundColor: isActive ? col.bg : 'transparent',
              }}
            >
              <LocalIcon size={16} color={isActive ? col.text : 'var(--c-textSecondary)'} />
              <span
                className="ml-loc-label"
                style={{ color: isActive ? col.text : 'var(--c-textSecondary)', fontWeight: isActive ? 600 : 400 }}
              >
                {loc.label}
              </span>
              {isActive && <span className="ml-loc-dot" style={{ backgroundColor: col.text }} />}
            </button>
          );
        })}
      </div>

      {/* ── Métricas KPI ── */}
      <div data-tour="inv-m-metricas" className="ml-metrics-row">
          {[
            { label: 'Stock bajo',      value: criticos.length + bajos.length, color: criticos.length > 0 ? '#E24B4A' : '#BA7517', onPress: () => setKpiMetricas(true) },
            { label: 'En riesgo',       value: formatearPrecioCorto(metricas.valorRiesgo),
              color: metricas.valorVencido > 0 ? '#E24B4A' : metricas.valorPorVencer > 0 ? '#BA7517' : 'var(--c-textPrimary)', onPress: () => setKpiMetricas(true) },
            { label: 'Ofertas',         value: metricas.nOfertas, color: metricas.nOfertas > 0 ? '#639922' : 'var(--c-textPrimary)', onPress: () => setKpiMetricas(true) },
            ...(!esCajero ? [{ label: 'Recetas', value: cargandoRecetas ? '…' : resumenRecetas.total, color: '#639922', onPress: () => setKpiRecetas(true) }] : []),
          ].map((m, i) => (
            <button type="button" key={i} onClick={m.onPress} className="ml-metric-card">
              <span className="ml-metric-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.label}</span>
              <span
                className="ml-metric-value"
                style={{
                  color: m.color, whiteSpace: 'nowrap', maxWidth: '100%',
                  // montos ($12.500, $1,3 M): se achican un poco en vez de pisar al vecino
                  ...(typeof m.value === 'string' ? { fontSize: 'clamp(12px, 3.6vw, 17px)' } : null),
                }}
              >
                {m.value}
              </span>
            </button>
          ))}
      </div>

      {/* ── Tabs ── */}
      <div data-tour="inv-m-tabs" className="ml-tab-bar">
          {TABS.map(tab => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`ml-tab ${active ? 'ml-tab-active' : ''}`}
              >
                <TabIcon size={13} color={active ? 'var(--c-accentText)' : 'var(--c-textSecondary)'} />
                <span style={{ color: active ? 'var(--c-accentText)' : 'var(--c-textSecondary)', fontWeight: active ? 600 : 400 }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
      </div>

      {/* ── Contenido ── */}
      <div className="ml-scroll">

          {/* TAB INVENTARIO */}
          {activeTab === 'inventario' && (
            <div className="ml-tab-content">
              <div data-tour="inv-m-gestion" className="ml-nav-card">
                <span className="ml-nav-icon" style={{ backgroundColor: '#E6F1FB' }}>
                  <FiBox size={18} color="#0C447C" />
                </span>
                <div className="ml-nav-info">
                  <p className="ml-nav-title">Gestión de Inventario</p>
                  <p className="ml-nav-desc">Administrar productos de {LOCAL_LABELS[activeLocal]}</p>
                </div>
                <button
                  type="button"
                  className="ml-nav-btn"
                  onClick={() => setModalProductosGestion({ local: activeLocal, autoAbrirRegistro: false })}
                >
                  Ir <FiArrowRight size={12} />
                </button>
              </div>

              {(criticos.length > 0 || bajos.length > 0) && (
                <div data-tour="inv-m-stock" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <TituloConAyuda
                    titulo={`STOCK A REPONER · ${criticos.length + bajos.length} PRODUCTO${criticos.length + bajos.length !== 1 ? 'S' : ''}`}
                    className="ml-section-label"
                  />
                  <Subseccion titulo="Stock crítico" cantidad={criticos.length} color="#E24B4A" textoVacio="Sin productos en nivel crítico" claseLista="ml-list">
                    {criticos.map(renderAlertaStock)}
                  </Subseccion>
                  <Subseccion titulo="Stock bajo" cantidad={bajos.length} color="#BA7517" textoVacio="Sin productos con stock bajo" claseLista="ml-list">
                    {bajos.map(renderAlertaStock)}
                  </Subseccion>
                </div>
              )}

              {vencLocal.length > 0 && (
                <div data-tour="inv-m-vencimientos" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ marginTop: 14 }}>
                    <TituloConAyuda titulo={`CONTROL DE VENCIMIENTOS · ${vencLocal.length}`} className="ml-section-label" />
                  </div>
                  <Subseccion titulo="Vencidos" cantidad={vencidos.length} color="#E24B4A" textoVacio="Sin productos vencidos" claseLista="ml-list">
                    {vencidos.map(item => <VencimientoCard key={item.id} item={item} onVerDetalle={setModalVenc} />)}
                  </Subseccion>
                  <Subseccion titulo="Por vencer" cantidad={porVencer.length} color="#BA7517" textoVacio="Sin productos por vencer" claseLista="ml-list">
                    {porVencer.map(item => <VencimientoCard key={item.id} item={item} onVerDetalle={setModalVenc} />)}
                  </Subseccion>
                </div>
              )}

              {recienteLocal.length > 0 && (
                <div data-tour="inv-m-ingresados" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p className="ml-section-label" style={{ marginTop: 6 }}>INGRESADOS HOY</p>
                  <div className="ml-list">
                    {recienteLocal.map(item => <ProductoRecienteCard key={item.id} item={item} />)}
                  </div>
                </div>
              )}

              {criticos.length === 0 && bajos.length === 0 && vencLocal.length === 0 && recienteLocal.length === 0 && (
                <div className="ml-empty-card">
                  <FiCheckCircle size={20} color="#639922" />
                  <span>Sin alertas en {LOCAL_LABELS[activeLocal]}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB RECETAS (oculto para cajero) */}
          {activeTab === 'recetas' && !esCajero && (
            <div className="ml-tab-content">
              <div data-tour="inv-m-gestion" className="ml-nav-card">
                <span className="ml-nav-icon" style={{ backgroundColor: '#EAF3DE' }}>
                  <FiBookOpen size={18} color="#27500A" />
                </span>
                <div className="ml-nav-info">
                  <p className="ml-nav-title">Gestión de Recetas</p>
                  <p className="ml-nav-desc">Administrar recetas e insumos</p>
                </div>
                <button
                  type="button"
                  className="ml-nav-btn"
                  onClick={() => setModalRecetasGestion({ local: activeLocal })}
                >
                  Ir <FiArrowRight size={12} />
                </button>
              </div>

              <div data-tour="inv-m-recetas" className="ml-metrics-row" style={{ padding: 0 }}>
                {[
                  { label: 'Total', value: cargandoRecetas ? '…' : resumenRecetas.total, color: 'var(--c-textPrimary)' },
                  { label: 'Preparables', value: cargandoRecetas ? '…' : `${resumenRecetas.preparables}/${resumenRecetas.activas}`,
                    color: resumenRecetas.activas > resumenRecetas.preparables ? '#E24B4A' : '#639922' },
                  { label: 'Más usado', value: cargandoRecetas ? '…' : (resumenRecetas.ingredienteClave?.nombre ?? '—'),
                    color: 'var(--c-textPrimary)' },
                ].map((m, i) => (
                  <button type="button" key={i} onClick={() => setKpiRecetas(true)} className="ml-metric-card">
                    <span className="ml-metric-label" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.label}</span>
                    <span
                      className="ml-metric-value"
                      style={{
                        color: m.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                        // textos largos (nombre de ingrediente): más chicos, con "…" si aun así no caben
                        ...(String(m.value).length > 5 ? { fontSize: 'clamp(12px, 3.6vw, 17px)' } : null),
                      }}
                    >
                      {m.value}
                    </span>
                  </button>
                ))}
              </div>

              <p className="ml-section-label">
                RECETAS · {LOCAL_LABELS[activeLocal].toUpperCase()} · {cargandoRecetas ? '…' : resumenRecetas.total}
              </p>
              {!cargandoRecetas && resumenRecetas.recetas.length === 0 ? (
                <div className="ml-empty-card">
                  <span>Sin recetas asignadas a este local</span>
                </div>
              ) : (
                <div className="ml-list">
                  {resumenRecetas.recetas.map(r => (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setKpiRecetas(true)}
                      className="ml-receta-row"
                      style={{
                        width: '100%', background: 'none', borderLeft: 'none', borderRight: 'none', borderTop: 'none',
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', opacity: r.activa ? 1 : 0.55,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="ml-receta-nombre">{r.nombre}</p>
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--c-textSecondary)' }}>
                          Se pueden preparar:{' '}
                          <strong style={{ color: colorPreparables(r.preparables) }}>{textoUnidades(r.preparables)}</strong>
                          {' · '}{textoLimitante(r)}
                        </p>
                      </div>
                      <Badge label={r.activa ? 'Activa' : 'Inactiva'} level={r.activa ? 'ok' : 'info'} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB PROVEEDORES */}
          {activeTab === 'proveedores' && (
            <div className="ml-tab-content">
              <div data-tour="inv-m-gestion" className="ml-nav-card">
                <span className="ml-nav-icon" style={{ backgroundColor: '#FAEEDA' }}>
                  <FiTruck size={18} color="#633806" />
                </span>
                <div className="ml-nav-info">
                  <p className="ml-nav-title">Gestión de Proveedores</p>
                  <p className="ml-nav-desc">Asignar proveedores a {LOCAL_LABELS[activeLocal]}</p>
                </div>
                <button
                  type="button"
                  className="ml-nav-btn"
                  onClick={() => { setLocalDelModal(activeLocal); setModalNuevoProv(true); }}
                >
                  Ir <FiArrowRight size={12} />
                </button>
              </div>

              <div data-tour="inv-m-agenda" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p className="ml-section-label">AGENDA SEMANAL</p>
                <CalendarioSemanal proveedores={provLocal} onDiaPress={() => setAgendaHoyModal(true)} />
              </div>

              {(provHoy.length > 0 || provProximos.length > 0) && (
                <div data-tour="inv-m-visitas" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {provHoy.length > 0 && (
                <>
                  <p className="ml-section-label" style={{ marginTop: 6 }}>VISITAN HOY · {provHoy.length}</p>
                  <div className="ml-list">
                    {provHoy.map(p => <ProveedorCard key={p.id} proveedor={p} onVerDetalle={setModalProv} />)}
                  </div>
                </>
              )}
              {provProximos.length > 0 && (
                <>
                  <p className="ml-section-label" style={{ marginTop: 6 }}>PRÓXIMAS VISITAS</p>
                  <div className="ml-list">
                    {provProximos.map(p => <ProveedorCard key={p.id} proveedor={p} onVerDetalle={setModalProv} />)}
                  </div>
                </>
              )}
                </div>
              )}
            </div>
          )}
      </div>

      {/* ── Modales ── */}
      <ModalRegistrarProductoGlobal
        visible={modalProductoGlobal}
        onClose={() => setModalProductoGlobal(false)}
      />

      <ModalRecetaGlobal
        visible={modalRecetaGlobalVisible}
        onClose={() => setModalRecetaGlobalVisible(false)}
      />

      <ModalGestionProveedores
        visible={proveedoresGlobalVisible}
        onClose={() => setProveedoresGlobalVisible(false)}
      />

      <ModalDetalleStock
        item={itemStockModal}
        onClose={() => setModalStock(null)}
        onVerVencimiento={(venc) => { setModalStock(null); setModalVenc(venc); }}
      />
      <ModalDetalleVencimiento item={itemVencimiento} onClose={() => setModalVenc(null)} onAviso={agregarAviso} />
      <AvisosFlotantes avisos={avisos} onDescartar={descartarAviso} />
      <ModalDetalleProveedor   proveedor={modalProv} onClose={() => setModalProv(null)} />
      <ModalNuevoProveedor
        visible={modalNuevoProv}
        onClose={() => setModalNuevoProv(false)}
        onGuardar={handleGuardarProveedor}
        localFijo={localDelModal ?? activeLocal}
        pantallaCompleta
      />

      {/* ── Flotantes ── */}
      <FloatingReporte
        visible={reporteModal}
        onClose={() => setReporteModal(false)}
        activeLocal={localDelModal ?? activeLocal}
        localLabels={LOCAL_LABELS}
      />

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
          <div key={p.id} className="ml-kpi-prov-row">
            <span className="ml-kpi-prov-avatar">{p.initials}</span>
            <div className="ml-kpi-prov-info">
              <p className="ml-kpi-prov-nombre">{p.nombre}</p>
              <p className="ml-kpi-prov-empresa">{p.empresa}</p>
            </div>
            <Badge label={`En ${nextVisitOffset(p.dias)} días`} level="info" />
          </div>
        )}
      />

      <FloatingSheet
        visible={agendaHoyModal}
        onClose={() => setAgendaHoyModal(false)}
        title="Proveedores que visitan hoy"
      >
        {provHoy.length === 0
          ? <p className="ml-agenda-empty">Ningún proveedor visita hoy</p>
          : provHoy.map(p => (
              <div key={p.id} className="ml-kpi-prov-row" style={{ marginBottom: 10 }}>
                <span className="ml-kpi-prov-avatar">{p.initials}</span>
                <div className="ml-kpi-prov-info">
                  <p className="ml-kpi-prov-nombre">{p.nombre}</p>
                  <p className="ml-kpi-prov-empresa">{p.empresa}</p>
                </div>
              </div>
            ))
        }
      </FloatingSheet>

      <FloatingVisitanHoy
        visible={visitanHoyVisible}
        onClose={() => setVisitanHoyVisible(false)}
        onNoMostrarHoy={() => {
          setVisitanHoyVisible(false);
          setVisitanHoyDismissedToday(true);
        }}
        provHoy={provHoy}
      />

      {modalProductosGestion && (
        <GestionProductosModal
          onClose={() => setModalProductosGestion(null)}
          local={modalProductosGestion.local}
          localLabel={LOCAL_LABELS[modalProductosGestion.local]}
          autoAbrirRegistro={modalProductosGestion.autoAbrirRegistro}
        />
      )}

      {modalRecetasGestion && (
        <GestionRecetasModal
          onClose={() => setModalRecetasGestion(null)}
          local={modalRecetasGestion.local}
          localLabel={LOCAL_LABELS[modalRecetasGestion.local]}
        />
      )}
    </div>
  );
}