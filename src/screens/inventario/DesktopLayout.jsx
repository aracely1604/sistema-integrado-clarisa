import { useState, useEffect } from 'react';
import {
  FiChevronDown, FiBox, FiBookOpen, FiTruck, FiFileText,
  FiUserPlus, FiLogOut, FiAlertTriangle, FiCheckCircle, FiPlusCircle,
} from 'react-icons/fi';

import { useAuth, localesAsignados } from '../../controllers/AuthContext';
import { logoutEmpleado } from '../../controllers/AuthControl';
import { useTheme } from '../../context/ThemeContext';
import SessionWarningBanner from '../../controllers/SessionWarningBanner';
import {
  ModalGestionProveedores, ModalRegistrarProductoGlobal, ModalRecetaGlobal, AvisosFlotantes,
} from './DetalleModals';
import GestionProductosModal from './GestionProductosModal';
import GestionRecetasModal from './GestionRecetasModal';

import { ToggleSwitch } from './InventarioShared';
import { resumenEstadoLocal } from './AlertasInventarioShared';
import { FloatingReporte, FloatingSheet } from './FloatingSheet';
import DesktopInventarioView from './DesktopInventarioView';
import { LOCAL_LABELS, LOCALES_LIST, HOY_IDX } from './inventarioData';
import { getLevel, getVencLevel } from './inventarioHelpers';
import { useInventarioAlertas } from './useInventarioAlertas';
import { LOCAL_ICON_COMPONENTS } from './localIcons';

import ReporteRentabilidad from './ReporteRentabilidad';  

import '../../css/DesktopLayout.css';

export default function DesktopLayout({ state, actions }) {
  const { usuario } = useAuth();
  const { colors, isDark, toggle } = useTheme();

  const [reporteModal,    setReporteModal]    = useState(false);
  const [proveedoresGlobalVisible, setProveedoresGlobalVisible] = useState(false);
  // Modal del nodo global de productos (datos base: nombre, categoría, código, unidad, activo)
  const [modalProductoGlobal, setModalProductoGlobal] = useState(false);
  // Modal de gestión de productos: { local, autoAbrirRegistro } o null si está cerrado
  const [modalProductosGestion, setModalProductosGestion] = useState(null);
  // Modal de gestión de recetas: { local } o null si está cerrado
  const [modalRecetasGestion,   setModalRecetasGestion]   = useState(null);
  // Modal de creación de receta global (plantilla única para todo el sistema)
  const [modalRecetaGlobalVisible, setModalRecetaGlobalVisible] = useState(false);

  const [reporteRentabilidadVisible, setReporteRentabilidadVisible] = useState(false);

  const {
    activeLocal, proveedores, modalStock, modalVenc, modalProv, modalNuevoProv,
    recetasData, productosData, inventarioReciente,
    visitanHoyVisible, visitanHoyDismissedToday,
  } = state;
  const {
    setActiveLocal, setModalStock, setModalVenc, setModalProv,
    setModalNuevoProv, handleGuardarProveedor, setRecetasData, setProductosData,
    setVisitanHoyVisible, setVisitanHoyDismissedToday,
  } = actions;

  const [localExpanded, setLocalExpanded] = useState(activeLocal);
  // Local desde el que se abrió el modal de proveedores o reporte (puede diferir de activeLocal)
  const [localDelModal, setLocalDelModal] = useState(activeLocal);

  // ── Permisos según rol ──
  const esCajero       = usuario?.rol === 'cajero';
  const localesUsuario = localesAsignados(usuario?.localAsignado || usuario?.local);
  const localesVisibles = LOCALES_LIST.filter(l => localesUsuario.includes(l));

  // Subitems del desplegable: cajero ve Inventario y Proveedores
  const SIDEBAR_SUBITEMS = esCajero
    ? [
        { id: 'inventario',  label: 'Inventario',  icon: FiBox },
        { id: 'proveedores', label: 'Proveedores', icon: FiTruck },
      ]
    : [
        { id: 'inventario',  label: 'Inventario',  icon: FiBox },
        { id: 'recetas',     label: 'Recetas',     icon: FiBookOpen },
        { id: 'proveedores', label: 'Proveedores', icon: FiTruck },
        { id: 'reporte',     label: 'Reporte',     icon: FiFileText },
      ];

  // Iniciales y rol para mostrar en el perfil
  const inicialesUsuario = (usuario?.nombre ?? '')
    .split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '?';
  const rolLabel = {
    admin:   'Administrador',
    cajero:  'Cajero',
    gerente: 'Gerente',
  }[usuario?.rol] ?? (usuario?.rol ?? '');

  // Stock / vencimientos en vivo. El hook se llama UNA sola vez, acá, y se le pasa el
  // resultado a la vista de inventario: así hay una sola suscripción a Firestore y las
  // ofertas automáticas se activan una sola vez (en vez de una por cada llamada al hook).
  const alertas = useInventarioAlertas(activeLocal);
  const { stockData: stockLocal, vencimientosData: vencLocal } = alertas;

  // Resumen del local para el indicador de la barra superior.
  const estadoLocal = resumenEstadoLocal(stockLocal, vencLocal);

  // Proveedores del local activo y los que visitan hoy
  const provLocal = proveedores.filter(p => p.locales.includes(activeLocal));
  const provHoy   = provLocal.filter(p => p.dias.includes(HOY_IDX));

  // Recordatorio al entrar en un local (una vez por día)
  useEffect(() => {
    if (provHoy.length > 0 && !visitanHoyDismissedToday) {
      setVisitanHoyVisible(true);
    } else {
      setVisitanHoyVisible(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLocal, provHoy.length, visitanHoyDismissedToday]);

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
    <div className="dl-screen" style={themeVars}>

      {/* ── Sidebar ── */}
      <div className="dl-sidebar">

        {/* Marca */}
        <div className="dl-sb-section dl-sb-brand">
          <p className="dl-sb-brand-title">Dashboard</p>
          <p className="dl-sb-brand-sub">
            Operacional · {localesVisibles.length} {localesVisibles.length === 1 ? 'local' : 'locales'}
          </p>
        </div>

        {/* Perfil */}
        <div className="dl-sb-profile">
          <div className="dl-sb-avatar">{inicialesUsuario}</div>
          <div className="dl-sb-profile-info">
            <p className="dl-sb-profile-name">{usuario.nombre}</p>
            <p className="dl-sb-profile-role">{rolLabel}</p>
          </div>
        </div>

        <div className="dl-sb-scroll">

          {/* Selector de local con subitems */}
          <div data-tour="inv-local" className="dl-sb-locales" style={{ paddingTop: 12 }}>
            <p className="dl-sb-sec-label" style={{ padding: '0 12px', marginBottom: 6 }}>LOCAL ACTIVO</p>
            {localesVisibles.map(local => {
              const isActive   = activeLocal === local;
              const isExpanded = localExpanded === local;
              const LocalIcon  = LOCAL_ICON_COMPONENTS[local];
              return (
                <div key={local}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLocal(local);
                      setLocalExpanded(isExpanded ? null : local);
                    }}
                    className={`dl-sb-local-btn ${isActive ? `dl-sb-local-btn-active dl-local-${local}` : ''}`}
                  >
                    <span className={`dl-sb-local-dot ${isActive ? `dl-local-dot-${local}` : ''}`} />
                    <LocalIcon size={14} />
                    <span className="dl-sb-local-label">{LOCAL_LABELS[local]}</span>
                    <FiChevronDown size={12} className={`dl-sb-chevron ${isExpanded ? 'dl-sb-chevron-open' : ''}`} />
                  </button>

                  {/* Sub-items del local: siempre montados, el CSS anima la altura al abrir/cerrar */}
                  <div
                    className={`dl-subitems-collapse ${isExpanded ? 'dl-subitems-collapse-open' : ''}`}
                    aria-hidden={!isExpanded}
                  >
                    <div className="dl-subitems-wrap">
                      {SIDEBAR_SUBITEMS.map(sub => {
                        const SubIcon = sub.icon;
                        return (
                          <button
                            type="button"
                            key={sub.id}
                            onClick={() => {
                              if (sub.id === 'inventario') {
                                setModalProductosGestion({ local, autoAbrirRegistro: false });
                              } else if (sub.id === 'recetas') {
                                setModalRecetasGestion({ local });
                              } else if (sub.id === 'proveedores') {
                                setLocalDelModal(local);
                                setModalNuevoProv(true);
                              } else if (sub.id === 'reporte') {
                                setLocalDelModal(local);
                                setReporteModal(true);
                              }
                            }}
                            className="dl-subitem"
                          >
                            <SubIcon size={12} />
                            <span>{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* Fondo sidebar */}
        <div data-tour="inv-acciones" className="dl-sb-bottom">
          <button
            type="button"
            className="dl-sb-bottom-btn"
            onClick={() => setModalProductoGlobal(true)}
          >
            <FiPlusCircle size={13} />
            <span>Registrar producto</span>
          </button>

          {!esCajero && (
            <button
              type="button"
              className="dl-sb-bottom-btn"
              onClick={() => setModalRecetaGlobalVisible(true)}
            >
              <FiBookOpen size={13} />
              <span>Gestionar recetas</span>
            </button>
          )}

          <button type="button" className="dl-sb-bottom-btn" onClick={() => setProveedoresGlobalVisible(true)}>
            <FiUserPlus size={13} />
            <span>Gestionar proveedores</span>
          </button>

          {/* Modo oscuro con toggle */}
          <div className="dl-sb-bottom-btn dl-sb-bottom-btn-between">
            <span className="dl-sb-bottom-btn-label">
              {isDark ? '🌙' : '☀️'} Modo oscuro
            </span>
            <ToggleSwitch value={isDark} onToggle={toggle} />
          </div>

          <button
            type="button"
            className="dl-sb-bottom-btn dl-sb-logout-btn"
            onClick={async () => { await logoutEmpleado(); }}
          >
            <FiLogOut size={13} color="#E24B4A" />
            <span className="dl-sb-logout-text">Cerrar sesión</span>
          </button>

          <ModalRegistrarProductoGlobal
            visible={modalProductoGlobal}
            onClose={() => setModalProductoGlobal(false)}
          />
          <ModalGestionProveedores
            visible={proveedoresGlobalVisible}
            onClose={() => setProveedoresGlobalVisible(false)}
          />
          <ModalRecetaGlobal
            visible={modalRecetaGlobalVisible}
            onClose={() => setModalRecetaGlobalVisible(false)}
          />
        </div>
      </div>

      {/* ── Main ── */}
      <div className="dl-main">

        {/* Topbar */}
        <div className="dl-topbar">
          <div>
            <p className="dl-topbar-title">{LOCAL_LABELS[activeLocal]}</p>
            <p className="dl-topbar-sub">
              Inventario y Recetas · Dashboard general
            </p>
          </div>
          <div data-tour="inv-alertas" className="dl-topbar-badges">
            <span
              className="dl-topbar-badge"
              role="status"
              title={estadoLocal.detalle}
              aria-label={`Estado de ${LOCAL_LABELS[activeLocal]}: ${estadoLocal.texto}. ${estadoLocal.detalle}`}
              style={{ backgroundColor: estadoLocal.bg, color: estadoLocal.color }}
            >
              <estadoLocal.Icono size={11} />
              {estadoLocal.texto}
            </span>
          </div>
        </div>

        <SessionWarningBanner />

        {/* ── Contenido: delega a la vista correspondiente ── */}
        <DesktopInventarioView
          activeLocal={activeLocal}
          alertas={alertas}
          proveedores={proveedores}
          recetasData={recetasData}
          productosData={productosData}
          inventarioReciente={inventarioReciente}
          modalStock={modalStock}         setModalStock={setModalStock}
          modalVenc={modalVenc}           setModalVenc={setModalVenc}
          modalProv={modalProv}           setModalProv={setModalProv}
          modalNuevoProv={modalNuevoProv} setModalNuevoProv={setModalNuevoProv}
          handleGuardarProveedor={handleGuardarProveedor}
          setRecetasData={setRecetasData}
          setProductosData={setProductosData}
          visitanHoyVisible={visitanHoyVisible}
          setVisitanHoyVisible={setVisitanHoyVisible}
          visitanHoyDismissedToday={visitanHoyDismissedToday}
          setVisitanHoyDismissedToday={setVisitanHoyDismissedToday}
        />
      </div>

      {/* Avisos flotantes (ofertas automáticas, mermas...) */}
      <AvisosFlotantes avisos={alertas.avisos} onDescartar={alertas.descartarAviso} />

      <FloatingReporte
        visible={reporteModal}
        onClose={() => setReporteModal(false)}
        activeLocal={localDelModal}
        localLabels={LOCAL_LABELS}
        onGenerarReporteRentabilidad={() => {
          setReporteModal(false);               // cierra el sheet de reporte
          setReporteRentabilidadVisible(true);  // abre rentabilidad
        }}
      />

      {reporteRentabilidadVisible && (
        <FloatingSheet
          visible={reporteRentabilidadVisible}
          onClose={() => setReporteRentabilidadVisible(false)}
          title="Reporte de rentabilidad"
        >
          <ReporteRentabilidad
            activeLocal={localDelModal}
            localLabels={LOCAL_LABELS}
          />
        </FloatingSheet>
      )}

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