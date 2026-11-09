import { useState, useEffect } from 'react';
import { productosDisponiblesParaIngrediente, calcularProduccionEstimada } from '../../models/RecetaLocalModel';
import { suscribirModificacionesReceta, leerStockBase } from '../../controllers/HistorialRecetaControl';
import { formatStock } from './gestionProductosData';

// ─── Helpers de presentación ─────────────────────────────────────────────────

const unidadesTxt = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;
const inicial = (nombre) => (nombre || '?').trim().charAt(0).toUpperCase();

// ─── Campo de formulario reutilizable ────────────────────────────────────────

export function FormField({ label, value, onChangeText, placeholder, type = 'text', min }) {
  return (
    <div className="rec-form-group">
      <label className="rec-form-label">{label}</label>
      <input
        className="rec-form-input"
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        placeholder={placeholder}
        autoCapitalize="none"
      />
    </div>
  );
}

// ─── Envoltorio genérico de modal (overlay + sheet, responsive) ─────────────

function ModalShell({ isDesktop, onClose, title, children, showHandle = true }) {
  return (
    <div className={`rec-modal-overlay${isDesktop ? ' desktop' : ''}`} onClick={onClose}>
      <div className={`rec-bottom-sheet${isDesktop ? ' desktop' : ''}`} onClick={(e) => e.stopPropagation()}>
        {!isDesktop && showHandle && <div className="rec-sheet-handle" />}
        <div className="rec-sheet-header">
          <span className="rec-sheet-title">{title}</span>
          <button className="rec-sheet-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="rec-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Dropdown genérico ───────────────────────────────────────────────────────
// `titulo` (opcional) es el encabezado del selector emergente cuando no se
// quiere mostrar `label` encima del botón.

export function DropdownPicker({ label, titulo, valor, opciones, onSeleccionar, placeholder }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="rec-form-group" style={{ marginBottom: 6 }}>
      {label ? <span className="rec-form-label">{label}</span> : null}
      <button type="button" className="rec-dropdown-btn" onClick={() => setVisible(true)}>
        <span className={valor ? 'rec-dropdown-text' : 'rec-dropdown-placeholder'}>
          {valor || placeholder}
        </span>
        <span className="rec-dropdown-arrow">▾</span>
      </button>

      {visible && (
        <div className="rec-picker-overlay" onClick={() => setVisible(false)}>
          <div className="rec-picker-box" onClick={(e) => e.stopPropagation()}>
            <div className="rec-picker-header">
              <span className="rec-picker-title">{titulo || label || placeholder}</span>
              <button className="rec-sheet-close" onClick={() => setVisible(false)} aria-label="Cerrar">✕</button>
            </div>
            <div className="rec-picker-list">
              {opciones.map((op) => {
                const esObjeto = op !== null && typeof op === 'object';
                const opLabel = esObjeto ? String(op.label ?? op.value ?? '') : String(op);
                const opValue = esObjeto ? (op.value ?? op.label) : op;
                const esActivo = valor === opLabel;
                return (
                  <button
                    key={String(opValue)}
                    className={`rec-picker-option${esActivo ? ' active' : ''}`}
                    onClick={() => { onSeleccionar(opValue); setVisible(false); }}
                  >
                    <span className={`rec-picker-option-text${esActivo ? ' active' : ''}`}>
                      {opLabel}
                    </span>
                    {esActivo && <span className="rec-picker-check">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Selector de receta global (paso 1 del flujo "Nueva receta") ───────────
// No crea nada todavía: solo deja elegir, de las recetas del recetario
// global que este local aún no ha asignado, cuál se va a asignar.
export function SelectorRecetaGlobal({ visible, isDesktop, recetas, busqueda, setBusqueda, onSeleccionar, onCerrar }) {
  if (!visible) return null;

  const filtradas = recetas.filter(r => r.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <ModalShell isDesktop={isDesktop} onClose={onCerrar} title="Nueva receta">
      <div className="rec-form-wrap">
        <p className="rec-form-help">
          Selecciona una receta del recetario global para asignarle productos de este local.
        </p>

        <input
          className="rec-search-input"
          style={{ background: 'var(--rec-surface2)' }}
          placeholder="Buscar receta..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        {filtradas.length === 0 ? (
          <p className="rec-form-help">No hay recetas globales disponibles para asignar.</p>
        ) : (
          <div className="rec-list" style={{ padding: 0, margin: '0 -16px' }}>
            {filtradas.map((receta) => (
              <button key={receta.id} className="rec-card" onClick={() => onSeleccionar(receta)}>
                <div className="rec-card-icon">🍽️</div>
                <div className="rec-card-info">
                  <div className="rec-card-nombre">{receta.nombre}</div>
                  <div className="rec-card-sub">{receta.ingredientes.length} ingredientes</div>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>
    </ModalShell>
  );
}

// ─── Formulario de asignación: producto local por ingrediente + precio ──────
// La receta (nombre, ingredientes, cantidades, unidades) ya existe en el
// recetario global. Acá solo se decide, ingrediente por ingrediente, qué
// producto del inventario de este local lo representa, y el precio de venta.
export function FormAsignacionReceta({
  visible, isDesktop, recetaGlobal, productosLocal,
  asignacion, setAsignacion, errores, onGuardar, onCerrar, guardando,
}) {
  if (!visible || !recetaGlobal) return null;

  function handleProductoChange(idIngredienteGlobal, idProductoLocal) {
    setAsignacion(prev => ({
      ...prev,
      ingredientes: prev.ingredientes.map(ing =>
        ing.idIngredienteGlobal === idIngredienteGlobal ? { ...ing, idProductoLocal } : ing
      ),
    }));
  }

  const erroresIngredientes = errores.ingredientesDetalle ?? [];
  const estimacion = calcularProduccionEstimada(recetaGlobal, asignacion, productosLocal);
  const hayPendientes = estimacion.detalle.some((d) => d.sinAsignar);
  const preparable = estimacion.cantidadPreparable;
  const heroNivel = hayPendientes ? 'none' : preparable > 0 ? 'ok' : 'zero';

  return (
    <ModalShell isDesktop={isDesktop} onClose={onCerrar} title={recetaGlobal.nombre}>
      <div className="rec-form-wrap">
        {errores.general && <p className="rec-form-error">{errores.general}</p>}

        <p className="rec-form-help">
          Asigna el producto de tu inventario que corresponde a cada ingrediente. La cantidad y
          unidad de medida vienen fijas desde la receta global y no se pueden modificar acá.
        </p>

        {/* Se recalcula solo, en vivo, a medida que asignas productos */}
        <div className={`rec-hero compact ${heroNivel}`}>
          <div className="rec-hero-label">Producción estimada con el stock actual</div>
          <div className="rec-hero-value">
            {preparable}
            <small>{preparable === 1 ? 'unidad' : 'unidades'}</small>
          </div>
          {hayPendientes ? (
            <div className="rec-hero-sub">Hay ingredientes sin producto asignado todavía.</div>
          ) : estimacion.ingredienteLimitante && (
            <div className="rec-hero-sub">
              Limita: <strong>{estimacion.ingredienteLimitante.nombreIngrediente}</strong>
              {estimacion.ingredienteLimitante.nombreProducto ? ` (${estimacion.ingredienteLimitante.nombreProducto})` : ''}
            </div>
          )}
        </div>

        {recetaGlobal.ingredientes.map((ing, index) => {
          const seleccion = asignacion.ingredientes.find(a => a.idIngredienteGlobal === ing.id);
          const error = erroresIngredientes[index];
          const productosDisponibles = productosDisponiblesParaIngrediente(productosLocal, ing, asignacion);
          const opciones = productosDisponibles.map(p => ({ value: p.id, label: p.nombre }));
          const nombreSeleccionado = productosLocal.find(p => p.id === seleccion?.idProductoLocal)?.nombre ?? '';
          const posibles = estimacion.detalle.find((d) => d.idIngrediente === ing.id)?.unidadesPosibles;

          return (
            <div className="rec-asig-item" key={ing.id}>
              <div className="rec-ing-top">
                <div className="rec-ing-avatar">{inicial(ing.nombre)}</div>
                <div className="rec-ing-main">
                  <div className="rec-ing-name">{ing.nombre}</div>
                  {ing.equivalencia && <div className="rec-ing-prod">{ing.equivalencia}</div>}
                </div>
                <div className="rec-ing-qty">
                  <span className="rec-ing-qty-num">{ing.cantidad}</span>
                  <span className="rec-ing-qty-unit">{ing.unidadMedida}</span>
                </div>
              </div>

              <DropdownPicker
                titulo={`Producto para ${ing.nombre}`}
                valor={nombreSeleccionado}
                opciones={opciones}
                onSeleccionar={(idProductoLocal) => handleProductoChange(ing.id, idProductoLocal)}
                placeholder="Seleccionar producto del inventario..."
              />

              {nombreSeleccionado && posibles !== undefined && (
                <div className="rec-asig-hint">
                  <span className={`rec-pill ${posibles > 0 ? 'ok' : 'bad'}`}>{unidadesTxt(posibles)}</span>
                  <span>
                    alcanza con el stock de "{nombreSeleccionado}"
                    {stockTexto(productosLocal.find(p => p.id === seleccion?.idProductoLocal)) ? ` (${stockTexto(productosLocal.find(p => p.id === seleccion?.idProductoLocal))})` : ''}
                  </span>
                </div>
              )}
              {opciones.length === 0 && (
                <div className="rec-asig-hint">
                  No hay productos marcados como "Uso para receta" disponibles para este ingrediente.
                  Márcalos en Gestión de productos.
                </div>
              )}
              {error && <div className="rec-asig-error">{error}</div>}
            </div>
          );
        })}

        <div className="rec-form-group">
          <span className="rec-form-label">Precio de venta ($) *</span>
          <input
            className="rec-form-input"
            type="number"
            min="0"
            placeholder="Ej: 2500"
            value={asignacion.precioVenta}
            onChange={(e) => setAsignacion(prev => ({ ...prev, precioVenta: e.target.value }))}
          />
          {errores.precioVenta && <div className="rec-asig-error">{errores.precioVenta}</div>}
        </div>

        <button className="rec-btn-primary" onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar asignación'}
        </button>
        <div style={{ height: 8 }} />
      </div>
    </ModalShell>
  );
}

// ─── Helpers del detalle ─────────────────────────────────────────────────────

const money = (v) => '$' + Number(v).toLocaleString('es-CL');

function stockTexto(producto) {
  const { stock, unidad } = leerStockBase(producto);
  return stock === null ? null : formatStock(stock, unidad);
}

function formatFechaHistorial(fecha) {
  // fecha llega como Firestore Timestamp (o null mientras el serverTimestamp
  // todavía no se resuelve, justo después de crear el registro).
  if (!fecha || typeof fecha.toDate !== 'function') return 'Justo ahora';
  return fecha.toDate().toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Tarjeta numérica editable con botón ✎ al lado (igual que en productos) ───

function StatEditable({ label, value, sub, editando, cambiado, draft, setDraft, onToggle }) {
  return (
    <div className={`rec-stat-card rec-stat-editable${editando ? ' editing' : ''}${cambiado ? ' changed' : ''}`}>
      <div className="rec-stat-main">
        <div className="rec-stat-label">{label}</div>
        {editando ? (
          <input
            className="rec-stat-input"
            type="number"
            min="0"
            step="1"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <>
            <div className="rec-stat-value">{value}</div>
            {sub && <div className="rec-stat-sub">{sub}</div>}
          </>
        )}
      </div>
      <button
        type="button"
        className={`rec-stat-edit-btn${editando ? ' cancel' : ''}`}
        onClick={onToggle}
        aria-label={editando ? 'Cancelar edición' : 'Editar'}
        title={editando ? 'Cancelar edición' : 'Editar'}
      >
        {editando ? '✕' : '✎'}
      </button>
    </div>
  );
}

// ─── Tarjeta de un ingrediente en el detalle ────────────────────────────────
// Muestra: cantidad requerida, equivalencia, producto del local asignado (que
// es a la vez un selector desplegable para cambiarlo), su stock actual y una
// barra con las unidades que alcanzan con ese stock.

function IngredienteItem({
  ing, nombreProducto, stockTxt, sinAsignar, posibles, maxPosibles, esLimitante,
  cambiado, puedeEditar, abierto, opciones, onToggle, onElegir,
}) {
  const nivel = sinAsignar ? 'none' : posibles === 0 ? 'zero' : esLimitante ? 'limit' : 'ok';
  const pct = sinAsignar ? 0 : posibles > 0 ? Math.max(6, Math.min(100, (posibles / maxPosibles) * 100)) : 0;

  return (
    <div className={`rec-ing-item ${nivel}${cambiado ? ' changed' : ''}`}>
      <div className="rec-ing-top">
        <div className="rec-ing-avatar">{inicial(ing.nombre)}</div>
        <div className="rec-ing-main">
          <div className="rec-ing-name">
            {ing.nombre}
            {cambiado && <span className="rec-ing-tag pending">Cambio pendiente</span>}
            {!cambiado && esLimitante && !sinAsignar && (
              <span className="rec-ing-tag">{posibles === 0 ? 'Sin stock' : 'Limita'}</span>
            )}
          </div>
          {ing.equivalencia && <div className="rec-ing-prod">≈ {ing.equivalencia}</div>}
        </div>
        <div className="rec-ing-qty">
          <span className="rec-ing-qty-num">{ing.cantidad}</span>
          <span className="rec-ing-qty-unit">{ing.unidadMedida}</span>
        </div>
      </div>

      {/* Producto asignado = selector desplegable */}
      <button
        type="button"
        className={`rec-ing-select${abierto ? ' open' : ''}${sinAsignar ? ' missing' : ''}`}
        onClick={puedeEditar ? onToggle : undefined}
        disabled={!puedeEditar}
        aria-expanded={abierto}
      >
        <div className="rec-ing-select-main">
          <div className="rec-ing-select-name">
            {sinAsignar ? 'Seleccionar producto…' : nombreProducto}
          </div>
          {!sinAsignar && (
            <div className="rec-ing-select-stock">
              Stock actual: <strong>{stockTxt ?? '—'}</strong>
            </div>
          )}
        </div>
        {puedeEditar && (
          <span className="rec-ing-select-action">
            {abierto ? 'Cerrar' : sinAsignar ? 'Asignar' : 'Cambiar'}
            <span className="rec-ing-select-arrow">▾</span>
          </span>
        )}
      </button>

      {abierto && (
        <div className="rec-opt-list" role="listbox">
          {opciones.length === 0 && (
            <div className="rec-opt-empty">
              No hay otros productos marcados como "Uso para receta" para este ingrediente.
            </div>
          )}
          {opciones.map((op) => (
            <button
              key={op.id}
              type="button"
              role="option"
              aria-selected={op.esActual}
              className={`rec-opt${op.esActual ? ' active' : ''}`}
              onClick={() => onElegir(op.id)}
            >
              <div className="rec-opt-main">
                <div className="rec-opt-name">{op.nombre}{op.esActual ? ' · actual' : ''}</div>
                <div className="rec-opt-stock">Stock: {op.stockTxt ?? '—'}</div>
              </div>
              {op.posibles !== undefined && (
                <span className={`rec-pill ${op.posibles > 0 ? 'ok' : 'bad'}`}>
                  alcanza {op.posibles}
                </span>
              )}
              {op.esActual && <span className="rec-opt-check">✓</span>}
            </button>
          ))}
        </div>
      )}

      {!sinAsignar && (
        <div className="rec-ing-meter">
          <div className="rec-ing-bar" role="img" aria-label={`${posibles} unidades posibles`}>
            <div className="rec-ing-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="rec-ing-meter-label">
            <strong>{posibles}</strong> {posibles === 1 ? 'posible' : 'posibles'}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mensaje flotante de confirmación (mismo patrón que productos) ───────────

function ConfirmarCambios({ titulo, sub, filas, error, guardando, onCancelar, onConfirmar }) {
  return (
    <div
      className="rec-modal-overlay desktop rec-confirm-overlay"
      onClick={(e) => { e.stopPropagation(); if (!guardando) onCancelar(); }}
    >
      <div className="rec-confirm-box" onClick={(e) => e.stopPropagation()}>
        <div className="rec-confirm-title">{titulo}</div>
        <div className="rec-confirm-sub">{sub}</div>

        <div className="rec-confirm-changes">
          {filas.map((f, i) => (
            <div key={i} className="rec-confirm-row">
              <span className="rec-confirm-key">{f.k}</span>
              <span className="rec-confirm-vals">
                <span className="rec-confirm-old">{f.viejo}</span>
                <span className="rec-confirm-arrow">→</span>
                <span className="rec-confirm-new">{f.nuevo}</span>
              </span>
              {f.extra && <span className="rec-confirm-extra">{f.extra}</span>}
            </div>
          ))}
        </div>

        {error && <div className="rec-confirm-error">{error}</div>}

        <div className="rec-confirm-actions">
          <button type="button" className="rec-confirm-cancel" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="rec-confirm-ok" onClick={onConfirmar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Sí, confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Historial de modificaciones (precio / productos de los ingredientes) ────

const LIMITE_HISTORIAL = 5;

function DetalleRow({ k, v }) {
  return (
    <div className="rec-info-row">
      <span className="rec-info-key">{k}</span>
      <span className="rec-info-val">{v}</span>
    </div>
  );
}

function tituloCambio(c) {
  if (c.campo === 'precioVenta') return 'Precio de venta';
  if (c.campo === 'ingrediente') return c.ingrediente || 'Ingrediente';
  return c.campo;
}

function formatStockCambio(stock, unidad) {
  if (stock === null || stock === undefined) return '—';
  return formatStock(stock, unidad || 'uds');
}

function HistorialReceta({ local, receta }) {
  const [modificaciones, setModificaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [cargarTodas, setCargarTodas] = useState(false); // ¿ya se pidió el historial completo?
  const [verTodas, setVerTodas] = useState(false);       // ¿se muestra completo o solo los últimos?
  const [expandidoId, setExpandidoId] = useState(null);

  useEffect(() => {
    const unsubscribe = suscribirModificacionesReceta(
      local, receta.id,
      (lista) => { setModificaciones(lista); setCargando(false); },
      { limite: cargarTodas ? null : LIMITE_HISTORIAL + 1 },
    );
    return () => unsubscribe?.();
  }, [local, receta.id, cargarTodas]);

  const visibles = verTodas ? modificaciones : modificaciones.slice(0, LIMITE_HISTORIAL);

  return (
    <div className="rec-info-block">
      <div className="rec-block-title">Historial de modificaciones</div>

      {cargando && <p className="rec-stat-sub rec-hist-empty">Cargando modificaciones...</p>}

      {!cargando && modificaciones.length === 0 && (
        <p className="rec-stat-sub rec-hist-empty">
          Todavía no se ha modificado el precio ni los productos de esta receta en este local.
        </p>
      )}

      {!cargando && visibles.map((mod) => {
        const expandido = expandidoId === mod.id;
        const titulo = mod.cambios.map(tituloCambio).join(' y ');
        const quien = mod.usuarioNombre || 'Desconocido';

        return (
          <div key={mod.id}>
            <button
              type="button"
              className="rec-hist-row"
              onClick={() => setExpandidoId(expandido ? null : mod.id)}
            >
              <span className="rec-hist-dot" />
              <div className="rec-hist-info">
                <div className="rec-hist-tipo">{titulo || 'Modificación'}</div>
                <div className="rec-hist-fecha">{formatFechaHistorial(mod.fecha)} · {quien}</div>
              </div>
              <span className="rec-hist-count">
                {mod.cambios.length === 1 ? '1 cambio' : `${mod.cambios.length} cambios`}
              </span>
            </button>

            {expandido && (
              <div className="rec-hist-detalle">
                {mod.cambios.map((c, i) => (
                  c.campo === 'ingrediente' ? (
                    <div key={i} className="rec-hist-ing">
                      <DetalleRow k={c.ingrediente} v={`${c.anterior ?? 'Sin asignar'} → ${c.nuevo ?? 'Sin asignar'}`} />
                      <DetalleRow k={`Stock de ${c.anterior ?? 'anterior'}`} v={formatStockCambio(c.stockAnterior, c.unidadAnterior)} />
                      <DetalleRow k={`Stock de ${c.nuevo ?? 'nuevo'}`} v={formatStockCambio(c.stockNuevo, c.unidadNueva)} />
                    </div>
                  ) : (
                    <DetalleRow
                      key={i}
                      k={tituloCambio(c)}
                      v={`${money(c.anterior)} → ${money(c.nuevo)}`}
                    />
                  )
                ))}
                <DetalleRow k="Modificado por" v={quien} />
                <DetalleRow k="Fecha" v={formatFechaHistorial(mod.fecha)} />
              </div>
            )}
          </div>
        );
      })}

      {!cargando && modificaciones.length > LIMITE_HISTORIAL && (
        <button
          type="button"
          className="rec-hist-more"
          onClick={() => { setCargarTodas(true); setVerTodas((v) => !v); }}
        >
          {verTodas ? 'Ver menos' : 'Ver todos'}
        </button>
      )}
    </div>
  );
}

// ─── Contenido de detalle (compartido entre panel desktop y modal móvil) ────
//
// Edición en línea, igual que en productos:
//  · Precio: tarjeta con ✎ → "Guardar cambios" (verde cuando hay cambios) → confirmación.
//  · Productos de los ingredientes: se elige en el desplegable de cada tarjeta →
//    "Confirmar cambios en la asignación" (verde) → confirmación.
// `onGuardarCambios({ precio?, ingredientes?: [{idIngredienteGlobal, idProductoLocal}] })`
// debe ser async y lanzar Error con un mensaje legible si falla.

export function DetalleContenido({
  receta, asignacion, productosLocal, local,
  onGuardarCambios, onEditar, onToggleActiva,
}) {
  // Los hooks van antes de cualquier return para respetar las reglas de React.
  const [editPrecio, setEditPrecio] = useState(false);
  const [draftPrecio, setDraftPrecio] = useState('');
  const [draftIng, setDraftIng] = useState({});        // { idIngredienteGlobal: idProductoLocal } (solo lo cambiado)
  const [abierto, setAbierto] = useState(null);        // id del ingrediente con el desplegable abierto
  const [confirmando, setConfirmando] = useState(null); // 'precio' | 'asignacion' | null
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const precioActual = asignacion ? String(asignacion.precioVenta ?? '') : '';
  const firmaAsignacion = asignacion?.ingredientes
    ?.map((a) => `${a.idIngredienteGlobal}:${a.idProductoLocal}`).join('|') ?? '';

  // Al cambiar de receta (o cuando el valor guardado cambia) se descartan los borradores
  useEffect(() => {
    setEditPrecio(false);
    setDraftPrecio(precioActual);
    setConfirmando(null);
    setErrorGuardado('');
  }, [receta?.id, precioActual]);

  useEffect(() => {
    setDraftIng({});
    setAbierto(null);
    setConfirmando(null);
    setErrorGuardado('');
  }, [receta?.id, firmaAsignacion]);

  if (!receta) return null;

  const ingredientesBase = asignacion?.ingredientes ?? [];
  const idOriginal = (idIng) => ingredientesBase.find((a) => a.idIngredienteGlobal === idIng)?.idProductoLocal;

  // Asignación "con borrador": lo guardado + los cambios todavía sin confirmar.
  // Con ella se previsualizan las barras y la producción antes de guardar.
  const asignacionDraft = asignacion
    ? {
        ...asignacion,
        ingredientes: ingredientesBase.map((a) => (
          draftIng[a.idIngredienteGlobal] !== undefined
            ? { ...a, idProductoLocal: draftIng[a.idIngredienteGlobal] }
            : a
        )),
      }
    : null;

  const estimacionGuardada = calcularProduccionEstimada(receta, asignacion, productosLocal);
  const estimacion = calcularProduccionEstimada(receta, asignacionDraft, productosLocal);
  const preparable = estimacion.cantidadPreparable;
  const limitante = estimacion.ingredienteLimitante;

  // ¿Qué cambió realmente?
  const precioCambio = !!asignacion && editPrecio && draftPrecio.trim() !== ''
    && Number(draftPrecio) !== Number(precioActual);
  const idsCambiados = receta.ingredientes
    .filter((ing) => draftIng[ing.id] !== undefined && draftIng[ing.id] !== idOriginal(ing.id))
    .map((ing) => ing.id);
  const asignacionCambio = idsCambiados.length > 0;

  // Una fila por ingrediente, con todo lo que la tarjeta necesita
  const filas = receta.ingredientes.map((ing) => {
    const asignado = asignacionDraft?.ingredientes?.find((a) => a.idIngredienteGlobal === ing.id);
    const producto = asignado?.idProductoLocal
      ? productosLocal.find((p) => p.id === asignado.idProductoLocal)
      : null;
    const det = estimacion.detalle.find((d) => d.idIngrediente === ing.id);
    const sinAsignar = !asignacion || !producto || det?.sinAsignar;
    const posibles = sinAsignar ? 0 : (det?.unidadesPosibles ?? 0);
    const esLimitante = !sinAsignar && limitante?.idIngrediente === ing.id && preparable === posibles;
    return {
      ing, producto, sinAsignar, posibles, esLimitante,
      nombreProducto: producto?.nombre ?? '',
      stockTxt: producto ? stockTexto(producto) : null,
      cambiado: idsCambiados.includes(ing.id),
    };
  });

  const asignados = filas.filter((f) => !f.sinAsignar).length;
  const maxPosibles = Math.max(1, ...filas.map((f) => f.posibles));
  const heroNivel = !asignacion ? 'none' : preparable > 0 ? 'ok' : 'zero';

  // Opciones del desplegable: productos disponibles para ese ingrediente (+ el
  // actual), cada uno con su stock y cuántas unidades alcanzarían si se elige.
  function opcionesPara(ing) {
    const disponibles = productosDisponiblesParaIngrediente(productosLocal, ing, asignacionDraft);
    const actualId = asignacionDraft.ingredientes.find((a) => a.idIngredienteGlobal === ing.id)?.idProductoLocal;
    const lista = [...disponibles];
    const actual = productosLocal.find((p) => p.id === actualId);
    if (actual && !lista.some((p) => p.id === actual.id)) lista.unshift(actual);

    return lista.map((p) => {
      const simulada = {
        ...asignacionDraft,
        ingredientes: asignacionDraft.ingredientes.map((a) => (
          a.idIngredienteGlobal === ing.id ? { ...a, idProductoLocal: p.id } : a
        )),
      };
      const posibles = calcularProduccionEstimada(receta, simulada, productosLocal)
        .detalle.find((d) => d.idIngrediente === ing.id)?.unidadesPosibles;
      return {
        id: p.id, nombre: p.nombre, stockTxt: stockTexto(p), posibles, esActual: p.id === actualId,
      };
    });
  }

  function elegirProducto(ing, idProducto) {
    setDraftIng((prev) => {
      const siguiente = { ...prev };
      if (idProducto === idOriginal(ing.id)) delete siguiente[ing.id]; // volvió al original: ya no es cambio
      else siguiente[ing.id] = idProducto;
      return siguiente;
    });
    setAbierto(null);
  }

  function togglePrecio() {
    setDraftPrecio(precioActual);
    setEditPrecio((v) => !v);
  }

  async function confirmar() {
    setGuardando(true);
    setErrorGuardado('');
    try {
      if (confirmando === 'precio') {
        await onGuardarCambios?.({ precio: draftPrecio });
        setEditPrecio(false);
      } else {
        await onGuardarCambios?.({
          ingredientes: idsCambiados.map((id) => ({ idIngredienteGlobal: id, idProductoLocal: draftIng[id] })),
        });
        setDraftIng({});
      }
      setConfirmando(null);
    } catch (err) {
      setErrorGuardado(err?.message || 'No se pudo guardar. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  }

  // Filas del mensaje de confirmación
  const filasConfirmacion = confirmando === 'precio'
    ? [{ k: 'Precio de venta', viejo: money(precioActual), nuevo: money(draftPrecio) }]
    : [
        ...idsCambiados.map((id) => {
          const ing = receta.ingredientes.find((i) => i.id === id);
          const pViejo = productosLocal.find((p) => p.id === idOriginal(id));
          const pNuevo = productosLocal.find((p) => p.id === draftIng[id]);
          return {
            k: ing.nombre,
            viejo: pViejo?.nombre ?? 'Sin asignar',
            nuevo: pNuevo?.nombre ?? 'Sin asignar',
            extra: `Stock: ${stockTexto(pViejo) ?? '—'} → ${stockTexto(pNuevo) ?? '—'}`,
          };
        }),
        ...(estimacionGuardada.cantidadPreparable !== preparable
          ? [{
              k: 'Producción estimada',
              viejo: unidadesTxt(estimacionGuardada.cantidadPreparable),
              nuevo: unidadesTxt(preparable),
            }]
          : []),
      ];

  return (
    <>
      {/* Hero: cuántas unidades se pueden preparar */}
      <div className={`rec-hero ${heroNivel}`}>
        <div className="rec-hero-label">Se pueden preparar</div>
        {asignacion ? (
          <>
            <div className="rec-hero-value">
              {preparable}
              <small>{preparable === 1 ? 'unidad' : 'unidades'}</small>
            </div>
            <div className="rec-hero-sub">
              {asignacionCambio
                ? 'Vista previa con los cambios sin guardar'
                : asignados < filas.length
                  ? `Faltan ${filas.length - asignados} ingrediente(s) por asignar`
                  : limitante && !limitante.sinAsignar
                    ? <>Limita: <strong>{limitante.nombreIngrediente}</strong></>
                    : 'Con el stock actual'}
            </div>
          </>
        ) : (
          <>
            <div className="rec-hero-value">—</div>
            <div className="rec-hero-sub">Asigna productos para calcular la producción</div>
          </>
        )}
      </div>

      {/* Stats: precio editable (✎) + asignados */}
      <div className="rec-stats-grid two">
        {asignacion ? (
          <StatEditable
            label="Precio de venta"
            value={money(asignacion.precioVenta)}
            sub="CLP"
            editando={editPrecio}
            cambiado={precioCambio}
            draft={draftPrecio}
            setDraft={setDraftPrecio}
            onToggle={togglePrecio}
          />
        ) : (
          <div className="rec-stat-card">
            <div className="rec-stat-label">Precio de venta</div>
            <div className="rec-stat-value">—</div>
          </div>
        )}
        <div className="rec-stat-card">
          <div className="rec-stat-label">Ingredientes asignados</div>
          <div className="rec-stat-value">{asignados}/{filas.length}</div>
          <div className="rec-stat-sub">con producto</div>
        </div>
      </div>

      {/* Guardar cambios de precio: gris sin cambios, verde con cambios */}
      {asignacion && (
        <button
          type="button"
          className={`rec-save-changes-btn${precioCambio ? ' active' : ''}`}
          disabled={!precioCambio}
          onClick={() => { setErrorGuardado(''); setConfirmando('precio'); }}
        >
          {precioCambio ? '✓  Guardar cambios' : 'Sin cambios por guardar'}
        </button>
      )}

      {/* Ingredientes */}
      <div className="rec-section-head">
        <span>Ingredientes</span>
        <span>por 1 unidad</span>
      </div>
      {asignacion && (
        <div className="rec-hint" role="note">
          <span className="rec-hint-icon">💡</span>
          <span>
            Toca el producto de un ingrediente si quieres <strong>asignarle otro</strong>.
            Verás el stock de cada opción antes de elegir.
          </span>
        </div>
      )}
      <div className="rec-ing-list">
        {filas.map((f) => (
          <IngredienteItem
            key={f.ing.id}
            ing={f.ing}
            nombreProducto={f.nombreProducto}
            stockTxt={f.stockTxt}
            sinAsignar={f.sinAsignar}
            posibles={f.posibles}
            maxPosibles={maxPosibles}
            esLimitante={f.esLimitante}
            cambiado={f.cambiado}
            puedeEditar={!!asignacion}
            abierto={abierto === f.ing.id}
            opciones={abierto === f.ing.id ? opcionesPara(f.ing) : []}
            onToggle={() => setAbierto((a) => (a === f.ing.id ? null : f.ing.id))}
            onElegir={(idProducto) => elegirProducto(f.ing, idProducto)}
          />
        ))}
      </div>

      {/* Confirmar cambios en la asignación (antes "Editar asignación") */}
      {asignacion ? (
        <button
          type="button"
          className={`rec-save-changes-btn rec-save-assign${asignacionCambio ? ' active' : ''}`}
          disabled={!asignacionCambio}
          onClick={() => { setErrorGuardado(''); setConfirmando('asignacion'); }}
        >
          {asignacionCambio
            ? `✓  Confirmar cambios en la asignación (${idsCambiados.length})`
            : 'Sin cambios en la asignación'}
        </button>
      ) : onEditar ? (
        <button className="rec-edit-btn" onClick={onEditar}>Asignar productos</button>
      ) : null}

      <div style={{ height: 8 }} />

      {/* Switch activa / desactivada (mismo patrón que productos) */}
      {asignacion && (
        <div className="rec-info-block">
          <div className="rec-info-row">
            <div style={{ flex: 1 }}>
              <div className="rec-info-key">Receta activa</div>
              <div className="rec-switch-sub">
                {asignacion.activo ? 'Disponible para la venta' : 'Desactivada: no se ofrece en caja'}
              </div>
            </div>
            <button
              className={`rec-switch-track ${asignacion.activo ? 'rec-switch-on' : 'rec-switch-off'}`}
              onClick={onToggleActiva}
              aria-label="Alternar receta activa"
            >
              <span className="rec-switch-thumb" />
            </button>
          </div>
        </div>
      )}

      {/* Historial de modificaciones */}
      {asignacion && <HistorialReceta key={receta.id} local={local} receta={receta} />}

      <div style={{ height: 20 }} />

      {confirmando && (
        <ConfirmarCambios
          titulo={confirmando === 'precio' ? '¿Actualizar el precio?' : '¿Confirmar cambios en la asignación?'}
          sub={receta.nombre}
          filas={filasConfirmacion}
          error={errorGuardado}
          guardando={guardando}
          onCancelar={() => setConfirmando(null)}
          onConfirmar={confirmar}
        />
      )}
    </>
  );
}

// ─── Modal: Detalle (solo se usa en layout móvil) ───────────────────────────

export function DetalleModal({
  isDesktop, visible, receta, asignacion, productosLocal, local,
  onClose, onGuardarCambios, onEditar, onToggleActiva,
}) {
  if (isDesktop || !visible) return null;
  return (
    <ModalShell isDesktop={false} onClose={onClose} title={receta?.nombre || ''}>
      <DetalleContenido
        receta={receta}
        asignacion={asignacion}
        productosLocal={productosLocal}
        local={local}
        onGuardarCambios={onGuardarCambios}
        onEditar={onEditar}
        onToggleActiva={onToggleActiva}
      />
    </ModalShell>
  );
}