import { useState, useEffect, useRef, useCallback } from 'react';
import {
  FiX, FiAlertOctagon, FiClock, FiCalendar, FiClipboard,
  FiCheckCircle, FiAlertTriangle, FiArrowDown, FiChevronLeft,
  FiChevronRight, FiUsers, FiUserPlus, FiPlusCircle,
} from 'react-icons/fi';
import { Badge, LocalChip, ToggleSwitch } from './InventarioShared';
import { STOCK_DATA, LOCAL_LABELS, LOCAL_COLORS, DIAS, DIAS_SEMANA, HOY_IDX } from './inventarioData';
import { getLevel, getPct, getVencLevel } from './inventarioHelpers';
import {
  crearProveedorGlobal, actualizarProveedorGlobal,
  obtenerProveedoresGlobalesDisponibles, asignarProveedorExistenteALocal,
  actualizarDiasProveedorLocal, cambiarEstadoProveedor,
  suscribirProveedoresPorLocal, suscribirProveedoresGlobales,
} from '../../controllers/ProveedorControl';
import { getInitials } from '../../models/ProveedorModel';
import {
  crearProductoGlobal, actualizarProductoGlobal, obtenerProductoPorCodigoBarra,
  suscribirProductosGlobales,
} from '../../controllers/ProductoControl';
import {
  crearRecetaGlobal, actualizarRecetaGlobal, obtenerRecetasGlobales, existeNombreReceta,
} from '../../controllers/RecetaControl';
import {
  UNIDADES_MEDIDA_RECETA, crearIngredienteVacio, normalizarTexto,
  validarReceta, esRecetaValida,
} from '../../models/RecetaModel';
import { CATEGORIAS, UNIDADES_MEDIDA } from './gestionProductosData';
import '../../css/DetalleModals.css';

// ─── Mensaje de éxito reutilizable (banner verde con auto-ocultado) ─────────
function useMensajeExito(duracion = 4000) {
  const [mensaje, setMensaje] = useState('');
  const timerRef = useRef(null);

  const mostrar = useCallback((texto) => {
    clearTimeout(timerRef.current);
    setMensaje(texto);
    timerRef.current = setTimeout(() => setMensaje(''), duracion);
  }, [duracion]);

  const ocultar = useCallback(() => {
    clearTimeout(timerRef.current);
    setMensaje('');
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return [mensaje, mostrar, ocultar];
}

function MensajeExito({ texto }) {
  if (!texto) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', marginBottom: 14, borderRadius: 10,
        backgroundColor: '#EAF3DE', border: '1px solid #639922',
        color: '#3B6D11', fontSize: 13, fontWeight: 600,
      }}
    >
      <FiCheckCircle size={16} />
      <span>{texto}</span>
    </div>
  );
}

// ─── Modal detalle de stock ───────────────────────────────────────────────────
export function ModalDetalleStock({ item, onClose }) {
  if (!item) return null;
  const level      = getLevel(item);
  const pct        = getPct(item);
  const isCritical = ['critical', 'out'].includes(level);
  const barColor   = isCritical ? '#E24B4A' : level === 'low' ? '#BA7517' : '#639922';

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between">
          <div>
            <h2 className="inv-modal-title">{item.nombre}</h2>
            <div style={{ marginTop: 4 }}><LocalChip local={item.local} /></div>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <div className="inv-modal-stats-row">
          {[
            { label: 'Stock actual', value: `${item.qty} ${item.unit}` },
            { label: 'Stock mínimo', value: `${item.min} ${item.unit}` },
            { label: 'Porcentaje',   value: `${pct}%` },
          ].map((stat, i) => (
            <div key={i} className="inv-modal-statbox">
              <span className="inv-modal-statlabel">{stat.label}</span>
              <span className="inv-modal-statvalue">{stat.value}</span>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="inv-modal-row-between" style={{ marginBottom: 6 }}>
            <span className="inv-modal-label">Nivel de stock</span>
            <Badge
              label={level === 'out' ? 'Sin stock' : isCritical ? 'Crítico' : level === 'low' ? 'Stock bajo' : 'Normal'}
              level={isCritical ? 'critical' : level === 'low' ? 'low' : 'ok'}
            />
          </div>
          <div className="inv-modal-bigbar-bg">
            <div className="inv-modal-bigbar-fill" style={{ width: `${pct}%`, backgroundColor: barColor }} />
          </div>
          <div className="inv-modal-row-between" style={{ marginTop: 4 }}>
            <span className="inv-modal-barlabel">0 {item.unit}</span>
            <span className="inv-modal-barlabel">{item.max} {item.unit}</span>
          </div>
        </div>

        <div className="inv-modal-infobox">
          <p className="inv-modal-infotitle">Recomendación</p>
          <p className="inv-modal-infotext">
            {isCritical
              ? `Solicitar reposición urgente. Faltan ${(item.min - item.qty).toFixed(1)} ${item.unit} para alcanzar el mínimo.`
              : `Considerar pedido pronto. Stock actual es ${pct}% del máximo.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Modal detalle de vencimiento ────────────────────────────────────────────
export function ModalDetalleVencimiento({ item, onClose }) {
  if (!item) return null;
  const level      = getVencLevel(item.vence);
  const isCritical = level === 'critical';

  const boxColors = isCritical
    ? { bg: '#FCEBEB', border: '#F5A6A6', text: '#791F1F' }
    : level === 'warning'
    ? { bg: '#FAEEDA', border: '#FAC775', text: '#633806' }
    : { bg: '#EAF3DE', border: '#B8DFA0', text: '#27500A' };

  const Icon = isCritical ? FiAlertOctagon : level === 'warning' ? FiClock : FiCalendar;

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between">
          <div>
            <h2 className="inv-modal-title">{item.nombre}</h2>
            <div style={{ marginTop: 4 }}><LocalChip local={item.local} /></div>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <div className="inv-modal-stats-row">
          {[
            { label: 'Vence en', value: `${item.vence} ${item.unit}` },
            { label: 'Cantidad', value: `${item.qty} ${item.unitQty}` },
            { label: 'Lote',     value: item.lote },
          ].map((stat, i) => (
            <div key={i} className="inv-modal-statbox">
              <span className="inv-modal-statlabel">{stat.label}</span>
              <span className="inv-modal-statvalue" style={{ fontSize: 13 }}>{stat.value}</span>
            </div>
          ))}
        </div>

        <div className="inv-modal-warningbox" style={{ backgroundColor: boxColors.bg, borderColor: boxColors.border }}>
          <Icon size={18} color={boxColors.text} />
          <span style={{ color: boxColors.text }}>
            {isCritical
              ? 'Producto vence hoy o mañana. Revisar uso urgente o retirar del inventario.'
              : level === 'warning'
              ? `Vence en ${item.vence} días. Priorizar su uso.`
              : `Vence en ${item.vence} días. Monitorear consumo.`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Modal detalle de proveedor ──────────────────────────────────────────────
export function ModalDetalleProveedor({ proveedor, onClose }) {
  if (!proveedor) return null;
  const visitaHoy = proveedor.dias.includes(HOY_IDX);

  const stockRecomendado = STOCK_DATA.filter(item =>
    proveedor.locales.includes(item.local) && ['critical', 'out', 'low'].includes(getLevel(item))
  ).sort((a, b) => {
    const order = { out: 0, critical: 1, low: 2 };
    return order[getLevel(a)] - order[getLevel(b)];
  });

  return (
    <div className="inv-modal-overlay" onClick={onClose}>
      <div className="inv-modal-sheet inv-modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between">
          <div className="inv-modal-row">
            <span className="inv-avatar-lg">{proveedor.initials}</span>
            <div style={{ marginLeft: 12 }}>
              <h2 className="inv-modal-title">{proveedor.nombre}</h2>
              <p className="inv-modal-provtipo">{proveedor.empresa}</p>
            </div>
          </div>
          <button type="button" className="inv-modal-close" onClick={onClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <div className="inv-modal-scroll">
          <div className="inv-modal-infotable">
            {[
              { k: 'Empresa',        v: proveedor.empresa },
              { k: 'Teléfono',       v: proveedor.telefono },
              { k: 'Días de visita', v: proveedor.dias.map(d => DIAS[d]).join(' · ') },
            ].map((row, i) => (
              <div key={i} className="inv-modal-inforow">
                <span className="inv-modal-infokey">{row.k}</span>
                <span className="inv-modal-infoval">{row.v}</span>
              </div>
            ))}
          </div>

          <p className="inv-modal-label" style={{ marginBottom: 7 }}>LOCALES ABASTECIDOS</p>
          <div className="inv-modal-row" style={{ gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {proveedor.locales.map(l => <LocalChip key={l} local={l} />)}
          </div>

          {visitaHoy && (
            <div className="inv-modal-warningbox" style={{ marginBottom: 16 }}>
              <FiClipboard size={18} color="#633806" />
              <span>Este proveedor visita hoy. Recuerda preparar el pedido.</span>
            </div>
          )}

          <p className="inv-modal-label" style={{ marginBottom: 10 }}>
            SUGERENCIA DE COMPRA · {stockRecomendado.length} PRODUCTO{stockRecomendado.length !== 1 ? 'S' : ''}
          </p>

          {stockRecomendado.length === 0 ? (
            <div className="inv-modal-recom-empty">
              <FiCheckCircle size={20} color="#639922" />
              <span>Sin stock crítico en los locales de este proveedor</span>
            </div>
          ) : (
            <div className="inv-modal-recom-list">
              {stockRecomendado.map(item => {
                const level       = getLevel(item);
                const isCritical  = ['critical', 'out'].includes(level);
                const accentColor = isCritical ? '#E24B4A' : '#BA7517';
                const bgColor     = isCritical ? '#FCEBEB' : '#FAEEDA';
                const faltante    = Math.max(0, item.min - item.qty);
                const badgeLabel  = level === 'out' ? 'Sin stock' : isCritical ? 'Crítico' : 'Stock bajo';
                return (
                  <div key={item.id} className="inv-modal-recom-card" style={{ borderLeftColor: accentColor }}>
                    <span className="inv-modal-recom-icon" style={{ backgroundColor: bgColor }}>
                      {isCritical ? <FiAlertTriangle size={14} color={accentColor} /> : <FiArrowDown size={14} color={accentColor} />}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="inv-modal-row-between" style={{ marginBottom: 2 }}>
                        <span className="inv-modal-recom-nombre">{item.nombre}</span>
                        <Badge label={badgeLabel} level={isCritical ? 'critical' : 'low'} />
                      </div>
                      <LocalChip local={item.local} />
                      <div className="inv-modal-row-between" style={{ marginTop: 6 }}>
                        <span className="inv-modal-recom-meta">
                          Stock: <b style={{ color: accentColor }}>{item.qty} {item.unit}</b>
                        </span>
                        {faltante > 0 && (
                          <span className="inv-modal-recom-sugerido" style={{ color: accentColor }}>
                            Pedir &ge; {faltante.toFixed(1)} {item.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── Modal gestión de proveedores (nodo global) ──────────────────────────────
// Vive en el nodo GLOBAL proveedor/{id}: nombre, empresa, teléfono. No sabe
// nada de locales, activo ni días de visita — eso se define después, al
// asignar el proveedor a un local puntual (ver ModalNuevoProveedor más abajo).
// Se abre desde el sidebar/drawer, fuera del contexto de un local.
//
// Tiene 2 pestañas:
//  - "Nuevo":  crea un proveedor en proveedor/{id}.
//  - "Editar": lista TODOS los proveedores del nodo global (en vivo) y
//              permite editar nombre/teléfono. La empresa no es editable.
export function ModalGestionProveedores({ visible, onClose }) {
  const FORM_INIT = { nombre: '', empresa: '', telefono: '' };

  const [tab, setTab] = useState('nuevo'); // 'nuevo' | 'editar'
  const [mensajeExito, mostrarExito, ocultarExito] = useMensajeExito();

  // ── Pestaña "Nuevo" ──
  const [form, setForm]           = useState(FORM_INIT);
  const [errors, setErrors]       = useState({});
  const [guardando, setGuardando] = useState(false);

  // ── Pestaña "Editar" ──
  const [listaGlobal, setListaGlobal]     = useState([]);
  const [proveedorEditId, setProveedorEditId] = useState(null);
  const [editForm, setEditForm]           = useState({ nombre: '', telefono: '' });
  const [editErrors, setEditErrors]       = useState({});
  const [editGuardando, setEditGuardando] = useState(false);

  // Se suscribe a TODOS los proveedores globales mientras el modal esté abierto.
  useEffect(() => {
    if (!visible) return undefined;
    const cancelar = suscribirProveedoresGlobales(setListaGlobal);
    return cancelar;
  }, [visible]);

  const proveedorSeleccionado = listaGlobal.find(p => p.id === proveedorEditId) ?? null;

  function limpiarNombre(valor) {
    return valor.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü\s]/g, '');
  }

  function limpiarTelefonoInput(valor) {
    return valor.replace(/\D/g, '').slice(0, 9);
  }

  async function handleGuardarNuevo(e) {
    e.preventDefault();
    setErrors({});
    setGuardando(true);
    try {
      await crearProveedorGlobal(form);
      setForm(FORM_INIT);
      mostrarExito('Proveedor creado correctamente');
    } catch (err) {
      setErrors(err?.errores ?? { general: 'No se pudo guardar el proveedor. Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  }

  function handleSeleccionarProveedor(p) {
    setProveedorEditId(p.id);
    setEditForm({ nombre: p.nombre, telefono: p.telefono });
    setEditErrors({});
  }

  function handleVolverALista() {
    setProveedorEditId(null);
    setEditForm({ nombre: '', telefono: '' });
    setEditErrors({});
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!proveedorEditId) return;
    setEditErrors({});
    setEditGuardando(true);
    try {
      await actualizarProveedorGlobal(proveedorEditId, editForm);
      handleVolverALista();
      mostrarExito('Proveedor actualizado correctamente');
    } catch (err) {
      setEditErrors(err?.errores ?? { general: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
    } finally {
      setEditGuardando(false);
    }
  }

  function handleClose() {
    setTab('nuevo');
    setForm(FORM_INIT);
    setErrors({});
    ocultarExito();
    handleVolverALista();
    onClose();
  }

  function handleCambiarTab(nuevoTab) {
    setTab(nuevoTab);
    setErrors({});
    ocultarExito();
    handleVolverALista();
  }

  if (!visible) return null;

  return (
    <div className="inv-modal-overlay" onClick={handleClose}>
      <div className="inv-modal-sheet inv-modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between" style={{ marginBottom: 6 }}>
          <h2 className="inv-modal-title">{tab === 'nuevo' ? 'Nuevo proveedor' : 'Proveedores registrados'}</h2>
          <button type="button" className="inv-modal-close" onClick={handleClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <p className="inv-modal-hint-inline" style={{ marginBottom: 14, display: 'block' }}>
          Datos generales del proveedor. Para asignarlo a un local y definir sus días de visita, usa "Proveedores" dentro de cada local.
        </p>

        <MensajeExito texto={mensajeExito} />

        {/* Selector de pestaña */}
        <div className="inv-modal-row" style={{ gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => handleCambiarTab('nuevo')}
            className="inv-modal-btn"
            style={{
              flex: 1,
              backgroundColor: tab === 'nuevo' ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
              color: tab === 'nuevo' ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
              border: '1px solid var(--c-border, #E4E2DD)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <FiUserPlus size={14} /> Nuevo
          </button>
          <button
            type="button"
            onClick={() => handleCambiarTab('editar')}
            className="inv-modal-btn"
            style={{
              flex: 1,
              backgroundColor: tab === 'editar' ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
              color: tab === 'editar' ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
              border: '1px solid var(--c-border, #E4E2DD)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <FiUsers size={14} /> Editar
          </button>
        </div>

        {/* ── Pestaña Nuevo ── */}
        {tab === 'nuevo' && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarNuevo}>
            {errors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{errors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre del contacto <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                placeholder="Ej: Juan Pérez"
                value={form.nombre}
                onChange={(e) => setForm(prev => ({ ...prev, nombre: limpiarNombre(e.target.value) }))}
              />
              {errors.nombre && <p className="inv-modal-errortext">{errors.nombre}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Empresa <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errors.empresa ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                placeholder="Ej: Distribuidora Central SpA"
                value={form.empresa}
                onChange={(e) => setForm(prev => ({ ...prev, empresa: e.target.value }))}
              />
              {errors.empresa && <p className="inv-modal-errortext">{errors.empresa}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Teléfono <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errors.telefono ? { borderColor: '#E24B4A' } : undefined}
                type="tel"
                inputMode="numeric"
                placeholder="912345678"
                value={form.telefono}
                onChange={(e) => setForm(prev => ({ ...prev, telefono: limpiarTelefonoInput(e.target.value) }))}
              />
              {errors.telefono && <p className="inv-modal-errortext">{errors.telefono}</p>}
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar proveedor'}
              </button>
            </div>
          </form>
        )}

        {/* ── Pestaña Editar: lista ── */}
        {tab === 'editar' && !proveedorSeleccionado && (
          <div className="inv-modal-scroll">
            {listaGlobal.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiCheckCircle size={20} color="#639922" />
                <span>Aún no hay proveedores registrados</span>
              </div>
            ) : (
              <div className="inv-modal-recom-list">
                {listaGlobal.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleSeleccionarProveedor(p)}
                    className="inv-modal-row-between"
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                      background: 'transparent', cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    <div className="inv-modal-row" style={{ gap: 10 }}>
                      <span className="inv-avatar-lg" style={{ width: 34, height: 34, fontSize: 13 }}>{getInitials(p.nombre)}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>{p.empresa}</p>
                      </div>
                    </div>
                    <FiChevronRight size={16} color="var(--c-textSecondary, #7F8C8D)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pestaña Editar: formulario del proveedor seleccionado ── */}
        {tab === 'editar' && proveedorSeleccionado && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarEdicion}>
            <button
              type="button"
              onClick={handleVolverALista}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Volver a la lista
            </button>

            {editErrors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{editErrors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">Empresa</label>
              <input className="inv-modal-input" type="text" value={proveedorSeleccionado.empresa} disabled />
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre del contacto <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={editErrors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                value={editForm.nombre}
                onChange={(e) => setEditForm(prev => ({ ...prev, nombre: limpiarNombre(e.target.value) }))}
              />
              {editErrors.nombre && <p className="inv-modal-errortext">{editErrors.nombre}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Teléfono <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={editErrors.telefono ? { borderColor: '#E24B4A' } : undefined}
                type="tel"
                inputMode="numeric"
                value={editForm.telefono}
                onChange={(e) => setEditForm(prev => ({ ...prev, telefono: limpiarTelefonoInput(e.target.value) }))}
              />
              {editErrors.telefono && <p className="inv-modal-errortext">{editErrors.telefono}</p>}
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleVolverALista}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={editGuardando}>
                {editGuardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal proveedores de un local (asignar existente + editar asignación) ──
// localFijo: el local desde el que se abrió el formulario (viene del sidebar).
// Ya NO crea proveedores nuevos ni edita nombre/empresa/telefono: esos datos
// viven en el nodo global y se gestionan desde ModalGestionProveedores (arriba).
// Acá solo se maneja la ASIGNACIÓN a este local puntual.
//
// Tiene 2 pestañas:
//  - "Asignar": elige un proveedor del nodo global que aún no esté asignado
//               a este local, y define sus días de visita.
//  - "Editar":  lista los proveedores YA asignados a este local (en vivo) y
//               permite editar solo días de visita y activar/desactivar.
//
// onGuardar (opcional): se sigue invocando después de asignar un proveedor,
// por compatibilidad con quien use este modal para refrescar su propio
// estado local; el guardado real en la BD ya ocurrió antes de llamarlo.
export function ModalNuevoProveedor({ visible, onClose, onGuardar, localFijo }) {
  const [tab, setTab] = useState('asignar'); // 'asignar' | 'editar'

  // ── Pestaña "Asignar" ──
  const [disponibles, setDisponibles]           = useState([]);
  const [cargandoDisponibles, setCargandoDisponibles] = useState(false);
  const [proveedorAsignarId, setProveedorAsignarId]   = useState(null);
  const [diasAsignar, setDiasAsignar]           = useState([]);
  const [erroresAsignar, setErroresAsignar]     = useState({});
  const [guardandoAsignar, setGuardandoAsignar] = useState(false);

  // ── Pestaña "Editar" ──
  const [listaProveedores, setListaProveedores] = useState([]);
  const [proveedorEditId, setProveedorEditId]   = useState(null);
  const [editForm, setEditForm]     = useState({ dias: [] });
  const [editErrors, setEditErrors] = useState({});
  const [editGuardando, setEditGuardando] = useState(false);

  // Se suscribe a los proveedores YA asignados a este local mientras el modal
  // esté abierto, así la lista de "Editar" siempre refleja lo que hay en la BD.
  useEffect(() => {
    if (!visible || !localFijo) return undefined;
    const cancelar = suscribirProveedoresPorLocal(localFijo, setListaProveedores);
    return cancelar;
  }, [visible, localFijo]);

  // Carga (una vez, al entrar a la pestaña "Asignar") los proveedores
  // globales que todavía no están asignados a este local.
  useEffect(() => {
    if (!visible || !localFijo || tab !== 'asignar' || proveedorAsignarId) return undefined;
    let cancelado = false;
    setCargandoDisponibles(true);
    obtenerProveedoresGlobalesDisponibles(localFijo)
      .then(lista => { if (!cancelado) setDisponibles(lista); })
      .finally(() => { if (!cancelado) setCargandoDisponibles(false); });
    return () => { cancelado = true; };
  }, [visible, localFijo, tab, proveedorAsignarId]);

  const proveedorSeleccionado = listaProveedores.find(p => p.id === proveedorEditId) ?? null;
  const proveedorParaAsignar  = disponibles.find(p => p.id === proveedorAsignarId) ?? null;

  function toggleDiaAsignar(idx) {
    setDiasAsignar(d => (d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx]));
  }

  function toggleDiaEdicion(idx) {
    setEditForm(f => {
      const yaEstaba = f.dias.includes(idx);
      if (yaEstaba && f.dias.length === 1) {
        setEditErrors(prev => ({ ...prev, dias: 'Debe quedar al menos un día seleccionado' }));
        return f;
      }
      setEditErrors(prev => {
        const { dias, ...resto } = prev;
        return resto;
      });
      return { ...f, dias: yaEstaba ? f.dias.filter(d => d !== idx) : [...f.dias, idx] };
    });
  }

  function handleElegirParaAsignar(p) {
    setProveedorAsignarId(p.id);
    setDiasAsignar([]);
    setErroresAsignar({});
  }

  function handleVolverADisponibles() {
    setProveedorAsignarId(null);
    setDiasAsignar([]);
    setErroresAsignar({});
  }

  async function handleGuardarAsignacion(e) {
    e.preventDefault();
    if (!proveedorAsignarId) return;
    if (diasAsignar.length === 0) {
      setErroresAsignar({ dias: 'Selecciona al menos un día de visita' });
      return;
    }
    setErroresAsignar({});
    setGuardandoAsignar(true);
    try {
      await asignarProveedorExistenteALocal(localFijo, proveedorAsignarId, diasAsignar);
      onGuardar?.({ id: proveedorAsignarId, locales: [localFijo], dias: diasAsignar, activo: true });
      setDisponibles(prev => prev.filter(p => p.id !== proveedorAsignarId));
      handleVolverADisponibles();
      onClose();
    } catch (err) {
      setErroresAsignar(err?.errores ?? { general: 'No se pudo asignar el proveedor. Intenta nuevamente.' });
    } finally {
      setGuardandoAsignar(false);
    }
  }

  function handleSeleccionarProveedor(p) {
    setProveedorEditId(p.id);
    setEditForm({ dias: [...p.dias] });
    setEditErrors({});
  }

  function handleVolverALista() {
    setProveedorEditId(null);
    setEditForm({ dias: [] });
    setEditErrors({});
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!proveedorEditId) return;
    setEditErrors({});
    setEditGuardando(true);
    try {
      await actualizarDiasProveedorLocal(localFijo, proveedorEditId, editForm.dias);
      handleVolverALista();
    } catch (err) {
      setEditErrors(err?.errores ?? { general: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
    } finally {
      setEditGuardando(false);
    }
  }

  async function handleToggleActivo(p) {
    try {
      await cambiarEstadoProveedor(localFijo, p.id, !p.activo);
    } catch {
      // Silencioso: la suscripción en vivo corrige la UI si la escritura falla.
    }
  }

  function handleClose() {
    setTab('asignar');
    handleVolverADisponibles();
    handleVolverALista();
    onClose();
  }

  function handleCambiarTab(nuevoTab) {
    setTab(nuevoTab);
    handleVolverADisponibles();
    handleVolverALista();
  }

  if (!visible) return null;

  const col = LOCAL_COLORS[localFijo] || { bg: '#F8F9FA', text: '#7F8C8D' };

  return (
    <div className="inv-modal-overlay" onClick={handleClose}>
      <div className="inv-modal-sheet inv-modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between" style={{ marginBottom: 6 }}>
          <h2 className="inv-modal-title">{tab === 'asignar' ? 'Asignar proveedor' : 'Editar proveedor'}</h2>
          <button type="button" className="inv-modal-close" onClick={handleClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <div className="inv-modal-row" style={{ marginBottom: 14, gap: 6 }}>
          <span className="inv-chip" style={{ backgroundColor: col.bg, color: col.text }}>
            {LOCAL_LABELS[localFijo] ?? localFijo}
          </span>
          <span className="inv-modal-hint-inline">Local asignado automáticamente</span>
        </div>

        {/* Selector de pestaña */}
        <div className="inv-modal-row" style={{ gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => handleCambiarTab('asignar')}
            className="inv-modal-btn"
            style={{
              flex: 1,
              backgroundColor: tab === 'asignar' ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
              color: tab === 'asignar' ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
              border: '1px solid var(--c-border, #E4E2DD)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <FiUserPlus size={14} /> Asignar
          </button>
          <button
            type="button"
            onClick={() => handleCambiarTab('editar')}
            className="inv-modal-btn"
            style={{
              flex: 1,
              backgroundColor: tab === 'editar' ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
              color: tab === 'editar' ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
              border: '1px solid var(--c-border, #E4E2DD)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <FiUsers size={14} /> Editar
          </button>
        </div>

        {/* ── Pestaña Asignar: elegir proveedor ── */}
        {tab === 'asignar' && !proveedorParaAsignar && (
          <div className="inv-modal-scroll">
            {cargandoDisponibles ? (
              <div className="inv-modal-recom-empty">
                <span>Cargando proveedores...</span>
              </div>
            ) : disponibles.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiCheckCircle size={20} color="#639922" />
                <span>No hay proveedores disponibles para asignar. Créalos primero desde "Gestión de proveedores".</span>
              </div>
            ) : (
              <div className="inv-modal-recom-list">
                {disponibles.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleElegirParaAsignar(p)}
                    className="inv-modal-row-between"
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                      background: 'transparent', cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    <div className="inv-modal-row" style={{ gap: 10 }}>
                      <span className="inv-avatar-lg" style={{ width: 34, height: 34, fontSize: 13 }}>{getInitials(p.nombre)}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>{p.empresa}</p>
                      </div>
                    </div>
                    <FiChevronRight size={16} color="var(--c-textSecondary, #7F8C8D)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pestaña Asignar: días de visita del proveedor elegido ── */}
        {tab === 'asignar' && proveedorParaAsignar && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarAsignacion}>
            <button
              type="button"
              onClick={handleVolverADisponibles}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Elegir otro proveedor
            </button>

            {erroresAsignar.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{erroresAsignar.general}</p>}

            <div className="inv-modal-row" style={{ gap: 10, marginBottom: 14 }}>
              <span className="inv-avatar-lg">{getInitials(proveedorParaAsignar.nombre)}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{proveedorParaAsignar.nombre}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-textSecondary, #7F8C8D)' }}>{proveedorParaAsignar.empresa}</p>
              </div>
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Días de visita <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <div className="inv-modal-row" style={{ flexWrap: 'wrap', gap: 7 }}>
                {DIAS_SEMANA.map(({ idx, label }) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => toggleDiaAsignar(idx)}
                    className={`inv-modal-dia-toggle ${diasAsignar.includes(idx) ? 'inv-modal-dia-toggle-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {erroresAsignar.dias && <p className="inv-modal-errortext">{erroresAsignar.dias}</p>}
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={guardandoAsignar}>
                {guardandoAsignar ? 'Guardando...' : 'Asignar proveedor'}
              </button>
            </div>
          </form>
        )}

        {/* ── Pestaña Editar: lista ── */}
        {tab === 'editar' && !proveedorSeleccionado && (
          <div className="inv-modal-scroll">
            {listaProveedores.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiCheckCircle size={20} color="#639922" />
                <span>Aún no hay proveedores asignados a {LOCAL_LABELS[localFijo] ?? localFijo}</span>
              </div>
            ) : (
              <div className="inv-modal-recom-list">
                {listaProveedores.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleSeleccionarProveedor(p)}
                    className="inv-modal-row-between"
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                      background: 'transparent', cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    <div className="inv-modal-row" style={{ gap: 10 }}>
                      <span className="inv-avatar-lg" style={{ width: 34, height: 34, fontSize: 13 }}>{p.initials}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>{p.empresa}</p>
                      </div>
                    </div>
                    <div className="inv-modal-row" style={{ gap: 8 }}>
                      <Badge label={p.activo ? 'Activo' : 'Inactivo'} level={p.activo ? 'ok' : 'info'} />
                      <FiChevronRight size={16} color="var(--c-textSecondary, #7F8C8D)" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pestaña Editar: formulario del proveedor seleccionado ── */}
        {tab === 'editar' && proveedorSeleccionado && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarEdicion}>
            <button
              type="button"
              onClick={handleVolverALista}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Volver a la lista
            </button>

            {editErrors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{editErrors.general}</p>}

            <div className="inv-modal-row" style={{ gap: 10, marginBottom: 14 }}>
              <span className="inv-avatar-lg">{proveedorSeleccionado.initials}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{proveedorSeleccionado.nombre}</p>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                  {proveedorSeleccionado.empresa} · {proveedorSeleccionado.telefono}
                </p>
              </div>
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Días de visita <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <div className="inv-modal-row" style={{ flexWrap: 'wrap', gap: 7 }}>
                {DIAS_SEMANA.map(({ idx, label }) => (
                  <button
                    type="button"
                    key={idx}
                    onClick={() => toggleDiaEdicion(idx)}
                    className={`inv-modal-dia-toggle ${editForm.dias.includes(idx) ? 'inv-modal-dia-toggle-active' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {editErrors.dias && <p className="inv-modal-errortext">{editErrors.dias}</p>}
            </div>

            <div className="inv-modal-row-between" style={{ marginTop: 4, marginBottom: 14, padding: '10px 12px', border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>
                  {proveedorSeleccionado.activo ? 'Proveedor activo' : 'Proveedor inactivo'}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                  {proveedorSeleccionado.activo ? 'Visible en agenda y listados' : 'Oculto de agenda y listados'}
                </p>
              </div>
              <ToggleSwitch value={proveedorSeleccionado.activo} onToggle={() => handleToggleActivo(proveedorSeleccionado)} />
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleVolverALista}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={editGuardando}>
                {editGuardando ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Registrar producto (nodo global) ────────────────────────────────
// Datos base del producto, compartidos por los 3 locales (comida rápida,
// cafetería y almacén): nombre, categoría, código de barras y unidad de
// medida. NO incluye estado activo/inactivo ni se asigna a ningún local
// automáticamente — eso se define después, al registrar el producto DENTRO
// de un local puntual (ver LocalProductoControl / GestionProductosForms).
//
// Tiene 2 pestañas (mismo diseño que ModalGestionProveedores):
//  - "Nuevo":  crea un producto (flujo en 2 pasos, ver abajo).
//  - "Editar": lista TODOS los productos globales (en vivo); al tocar uno se
//              despliega el formulario. Solo se editan nombre y categoría;
//              el código de barras y la unidad de medida quedan bloqueados.
//
// Flujo de la pestaña "Nuevo", en 2 pasos:
//  1) "codigo": se lee el código con la pistola (a integrar más adelante)
//     o se ingresa manualmente, y se verifica si ya existe en el nodo
//     global antes de seguir.
//  2) "formulario": si el código no existe, se completan los datos base
//     y se guarda el producto.
export function ModalRegistrarProductoGlobal({ visible, onClose, onGuardado }) {
  const FORM_INIT = { nombre: '', categoria: CATEGORIAS[0], codigoBarra: '', unidadMedida: 'unidad' };

  const [tab, setTab] = useState('nuevo'); // 'nuevo' | 'editar'
  const [mensajeExito, mostrarExito, ocultarExito] = useMensajeExito();

  const [paso, setPaso]                       = useState('codigo'); // 'codigo' | 'formulario'
  const [codigoInput, setCodigoInput]         = useState('');
  const [verificando, setVerificando]         = useState(false);
  const [errorCodigo, setErrorCodigo]         = useState('');
  const [productoExistente, setProductoExistente] = useState(null);

  const [form, setForm]           = useState(FORM_INIT);
  const [errors, setErrors]       = useState({});
  const [guardando, setGuardando] = useState(false);

  // ── Pestaña "Editar" ──
  const [listaGlobal, setListaGlobal]         = useState([]);
  const [productoEditId, setProductoEditId]   = useState(null);
  const [editForm, setEditForm]               = useState({ nombre: '', categoria: CATEGORIAS[0] });
  const [editErrors, setEditErrors]           = useState({});
  const [editGuardando, setEditGuardando]     = useState(false);
  const [busquedaCodigo, setBusquedaCodigo]   = useState('');

  // Se suscribe a TODOS los productos globales mientras el modal esté abierto.
  useEffect(() => {
    if (!visible) return undefined;
    const cancelar = suscribirProductosGlobales(setListaGlobal);
    return cancelar;
  }, [visible]);

  const productosOrdenados = [...listaGlobal].sort((a, b) =>
    (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')
  );
  const productosFiltrados = busquedaCodigo
    ? productosOrdenados.filter(p => (p.codigoBarra ?? '').includes(busquedaCodigo))
    : productosOrdenados;
  const productoSeleccionado = listaGlobal.find(p => p.id === productoEditId) ?? null;

  function limpiarCodigo(valor) {
    return valor.replace(/\D/g, '');
  }

  function handleClose() {
    setTab('nuevo');
    setBusquedaCodigo('');
    ocultarExito();
    handleVolverALista();
    setPaso('codigo');
    setCodigoInput('');
    setErrorCodigo('');
    setProductoExistente(null);
    setForm(FORM_INIT);
    setErrors({});
    onClose();
  }

  // Simula la lectura con pistola para la búsqueda de la pestaña "Editar" —
  // reemplazar por la integración real del lector/cámara (igual que handleEscanear).
  function handleEscanearBusqueda() {
    setBusquedaCodigo('7891234560099');
  }

  // Simula la lectura con pistola — reemplazar por la integración real del lector/cámara
  function handleEscanear() {
    setCodigoInput('7891234560099');
    setErrorCodigo('');
    setProductoExistente(null);
  }

  async function handleVerificar(e) {
    e.preventDefault();
    const codigo = codigoInput.trim();
    if (!codigo) {
      setErrorCodigo('Ingresa o escanea un código de barras');
      return;
    }
    setErrorCodigo('');
    setProductoExistente(null);
    setVerificando(true);
    try {
      const existente = await obtenerProductoPorCodigoBarra(codigo);
      if (existente) {
        setProductoExistente(existente);
        return;
      }
      setForm(prev => ({ ...prev, codigoBarra: codigo }));
      setPaso('formulario');
    } catch (err) {
      setErrorCodigo('No se pudo verificar el código. Intenta nuevamente.');
    } finally {
      setVerificando(false);
    }
  }

  function handleVolverACodigo() {
    setPaso('codigo');
    setErrors({});
  }

  async function handleGuardar(e) {
    e.preventDefault();
    setErrors({});
    setGuardando(true);
    try {
      const creado = await crearProductoGlobal(form);
      onGuardado?.(creado);
      setForm(FORM_INIT);
      setCodigoInput('');
      setProductoExistente(null);
      setPaso('codigo');
      mostrarExito('Producto creado correctamente');
    } catch (err) {
      setErrors(err?.errores ?? { general: 'No se pudo guardar el producto. Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  }

  // ───────────────────────── Editar ─────────────────────────
  function handleSeleccionarProducto(p) {
    setProductoEditId(p.id);
    setEditForm({ nombre: p.nombre, categoria: p.categoria || CATEGORIAS[0] });
    setEditErrors({});
  }

  function handleVolverALista() {
    setProductoEditId(null);
    setEditForm({ nombre: '', categoria: CATEGORIAS[0] });
    setEditErrors({});
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!productoSeleccionado) return;
    setEditErrors({});
    setEditGuardando(true);
    try {
      // El controller valida el producto completo: se reenvían sin cambios
      // el código de barras y la unidad de medida (no editables).
      await actualizarProductoGlobal(productoSeleccionado.id, {
        nombre:       editForm.nombre,
        categoria:    editForm.categoria,
        codigoBarra:  productoSeleccionado.codigoBarra,
        unidadMedida: productoSeleccionado.unidadMedida,
      });
      handleVolverALista();
      mostrarExito('Producto actualizado correctamente');
    } catch (err) {
      setEditErrors(err?.errores ?? { general: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
    } finally {
      setEditGuardando(false);
    }
  }

  function handleCambiarTab(nuevoTab) {
    setTab(nuevoTab);
    setErrors({});
    setErrorCodigo('');
    setBusquedaCodigo('');
    ocultarExito();
    handleVolverALista();
  }

  const estiloTab = (activa) => ({
    flex: 1,
    backgroundColor: activa ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
    color: activa ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
    border: '1px solid var(--c-border, #E4E2DD)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  });

  if (!visible) return null;

  return (
    <div className="inv-modal-overlay" onClick={handleClose}>
      <div className="inv-modal-sheet inv-modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between" style={{ marginBottom: 6 }}>
          <h2 className="inv-modal-title">
            {tab === 'editar' ? 'Productos registrados' : (paso === 'codigo' ? 'Registrar producto' : 'Datos del producto')}
          </h2>
          <button type="button" className="inv-modal-close" onClick={handleClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <p className="inv-modal-hint-inline" style={{ marginBottom: 14, display: 'block' }}>
          Datos base del producto, compartidos por los 3 locales (comida rápida, cafetería y almacén).
          El stock, precio y proveedor se gestionan por separado en cada local.
        </p>

        <MensajeExito texto={mensajeExito} />

        {/* Selector de pestaña */}
        <div className="inv-modal-row" style={{ gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => handleCambiarTab('nuevo')} className="inv-modal-btn" style={estiloTab(tab === 'nuevo')}>
            <FiPlusCircle size={14} /> Nuevo
          </button>
          <button type="button" onClick={() => handleCambiarTab('editar')} className="inv-modal-btn" style={estiloTab(tab === 'editar')}>
            <FiClipboard size={14} /> Editar
          </button>
        </div>

        {/* ── Paso 1: verificar código de barras ── */}
        {tab === 'nuevo' && paso === 'codigo' && (
          <form className="inv-modal-scroll" onSubmit={handleVerificar}>
            <button
              type="button"
              onClick={handleEscanear}
              className="inv-modal-row"
              style={{
                width: '100%', gap: 10, justifyContent: 'center', padding: '16px 12px',
                border: '1.5px dashed var(--c-border, #E4E2DD)', borderRadius: 12,
                background: 'var(--c-surface2, transparent)', cursor: 'pointer', marginBottom: 8,
              }}
            >
              <FiClipboard size={18} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>Escanear código de barras</span>
            </button>
            <p className="inv-modal-hint-inline" style={{ textAlign: 'center', marginBottom: 12, display: 'block' }}>
              Usa la pistola lectora o ingresa el código manualmente abajo
            </p>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Código de barras <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errorCodigo ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                inputMode="numeric"
                placeholder="Ej: 7891234560012"
                value={codigoInput}
                onChange={(e) => {
                  setCodigoInput(limpiarCodigo(e.target.value));
                  setErrorCodigo('');
                  setProductoExistente(null);
                }}
              />
              {errorCodigo && <p className="inv-modal-errortext">{errorCodigo}</p>}
            </div>

            {productoExistente && (
              <div
                className="inv-modal-row"
                style={{
                  gap: 10, padding: '10px 12px', border: '1px solid #F2C94C',
                  background: 'rgba(242, 201, 76, 0.12)', borderRadius: 10, marginBottom: 12,
                }}
              >
                <FiAlertTriangle size={16} color="#8A6D1D" />
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Este código ya está registrado</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                    {productoExistente.nombre} · {productoExistente.categoria}
                  </p>
                </div>
              </div>
            )}

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={verificando}>
                {verificando ? 'Verificando...' : 'Verificar código'}
              </button>
            </div>
          </form>
        )}

        {/* ── Paso 2: formulario de datos del producto ── */}
        {tab === 'nuevo' && paso === 'formulario' && (
          <form className="inv-modal-scroll" onSubmit={handleGuardar}>
            <button
              type="button"
              onClick={handleVolverACodigo}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Cambiar código
            </button>

            {errors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{errors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">Código de barras</label>
              <input className="inv-modal-input" type="text" value={form.codigoBarra} disabled />
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre del producto <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                placeholder="Ej: Coca Cola 2.5 lts"
                value={form.nombre}
                onChange={(e) => setForm(prev => ({ ...prev, nombre: e.target.value }))}
              />
              <p className="inv-modal-hint-inline" style={{ marginTop: 4, display: 'block' }}>
                Ingrese nombre del producto junto a su medida
              </p>
              {errors.nombre && <p className="inv-modal-errortext">{errors.nombre}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Categoría <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <div className="inv-modal-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIAS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, categoria: cat }))}
                    className={`inv-modal-dia-toggle ${form.categoria === cat ? 'inv-modal-dia-toggle-active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {errors.categoria && <p className="inv-modal-errortext">{errors.categoria}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Unidad de medida <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <p className="inv-modal-hint-inline" style={{ marginBottom: 6, display: 'block' }}>
                Cómo se vende este producto: por unidad, por litro o por kilo
              </p>
              <div className="inv-modal-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {UNIDADES_MEDIDA.map((u) => (
                  <button
                    key={u.value}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, unidadMedida: u.value }))}
                    className={`inv-modal-dia-toggle ${form.unidadMedida === u.value ? 'inv-modal-dia-toggle-active' : ''}`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>
              {errors.unidadMedida && <p className="inv-modal-errortext">{errors.unidadMedida}</p>}
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar producto'}
              </button>
            </div>
          </form>
        )}

        {/* ── Pestaña Editar: lista ── */}
        {tab === 'editar' && !productoSeleccionado && (
          <div className="inv-modal-scroll">
            {productosOrdenados.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleEscanearBusqueda}
                  className="inv-modal-row"
                  style={{
                    width: '100%', gap: 10, justifyContent: 'center', padding: '16px 12px',
                    border: '1.5px dashed var(--c-border, #E4E2DD)', borderRadius: 12,
                    background: 'var(--c-surface2, transparent)', cursor: 'pointer', marginBottom: 8,
                  }}
                >
                  <FiClipboard size={18} />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>Escanear código de barras</span>
                </button>
                <p className="inv-modal-hint-inline" style={{ textAlign: 'center', marginBottom: 12, display: 'block' }}>
                  Usa la pistola lectora o ingresa el código manualmente abajo
                </p>

                <div className="inv-modal-formgroup" style={{ marginBottom: 12 }}>
                  <label className="inv-modal-formlabel">Código de barras</label>
                  <input
                    className="inv-modal-input"
                    type="text"
                    inputMode="numeric"
                    placeholder="Ej: 7891234560012"
                    value={busquedaCodigo}
                    onChange={(e) => setBusquedaCodigo(limpiarCodigo(e.target.value))}
                  />
                </div>
              </>
            )}

            {productosOrdenados.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiCheckCircle size={20} color="#639922" />
                <span>Aún no hay productos registrados</span>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiAlertTriangle size={20} color="#8A6D1D" />
                <span>No hay productos con ese código de barras</span>
              </div>
            ) : (
              <div className="inv-modal-recom-list">
                {productosFiltrados.map(p => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => handleSeleccionarProducto(p)}
                    className="inv-modal-row-between"
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                      background: 'transparent', cursor: 'pointer', marginBottom: 8,
                    }}
                  >
                    <div className="inv-modal-row" style={{ gap: 10 }}>
                      <span className="inv-avatar-lg" style={{ width: 34, height: 34, fontSize: 13 }}>{getInitials(p.nombre)}</span>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{p.nombre}</p>
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                          {p.categoria} · {p.codigoBarra}
                        </p>
                      </div>
                    </div>
                    <FiChevronRight size={16} color="var(--c-textSecondary, #7F8C8D)" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Pestaña Editar: formulario del producto seleccionado ── */}
        {tab === 'editar' && productoSeleccionado && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarEdicion}>
            <button
              type="button"
              onClick={handleVolverALista}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Volver a la lista
            </button>

            {editErrors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{editErrors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">Código de barras</label>
              <input className="inv-modal-input" type="text" value={productoSeleccionado.codigoBarra} disabled />
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre del producto <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={editErrors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                value={editForm.nombre}
                onChange={(e) => {
                  setEditForm(prev => ({ ...prev, nombre: e.target.value }));
                  setEditErrors(prev => ({ ...prev, nombre: undefined }));
                }}
              />
              {editErrors.nombre && <p className="inv-modal-errortext">{editErrors.nombre}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Categoría <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <div className="inv-modal-row" style={{ gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIAS.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEditForm(prev => ({ ...prev, categoria: cat }))}
                    className={`inv-modal-dia-toggle ${editForm.categoria === cat ? 'inv-modal-dia-toggle-active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {editErrors.categoria && <p className="inv-modal-errortext">{editErrors.categoria}</p>}
            </div>

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">Unidad de medida</label>
              <input
                className="inv-modal-input"
                type="text"
                value={UNIDADES_MEDIDA.find(u => u.value === productoSeleccionado.unidadMedida)?.label ?? productoSeleccionado.unidadMedida}
                disabled
              />
            </div>

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleVolverALista}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={editGuardando}>
                {editGuardando ? 'Guardando...' : 'Actualizar producto'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Modal: Gestión de recetas globales (nodo global) ───────────────────────
// Plantilla única de ingredientes/cantidades, compartida por todo el sistema.
// NO almacena precio, estado ni productos de local: eso lo define después
// cada local por separado. Las cantidades acá son la fuente de verdad que
// se usará para descontar inventario automáticamente al vender.
//
// Tiene 2 pestañas (mismo diseño que ModalGestionProveedores):
//  - "Nueva":  crea una receta global.
//  - "Editar": lista las recetas registradas; al tocar una se despliega el
//              formulario de edición. Solo se pueden modificar el nombre de
//              la receta y, por ingrediente, la cantidad y la equivalencia.

// Solo dígitos y un único separador decimal (acepta coma o punto).
function limpiarCantidad(valor) {
  const soloNumeros = valor.replace(',', '.').replace(/[^0-9.]/g, '');
  const [entero, ...resto] = soloNumeros.split('.');
  return resto.length ? `${entero}.${resto.join('')}` : entero;
}

const EDIT_FORM_INIT = { nombre: '', ingredientes: [] };

export function ModalRecetaGlobal({ visible, onClose, onGuardado }) {
  const FORM_INIT = { nombre: '', ingredientes: [crearIngredienteVacio()] };

  const [tab, setTab] = useState('nuevo'); // 'nuevo' | 'editar'
  const [mensajeExito, mostrarExito, ocultarExito] = useMensajeExito();
  const [recetasExistentes, setRecetasExistentes] = useState([]);

  // ── Pestaña "Nueva" ──
  const [form, setForm]           = useState(FORM_INIT);
  const [errors, setErrors]       = useState({});
  const [guardando, setGuardando] = useState(false);
  const [confirmarCreacion, setConfirmarCreacion] = useState(false);

  // ── Pestaña "Editar" ──
  const [recetaEditId, setRecetaEditId]   = useState(null);
  const [editForm, setEditForm]           = useState(EDIT_FORM_INIT);
  const [editErrors, setEditErrors]       = useState({});
  const [editGuardando, setEditGuardando] = useState(false);
  const [busquedaNombre, setBusquedaNombre] = useState('');

  const cargarRecetas = useCallback(async () => {
    try {
      setRecetasExistentes(await obtenerRecetasGlobales());
    } catch {
      setRecetasExistentes([]);
    }
  }, []);

  useEffect(() => {
    if (visible) cargarRecetas();
  }, [visible, cargarRecetas]);

  const recetasOrdenadas = [...recetasExistentes].sort((a, b) =>
    (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es')
  );
  const recetasFiltradas = busquedaNombre.trim()
    ? recetasOrdenadas.filter(r => normalizarTexto(r.nombre).includes(normalizarTexto(busquedaNombre)))
    : recetasOrdenadas;
  const recetaSeleccionada = recetasExistentes.find(r => r.id === recetaEditId) ?? null;

  // ───────────────────────── Nueva ─────────────────────────
  function handleNombreChange(valor) {
    setForm(prev => ({ ...prev, nombre: valor }));
    setErrors(prev => ({ ...prev, nombre: undefined }));
  }

  function handleAgregarIngrediente() {
    setForm(prev => ({
      ...prev,
      ingredientes: [...prev.ingredientes, crearIngredienteVacio()],
    }));
  }

  function handleEliminarIngrediente(id) {
    setForm(prev => ({
      ...prev,
      ingredientes: prev.ingredientes.filter(ing => ing.id !== id),
    }));
    setErrors(prev => ({ ...prev, ingredientesDetalle: undefined }));
  }

  function handleIngredienteChange(id, campo, valor) {
    setForm(prev => ({
      ...prev,
      ingredientes: prev.ingredientes.map(ing =>
        ing.id === id ? { ...ing, [campo]: valor } : ing
      ),
    }));
  }

  // Paso 1: valida el formulario. Si está todo bien, pide confirmación
  // antes de crear (después no se podrán agregar ni quitar ingredientes).
  function handleGuardar(e) {
    e.preventDefault();
    setErrors({});

    const erroresValidacion = validarReceta(form, recetasExistentes);
    if (!esRecetaValida(erroresValidacion)) {
      setErrors(erroresValidacion);
      return;
    }

    setConfirmarCreacion(true);
  }

  // Paso 2: el usuario confirmó; recién ahí se crea la receta.
  async function handleConfirmarCreacion() {
    setConfirmarCreacion(false);
    setErrors({});
    setGuardando(true);
    try {
      const creada = await crearRecetaGlobal(form);
      onGuardado?.(creada);
      setForm({ nombre: '', ingredientes: [crearIngredienteVacio()] });
      await cargarRecetas();
      mostrarExito('Receta creada correctamente');
    } catch (err) {
      setErrors(err?.errores ?? { general: 'No se pudo guardar la receta. Intenta nuevamente.' });
    } finally {
      setGuardando(false);
    }
  }

  // ───────────────────────── Editar ─────────────────────────
  function handleSeleccionarReceta(receta) {
    setRecetaEditId(receta.id);
    setEditForm({
      nombre: receta.nombre ?? '',
      ingredientes: (receta.ingredientes ?? []).map(ing => ({
        ...ing,
        cantidad: String(ing.cantidad ?? ''),
        equivalencia: ing.equivalencia ?? '',
      })),
    });
    setEditErrors({});
  }

  function handleVolverALista() {
    setRecetaEditId(null);
    setEditForm(EDIT_FORM_INIT);
    setEditErrors({});
  }

  function handleEditNombreChange(valor) {
    setEditForm(prev => ({ ...prev, nombre: valor }));
    setEditErrors(prev => ({ ...prev, nombre: undefined }));
  }

  function handleEditIngredienteChange(id, campo, valor) {
    setEditForm(prev => ({
      ...prev,
      ingredientes: prev.ingredientes.map(ing =>
        ing.id === id ? { ...ing, [campo]: valor } : ing
      ),
    }));
    setEditErrors(prev => ({ ...prev, ingredientesDetalle: undefined }));
  }

  async function handleGuardarEdicion(e) {
    e.preventDefault();
    if (!recetaEditId) return;
    setEditErrors({});

    if (existeNombreReceta(editForm.nombre, recetasExistentes, recetaEditId)) {
      setEditErrors({ nombre: 'Ya existe una receta con este nombre' });
      return;
    }

    setEditGuardando(true);
    try {
      const actualizada = await actualizarRecetaGlobal(recetaEditId, editForm);
      onGuardado?.(actualizada);
      await cargarRecetas();
      handleVolverALista();
      mostrarExito('Receta actualizada correctamente');
    } catch (err) {
      setEditErrors(err?.errores ?? { general: 'No se pudieron guardar los cambios. Intenta nuevamente.' });
    } finally {
      setEditGuardando(false);
    }
  }

  // ───────────────────────── Navegación ─────────────────────────
  function handleClose() {
    setTab('nuevo');
    setForm(FORM_INIT);
    setErrors({});
    setConfirmarCreacion(false);
    setBusquedaNombre('');
    ocultarExito();
    handleVolverALista();
    onClose();
  }

  function handleCambiarTab(nuevoTab) {
    setTab(nuevoTab);
    setErrors({});
    setBusquedaNombre('');
    ocultarExito();
    handleVolverALista();
  }

  if (!visible) return null;

  const erroresIngredientes     = errors.ingredientesDetalle ?? [];
  const erroresIngredientesEdit = editErrors.ingredientesDetalle ?? [];

  const estiloTab = (activa) => ({
    flex: 1,
    backgroundColor: activa ? 'var(--c-btnBg, #1B1B1B)' : 'transparent',
    color: activa ? 'var(--c-btnText, #fff)' : 'var(--c-textSecondary, #7F8C8D)',
    border: '1px solid var(--c-border, #E4E2DD)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  });

  const etiquetaOpcional = (
    <span style={{ color: 'var(--c-textSecondary, #7F8C8D)', fontWeight: 400 }}> (opcional)</span>
  );

  return (
    <div className="inv-modal-overlay" onClick={handleClose}>
      <div className="inv-modal-sheet inv-modal-sheet-tall" onClick={(e) => e.stopPropagation()}>
        <div className="inv-modal-handle" />
        <div className="inv-modal-row-between" style={{ marginBottom: 6 }}>
          <h2 className="inv-modal-title">{tab === 'nuevo' ? 'Nueva receta global' : 'Recetas registradas'}</h2>
          <button type="button" className="inv-modal-close" onClick={handleClose} aria-label="Cerrar">
            <FiX size={20} />
          </button>
        </div>

        <p className="inv-modal-hint-inline" style={{ marginBottom: 14, display: 'block' }}>
          Plantilla única de ingredientes para todo el sistema. El precio, el estado y los
          productos de inventario se definen después, por cada local.
        </p>

        <MensajeExito texto={mensajeExito} />

        {/* Selector de pestaña */}
        <div className="inv-modal-row" style={{ gap: 8, marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => handleCambiarTab('nuevo')}
            className="inv-modal-btn"
            style={estiloTab(tab === 'nuevo')}
          >
            <FiPlusCircle size={14} /> Nueva
          </button>
          <button
            type="button"
            onClick={() => handleCambiarTab('editar')}
            className="inv-modal-btn"
            style={estiloTab(tab === 'editar')}
          >
            <FiClipboard size={14} /> Editar
          </button>
        </div>

        {/* ── Pestaña Nueva ── */}
        {tab === 'nuevo' && (
          <form className="inv-modal-scroll" onSubmit={handleGuardar}>
            {errors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{errors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre de la receta <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={errors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                placeholder="Ej: Completo Italiano"
                value={form.nombre}
                onChange={(e) => handleNombreChange(e.target.value)}
              />
              {errors.nombre && <p className="inv-modal-errortext">{errors.nombre}</p>}
            </div>

            <div className="inv-modal-row-between" style={{ marginTop: 10, marginBottom: 8 }}>
              <label className="inv-modal-formlabel" style={{ margin: 0 }}>
                Ingredientes <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleAgregarIngrediente}
                className="inv-modal-btn inv-modal-btn-secondary"
                style={{ padding: '6px 12px', fontSize: 12.5 }}
              >
                + Agregar ingrediente
              </button>
            </div>
            {errors.ingredientes && <p className="inv-modal-errortext" style={{ marginBottom: 8 }}>{errors.ingredientes}</p>}

            {form.ingredientes.map((ingrediente, index) => {
              const erroresIng = erroresIngredientes[index] ?? {};
              return (
                <div
                  key={ingrediente.id}
                  style={{
                    border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                    padding: '12px', marginBottom: 10,
                  }}
                >
                  <div className="inv-modal-row-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                      Ingrediente {index + 1}
                    </span>
                    {form.ingredientes.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleEliminarIngrediente(ingrediente.id)}
                        className="inv-modal-close"
                        style={{ width: 24, height: 24 }}
                        aria-label="Eliminar ingrediente"
                      >
                        <FiX size={14} />
                      </button>
                    )}
                  </div>

                  <div className="inv-modal-formgroup" style={{ marginBottom: 8 }}>
                    <label className="inv-modal-formlabel">Nombre</label>
                    <input
                      className="inv-modal-input"
                      style={erroresIng.nombre ? { borderColor: '#E24B4A' } : undefined}
                      type="text"
                      placeholder="Ej: Pan"
                      value={ingrediente.nombre}
                      onChange={(e) => handleIngredienteChange(ingrediente.id, 'nombre', e.target.value)}
                    />
                    {erroresIng.nombre && <p className="inv-modal-errortext">{erroresIng.nombre}</p>}
                  </div>

                  <div className="inv-modal-row" style={{ gap: 8 }}>
                    <div className="inv-modal-formgroup" style={{ marginBottom: 8, flex: 1 }}>
                      <label className="inv-modal-formlabel">Cantidad</label>
                      <input
                        className="inv-modal-input"
                        style={erroresIng.cantidad ? { borderColor: '#E24B4A' } : undefined}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Ej: 80"
                        value={ingrediente.cantidad}
                        onChange={(e) => handleIngredienteChange(ingrediente.id, 'cantidad', e.target.value)}
                      />
                      {erroresIng.cantidad && <p className="inv-modal-errortext">{erroresIng.cantidad}</p>}
                    </div>

                    <div className="inv-modal-formgroup" style={{ marginBottom: 8, width: 100 }}>
                      <label className="inv-modal-formlabel">Unidad</label>
                      <select
                        className="inv-modal-input"
                        style={erroresIng.unidadMedida ? { borderColor: '#E24B4A' } : undefined}
                        value={ingrediente.unidadMedida}
                        onChange={(e) => handleIngredienteChange(ingrediente.id, 'unidadMedida', e.target.value)}
                      >
                        {UNIDADES_MEDIDA_RECETA.map(u => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                      {erroresIng.unidadMedida && <p className="inv-modal-errortext">{erroresIng.unidadMedida}</p>}
                    </div>
                  </div>

                  <div className="inv-modal-formgroup">
                    <label className="inv-modal-formlabel">Equivalencia{etiquetaOpcional}</label>
                    <input
                      className="inv-modal-input"
                      style={erroresIng.equivalencia ? { borderColor: '#E24B4A' } : undefined}
                      type="text"
                      placeholder="Ej: 1 marraqueta"
                      value={ingrediente.equivalencia}
                      onChange={(e) => handleIngredienteChange(ingrediente.id, 'equivalencia', e.target.value)}
                    />
                    {erroresIng.equivalencia && <p className="inv-modal-errortext">{erroresIng.equivalencia}</p>}
                  </div>
                </div>
              );
            })}

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleClose}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar receta'}
              </button>
            </div>
          </form>
        )}

        {/* ── Pestaña Editar: lista ── */}
        {tab === 'editar' && !recetaSeleccionada && (
          <div className="inv-modal-scroll">
            {recetasOrdenadas.length > 0 && (
              <div className="inv-modal-formgroup" style={{ marginBottom: 12 }}>
                <label className="inv-modal-formlabel">Buscar receta por nombre</label>
                <input
                  className="inv-modal-input"
                  type="text"
                  placeholder="Ej: Completo Italiano"
                  value={busquedaNombre}
                  onChange={(e) => setBusquedaNombre(e.target.value)}
                />
              </div>
            )}

            {recetasOrdenadas.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiCheckCircle size={20} color="#639922" />
                <span>Aún no hay recetas registradas</span>
              </div>
            ) : recetasFiltradas.length === 0 ? (
              <div className="inv-modal-recom-empty">
                <FiAlertTriangle size={20} color="#8A6D1D" />
                <span>No hay recetas con ese nombre</span>
              </div>
            ) : (
              <div className="inv-modal-recom-list">
                {recetasFiltradas.map(r => {
                  const cantidadIngredientes = (r.ingredientes ?? []).length;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => handleSeleccionarReceta(r)}
                      className="inv-modal-row-between"
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 12px',
                        border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                        background: 'transparent', cursor: 'pointer', marginBottom: 8,
                      }}
                    >
                      <div className="inv-modal-row" style={{ gap: 10 }}>
                        <span className="inv-avatar-lg" style={{ width: 34, height: 34, fontSize: 13 }}>{getInitials(r.nombre)}</span>
                        <div>
                          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>{r.nombre}</p>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                            {cantidadIngredientes} {cantidadIngredientes === 1 ? 'ingrediente' : 'ingredientes'}
                          </p>
                        </div>
                      </div>
                      <FiChevronRight size={16} color="var(--c-textSecondary, #7F8C8D)" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Pestaña Editar: formulario de la receta seleccionada ── */}
        {tab === 'editar' && recetaSeleccionada && (
          <form className="inv-modal-scroll" onSubmit={handleGuardarEdicion}>
            <button
              type="button"
              onClick={handleVolverALista}
              className="inv-modal-row"
              style={{ gap: 4, background: 'none', border: 'none', padding: 0, marginBottom: 12, cursor: 'pointer', color: 'var(--c-textSecondary, #7F8C8D)' }}
            >
              <FiChevronLeft size={16} /> Volver a la lista
            </button>

            {editErrors.general && <p className="inv-modal-errortext" style={{ marginBottom: 10 }}>{editErrors.general}</p>}

            <div className="inv-modal-formgroup">
              <label className="inv-modal-formlabel">
                Nombre de la receta <span style={{ color: '#E24B4A' }}>*</span>
              </label>
              <input
                className="inv-modal-input"
                style={editErrors.nombre ? { borderColor: '#E24B4A' } : undefined}
                type="text"
                value={editForm.nombre}
                onChange={(e) => handleEditNombreChange(e.target.value)}
              />
              {editErrors.nombre && <p className="inv-modal-errortext">{editErrors.nombre}</p>}
            </div>

            <label className="inv-modal-formlabel" style={{ marginTop: 10 }}>Ingredientes</label>
            <p className="inv-modal-hint-inline" style={{ marginBottom: 8, display: 'block' }}>
              Solo se puede modificar la cantidad y la equivalencia de cada ingrediente.
            </p>
            {editErrors.ingredientes && <p className="inv-modal-errortext" style={{ marginBottom: 8 }}>{editErrors.ingredientes}</p>}

            {editForm.ingredientes.map((ingrediente, index) => {
              const erroresIng = erroresIngredientesEdit[index] ?? {};
              return (
                <div
                  key={ingrediente.id}
                  style={{
                    border: '1px solid var(--c-border, #E4E2DD)', borderRadius: 10,
                    padding: '12px', marginBottom: 10,
                  }}
                >
                  <span style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginBottom: 8, color: 'var(--c-textSecondary, #7F8C8D)' }}>
                    Ingrediente {index + 1}
                  </span>

                  <div className="inv-modal-formgroup" style={{ marginBottom: 8 }}>
                    <label className="inv-modal-formlabel">Nombre</label>
                    <input className="inv-modal-input" type="text" value={ingrediente.nombre} disabled />
                    {erroresIng.nombre && <p className="inv-modal-errortext">{erroresIng.nombre}</p>}
                  </div>

                  <div className="inv-modal-row" style={{ gap: 8 }}>
                    <div className="inv-modal-formgroup" style={{ marginBottom: 8, flex: 1 }}>
                      <label className="inv-modal-formlabel">Cantidad</label>
                      <input
                        className="inv-modal-input"
                        style={erroresIng.cantidad ? { borderColor: '#E24B4A' } : undefined}
                        type="text"
                        inputMode="decimal"
                        placeholder="Ej: 80"
                        value={ingrediente.cantidad}
                        onChange={(e) => handleEditIngredienteChange(ingrediente.id, 'cantidad', limpiarCantidad(e.target.value))}
                      />
                      {erroresIng.cantidad && <p className="inv-modal-errortext">{erroresIng.cantidad}</p>}
                    </div>

                    <div className="inv-modal-formgroup" style={{ marginBottom: 8, width: 100 }}>
                      <label className="inv-modal-formlabel">Unidad</label>
                      <select className="inv-modal-input" value={ingrediente.unidadMedida} disabled>
                        {UNIDADES_MEDIDA_RECETA.map(u => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="inv-modal-formgroup">
                    <label className="inv-modal-formlabel">Equivalencia{etiquetaOpcional}</label>
                    <input
                      className="inv-modal-input"
                      type="text"
                      placeholder="Ej: 1 marraqueta"
                      value={ingrediente.equivalencia}
                      onChange={(e) => handleEditIngredienteChange(ingrediente.id, 'equivalencia', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}

            <div className="inv-modal-row" style={{ gap: 10, marginTop: 6, marginBottom: 8 }}>
              <button type="button" className="inv-modal-btn inv-modal-btn-secondary" onClick={handleVolverALista}>
                Cancelar
              </button>
              <button type="submit" className="inv-modal-btn inv-modal-btn-primary" disabled={editGuardando}>
                {editGuardando ? 'Guardando...' : 'Actualizar receta'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Confirmación antes de crear la receta ── */}
      {confirmarCreacion && (
        <div
          onClick={(e) => { e.stopPropagation(); setConfirmarCreacion(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20, backgroundColor: 'rgba(0, 0, 0, 0.45)',
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirmar-receta-titulo"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 380, padding: 20, borderRadius: 14,
              backgroundColor: 'var(--c-surface, #fff)',
              border: '1px solid var(--c-border, #E4E2DD)',
            }}
          >
            <div className="inv-modal-row" style={{ gap: 10, marginBottom: 10 }}>
              <FiAlertTriangle size={22} color="#8A6D1D" />
              <h3 id="confirmar-receta-titulo" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                ¿Crear la receta?
              </h3>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: 13.5, lineHeight: 1.45 }}>
              Una vez creada, <strong>no podrás agregar ni quitar ingredientes</strong>.
              Solo podrás editar el nombre de la receta, la cantidad y la equivalencia de cada ingrediente.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--c-textSecondary, #7F8C8D)' }}>
              Revisa que todo esté correcto. ¿Estás seguro de crear la receta?
            </p>
            <div className="inv-modal-row" style={{ gap: 10 }}>
              <button
                type="button"
                className="inv-modal-btn inv-modal-btn-secondary"
                onClick={() => setConfirmarCreacion(false)}
              >
                Revisar
              </button>
              <button
                type="button"
                className="inv-modal-btn inv-modal-btn-primary"
                onClick={handleConfirmarCreacion}
              >
                Sí, crear receta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}