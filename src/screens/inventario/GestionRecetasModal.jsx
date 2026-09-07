import { useState, useEffect } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { FormAsignacionReceta, SelectorRecetaGlobal, DetalleContenido, DetalleModal } from './GestionRecetasForms';
import {
  obtenerRecetasConEstadoLocal, obtenerProductosLocal,
  guardarAsignacionReceta, toggleActivoRecetaLocal,
} from '../../controllers/RecetaLocalControl';
import { crearAsignacionVacia, clonarAsignacionParaEditar } from '../../models/RecetaLocalModel';
import '../../css/GestionRecetas.css';

const DESKTOP_BREAKPOINT = 768;

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// ─── Tarjeta de receta (vista lista) ──────────────────────────────────────────
// item: { receta (global), asignacion (local, siempre presente en esta lista) }
function TarjetaReceta({ item, isSelected, onClick }) {
  const { receta, asignacion } = item;
  return (
    <button className={`rec-card${isSelected ? ' selected' : ''}`} onClick={onClick}>
      <div className="rec-card-icon">🍽️</div>
      <div className="rec-card-info">
        <div className="rec-card-nombre">{receta.nombre}</div>
        <div className="rec-card-sub">{receta.ingredientes.length} ingredientes</div>
        <div className={`rec-badge ${asignacion.activo ? 'rec-badge-ok' : 'rec-badge-out'}`}>
          {asignacion.activo ? 'Activa' : 'Desactivada'}
        </div>
      </div>
      <div className="rec-card-right">
        <div className="rec-precio-num">${Number(asignacion.precioVenta).toLocaleString('es-CL')}</div>
        <div className="rec-precio-lbl">CLP</div>
      </div>
    </button>
  );
}

// ─── Tarjeta de receta (vista cuadrícula) ─────────────────────────────────────
function TarjetaRecetaGrid({ item, onClick }) {
  const { receta, asignacion } = item;
  return (
    <button className={`rec-grid-card${!asignacion.activo ? ' inactiva' : ''}`} onClick={onClick}>
      <div className="rec-grid-img-wrap">
        <span className="rec-grid-img-fallback">🍽️</span>
      </div>
      <span className="rec-grid-name">{receta.nombre}</span>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GestionRecetasModal({ onClose, local, localLabel }) {
  const { colors, isDark, toggle } = useTheme();
  const width = useWindowWidth();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const [recetasConEstado, setRecetasConEstado] = useState([]);
  const [productosLocal, setProductosLocal] = useState([]);
  const [cargando, setCargando] = useState(true);

  const [recetaActual, setRecetaActual] = useState(null); // { receta, asignacion }
  const [busqueda, setBusqueda] = useState('');
  const [modalDetalle, setModalDetalle] = useState(false);
  const [vista, setVista] = useState('list'); // 'list' | 'grid'

  // ── Flujo "+ Nueva receta": paso 1 elegir del recetario global, paso 2 asignar ──
  const [modalNueva, setModalNueva] = useState(false);
  const [pasoNueva, setPasoNueva] = useState('seleccion'); // 'seleccion' | 'formulario'
  const [busquedaNueva, setBusquedaNueva] = useState('');
  const [recetaNuevaSeleccionada, setRecetaNuevaSeleccionada] = useState(null);

  // ── Flujo "Editar asignación" desde el detalle de una receta ya asignada ──
  const [modalEditar, setModalEditar] = useState(false);

  const [asignacionForm, setAsignacionForm] = useState(null);
  const [erroresForm, setErroresForm] = useState({});
  const [guardandoForm, setGuardandoForm] = useState(false);

  // Cerrar con tecla Escape
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Cargar recetas globales + su estado en este local, y los productos del local
  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    Promise.all([obtenerRecetasConEstadoLocal(local), obtenerProductosLocal(local)])
      .then(([conEstado, productos]) => {
        if (cancelado) return;
        setRecetasConEstado(conEstado);
        setProductosLocal(productos);
      })
      .catch(() => {
        if (!cancelado) {
          setRecetasConEstado([]);
          setProductosLocal([]);
        }
      })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [local]);

  // ── Lo primero que se ve: solo recetas que este local ya asignó ──────────
  const recetasAsignadas = recetasConEstado.filter((item) => item.asignacion);
  const recetasSinAsignar = recetasConEstado.filter((item) => !item.asignacion).map((item) => item.receta);

  // ── Navegación: detalle de una receta ya asignada ─────────────────────────

  function abrirDetalle(item) {
    setRecetaActual(item);
    if (!isDesktop) setModalDetalle(true);
  }

  function abrirEditar() {
    if (!recetaActual) return;
    const { receta, asignacion } = recetaActual;
    setAsignacionForm(clonarAsignacionParaEditar(asignacion, receta));
    setErroresForm({});
    setModalEditar(true);
  }

  // ── Navegación: flujo "+ Nueva receta" ────────────────────────────────────

  function abrirNueva() {
    setBusquedaNueva('');
    setRecetaNuevaSeleccionada(null);
    setPasoNueva('seleccion');
    setModalNueva(true);
  }

  function handleSeleccionarRecetaNueva(receta) {
    setRecetaNuevaSeleccionada(receta);
    setAsignacionForm(crearAsignacionVacia(receta));
    setErroresForm({});
    setPasoNueva('formulario');
  }

  function cerrarModalNueva() {
    setModalNueva(false);
    setPasoNueva('seleccion');
    setRecetaNuevaSeleccionada(null);
  }

  // ── Guardar asignación (sirve tanto para crear como para editar) ─────────

  async function guardarAsignacion({ esNueva }) {
    setErroresForm({});
    setGuardandoForm(true);
    try {
      const guardada = await guardarAsignacionReceta(local, asignacionForm);
      setRecetasConEstado(prev => prev.map(item =>
        item.receta.id === guardada.id ? { ...item, asignacion: guardada } : item
      ));
      if (esNueva) {
        const receta = recetaNuevaSeleccionada;
        setRecetaActual({ receta, asignacion: guardada });
        cerrarModalNueva();
      } else {
        setRecetaActual(prev => (prev?.receta.id === guardada.id ? { ...prev, asignacion: guardada } : prev));
        setModalEditar(false);
      }
    } catch (err) {
      setErroresForm(err?.errores ?? { general: 'No se pudo guardar la asignación. Intenta nuevamente.' });
    } finally {
      setGuardandoForm(false);
    }
  }

  async function manejarToggleActiva() {
    if (!recetaActual?.asignacion) return;
    const idReceta = recetaActual.receta.id;
    const nuevoActivo = !recetaActual.asignacion.activo;
    try {
      await toggleActivoRecetaLocal(local, idReceta, nuevoActivo);
      setRecetasConEstado(prev => prev.map(item =>
        item.receta.id === idReceta ? { ...item, asignacion: { ...item.asignacion, activo: nuevoActivo } } : item
      ));
      setRecetaActual(prev => ({ ...prev, asignacion: { ...prev.asignacion, activo: nuevoActivo } }));
    } catch (err) {
      window.alert('No se pudo actualizar el estado. Intenta nuevamente.');
    }
  }

  // ── Filtrado (solo sobre las ya asignadas) ────────────────────────────────

  const recetasFiltradas = recetasAsignadas.filter((item) =>
    item.receta.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  // ── Variables CSS de tema ────────────────────────────────────────────────────
  const themeVars = {
    '--rec-bg': colors.bg,
    '--rec-surface': colors.surface,
    '--rec-surface2': colors.surface2,
    '--rec-border': colors.border,
    '--rec-text-primary': colors.textPrimary,
    '--rec-text-secondary': colors.textSecondary,
    '--rec-placeholder': colors.placeholder,
    '--rec-btn-bg': colors.btnBg,
    '--rec-btn-text': colors.btnText,
  };

  return (
    <div className="rec-overlay" style={themeVars}>

      {/* Header */}
      <div className="rec-topbar">
        <div className="rec-topbar-row">
          <div>
            <p className="rec-topbar-title">Gestión de recetas</p>
            <p className="rec-topbar-sub">
              {recetasFiltradas.length} recetas{localLabel ? ` · ${localLabel}` : ''}
            </p>
          </div>
          <div className="rec-topbar-actions">
            <button className="rec-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="rec-search-wrap">
        <div className="rec-search-row">
          <input
            className="rec-search-input"
            placeholder="Buscar receta..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda.length > 0 && (
            <button className="rec-search-clear-btn" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">✕</button>
          )}
        </div>
      </div>

      {/* Toggle de vista */}
      <div className="rec-categorias-wrap">
        <div className="rec-categorias-row">
          <div className="rec-view-toggle">
            <button
              className={`rec-view-toggle-btn${vista === 'list' ? ' active' : ''}`}
              onClick={() => setVista('list')}
              aria-label="Ver en lista"
              title="Ver en lista"
            >
              ☰
            </button>
            <button
              className={`rec-view-toggle-btn${vista === 'grid' ? ' active' : ''}`}
              onClick={() => setVista('grid')}
              aria-label="Ver en cuadrícula"
              title="Ver en cuadrícula"
            >
              ▦
            </button>
          </div>
        </div>
      </div>

      {/* Layout desktop / móvil */}
      {cargando ? (
        <p style={{ padding: 16, fontSize: 13, color: 'var(--rec-text-secondary, #7F8C8D)' }}>Cargando recetas...</p>
      ) : isDesktop ? (
        <div className="rec-master-detail">
          <div className="rec-master-panel">
            {vista === 'grid' ? (
              <div className="rec-grid">
                {recetasFiltradas.map((item) => (
                  <TarjetaRecetaGrid key={item.receta.id} item={item} onClick={() => abrirDetalle(item)} />
                ))}
              </div>
            ) : (
              <div className="rec-list">
                {recetasFiltradas.map((item) => (
                  <TarjetaReceta
                    key={item.receta.id}
                    item={item}
                    isSelected={recetaActual?.receta.id === item.receta.id}
                    onClick={() => abrirDetalle(item)}
                  />
                ))}
              </div>
            )}
            <div className="rec-fab-row">
              <button className="rec-fab" onClick={abrirNueva}>+ Nueva receta</button>
            </div>
          </div>

          <div className="rec-detail-panel">
            {recetaActual ? (
              <>
                <div className="rec-sheet-header">
                  <span className="rec-sheet-title">{recetaActual.receta.nombre}</span>
                </div>
                <DetalleContenido
                  receta={recetaActual.receta}
                  asignacion={recetaActual.asignacion}
                  productosLocal={productosLocal}
                  onEditar={abrirEditar}
                  onToggleActiva={manejarToggleActiva}
                />
              </>
            ) : (
              <div className="rec-detail-empty">
                <div className="rec-detail-empty-text">Selecciona una receta para ver su detalle</div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {vista === 'grid' ? (
            <div className="rec-grid">
              {recetasFiltradas.map((item) => (
                <TarjetaRecetaGrid key={item.receta.id} item={item} onClick={() => abrirDetalle(item)} />
              ))}
            </div>
          ) : (
            <div className="rec-list">
              {recetasFiltradas.map((item) => (
                <TarjetaReceta key={item.receta.id} item={item} isSelected={false} onClick={() => abrirDetalle(item)} />
              ))}
            </div>
          )}
          <div className="rec-fab-row">
            <button className="rec-fab" onClick={abrirNueva}>+ Nueva receta</button>
          </div>
        </div>
      )}

      {/* Modal detalle (solo móvil) */}
      <DetalleModal
        isDesktop={isDesktop}
        visible={modalDetalle}
        receta={recetaActual?.receta}
        asignacion={recetaActual?.asignacion}
        productosLocal={productosLocal}
        onClose={() => setModalDetalle(false)}
        onEditar={abrirEditar}
        onToggleActiva={manejarToggleActiva}
      />

      {/* Flujo "+ Nueva receta": paso 1, elegir receta global sin asignar */}
      <SelectorRecetaGlobal
        visible={modalNueva && pasoNueva === 'seleccion'}
        isDesktop={isDesktop}
        recetas={recetasSinAsignar}
        busqueda={busquedaNueva}
        setBusqueda={setBusquedaNueva}
        onSeleccionar={handleSeleccionarRecetaNueva}
        onCerrar={cerrarModalNueva}
      />

      {/* Flujo "+ Nueva receta": paso 2, asignar productos y precio */}
      {asignacionForm && (
        <FormAsignacionReceta
          visible={modalNueva && pasoNueva === 'formulario'}
          isDesktop={isDesktop}
          recetaGlobal={recetaNuevaSeleccionada}
          productosLocal={productosLocal}
          asignacion={asignacionForm}
          setAsignacion={setAsignacionForm}
          errores={erroresForm}
          onGuardar={() => guardarAsignacion({ esNueva: true })}
          onCerrar={cerrarModalNueva}
          guardando={guardandoForm}
        />
      )}

      {/* Modal editar asignación (desde el detalle de una receta ya asignada) */}
      {asignacionForm && recetaActual && (
        <FormAsignacionReceta
          visible={modalEditar}
          isDesktop={isDesktop}
          recetaGlobal={recetaActual.receta}
          productosLocal={productosLocal}
          asignacion={asignacionForm}
          setAsignacion={setAsignacionForm}
          errores={erroresForm}
          onGuardar={() => guardarAsignacion({ esNueva: false })}
          onCerrar={() => setModalEditar(false)}
          guardando={guardandoForm}
        />
      )}

    </div>
  );
}