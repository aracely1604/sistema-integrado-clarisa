import { useState, useEffect } from 'react';
import {
  formatStock, formatPrecio, etiquetaUnidadIngreso,
  convertirValorUnitarioAIngreso, unidadBaseDesdeUnidadMedida,
  convertirBaseAIngreso, convertirACantidadBase,
} from './gestionProductosData';
import CampoFechaVencimiento from './CampoFechaVencimiento';
import {
  suscribirHistorialProductoLocal, suscribirModificacionesProducto, suscribirUltimaReposicionProducto,
} from '../../controllers/HistorialStockControl';

// ─── Campo de formulario reutilizable ────────────────────────────────────────

export function FormField({ label, value, onChangeText, placeholder, type = 'text' }) {
  return (
    <div className="gp-form-group">
      <label className="gp-form-label">{label}</label>
      <input
        className="gp-form-input"
        type={type}
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
    <div
      className={`gp-modal-overlay${isDesktop ? ' desktop' : ''}`}
      onClick={onClose}
    >
      <div
        className={`gp-bottom-sheet${isDesktop ? ' desktop' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {!isDesktop && showHandle && <div className="gp-sheet-handle" />}
        <div className="gp-sheet-header">
          <span className="gp-sheet-title">{title}</span>
          <button className="gp-sheet-close" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        <div className="gp-sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ─── Picker de filtros (categoría / proveedor) ───────────────────────────────

export function FiltroPickerModal({
  isDesktop, tipo, valorActual, opciones, onSelect, onClose,
}) {
  if (!tipo) return null;
  const titulo = tipo === 'categoria' ? 'Filtrar por categoría' : 'Filtrar por proveedor';
  return (
    <ModalShell isDesktop={isDesktop} onClose={onClose} title={titulo}>
      <button className={`gp-picker-option${!valorActual ? ' active' : ''}`} onClick={() => onSelect(null)}>
        <span className="gp-picker-option-text">Todos</span>
        {!valorActual && <span className="gp-picker-check">✓</span>}
      </button>
      {opciones.map((opcion) => {
        const activo = valorActual === opcion;
        return (
          <button
            key={opcion}
            className={`gp-picker-option${activo ? ' active' : ''}`}
            onClick={() => onSelect(opcion)}
          >
            <span className={`gp-picker-option-text${activo ? ' active' : ''}`}>{opcion}</span>
            {activo && <span className="gp-picker-check">✓</span>}
          </button>
        );
      })}
      <div style={{ height: 20 }} />
    </ModalShell>
  );
}

// ─── Tarjeta de dato editable (stock mínimo / precio) ───────────────────────

function StatEditable({ label, value, editando, cambiado, draft, setDraft, onToggle, step = '1' }) {
  return (
    <div className={`gp-stat-card gp-stat-editable${editando ? ' editing' : ''}${cambiado ? ' changed' : ''}`}>
      <div className="gp-stat-main">
        <div className="gp-stat-label">{label}</div>
        {editando ? (
          <input
            className="gp-stat-input"
            type="number"
            min="0"
            step={step}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="gp-stat-value">{value}</div>
        )}
      </div>
      <button
        type="button"
        className={`gp-stat-edit-btn${editando ? ' cancel' : ''}`}
        onClick={onToggle}
        aria-label={editando ? 'Cancelar edición' : 'Editar'}
        title={editando ? 'Cancelar edición' : 'Editar'}
      >
        {editando ? '✕' : '✎'}
      </button>
    </div>
  );
}

// ─── Contenido de detalle (compartido entre panel desktop y modal móvil) ────

export function DetalleContenido({ producto, onActualizar, onTransferir, onToggleActivo, onToggleOferta, local }) {
  // Estado de edición rápida (stock mínimo y precio). Los hooks van antes de
  // cualquier return para respetar las reglas de React.
  const [editMinimo, setEditMinimo] = useState(false);
  const [editPrecio, setEditPrecio] = useState(false);
  const [draftMinimo, setDraftMinimo] = useState('');
  const [draftPrecio, setDraftPrecio] = useState('');
  const [editOferta, setEditOferta] = useState(false);
  const [draftOferta, setDraftOferta] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const minimoActual = producto ? String(convertirBaseAIngreso(producto.minimo, producto.unidad)) : '';
  const precioActual = producto ? String(producto.precio) : '';
  const ofertaActual = producto ? String(producto.oferta ?? 0) : '';

  // Al cambiar de producto (o cuando el valor real cambia en vivo) se descartan los borradores
  useEffect(() => {
    setEditMinimo(false);
    setEditPrecio(false);
    setDraftMinimo(minimoActual);
    setDraftPrecio(precioActual);
    setEditOferta(false);
    setDraftOferta(ofertaActual);
    setConfirmando(false);
    setErrorGuardado('');
  }, [producto?.id, minimoActual, precioActual, ofertaActual]);

  // Última reposición (proveedor, fecha, vencimiento): 2 lecturas de 1 documento,
  // sin necesidad de cargar todo el historial.
  const [ultimaRepo, setUltimaRepo] = useState(null);
  const [cargandoUltimaRepo, setCargandoUltimaRepo] = useState(true);

  useEffect(() => {
    if (!producto?.id) { setUltimaRepo(null); return; }
    setCargandoUltimaRepo(true);
    const unsubscribe = suscribirUltimaReposicionProducto(local, producto.id, (r) => {
      setUltimaRepo(r);
      setCargandoUltimaRepo(false);
    });
    return () => unsubscribe?.();
  }, [local, producto?.id]);

  if (!producto) return null;

  const unidad = producto.unidad || 'uds';
  const etiqueta = etiquetaUnidadIngreso(producto.unidad);
  const stockLabel = formatStock(producto.stock, unidad);
  const minimoLabel = formatStock(producto.minimo, unidad);

  // ¿Qué cambió realmente?
  const minimoCambio = editMinimo && draftMinimo.trim() !== '' && Number(draftMinimo) !== Number(minimoActual);
  const precioCambio = editPrecio && draftPrecio.trim() !== '' && Number(draftPrecio) !== Number(precioActual);
  const ofertaCambio = editOferta && draftOferta.trim() !== '' && Number(draftOferta) !== Number(ofertaActual);
  const hayCambios = minimoCambio || precioCambio || ofertaCambio;
  const tieneOferta = Number(producto.oferta) > 0;
  const ofertaLabel = tieneOferta ? formatPrecio(producto.oferta, unidad) : 'Sin oferta';

  function toggleMinimo() {
    setDraftMinimo(minimoActual);
    setEditMinimo((v) => !v);
  }
  function togglePrecio() {
    setDraftPrecio(precioActual);
    setEditPrecio((v) => !v);
  }

  function toggleEditOferta() {
    setDraftOferta(ofertaActual);
    setEditOferta((v) => !v);
  }

  async function confirmarCambios() {
    setGuardando(true);
    setErrorGuardado('');
    try {
      await onActualizar?.({
        minimo: minimoCambio ? draftMinimo : undefined,
        precio: precioCambio ? draftPrecio : undefined,
        oferta: ofertaCambio ? draftOferta : undefined,
      });
      setConfirmando(false);
      setEditMinimo(false);
      setEditPrecio(false);
      setEditOferta(false);
    } catch (err) {
      setErrorGuardado(err?.message || 'No se pudo actualizar el producto. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  }

  const ultimoProveedorLabel = cargandoUltimaRepo
    ? 'Cargando...'
    : ultimaRepo?.proveedorNombre
      ? `${ultimaRepo.proveedorNombre}${ultimaRepo.proveedorEmpresa ? ' — ' + ultimaRepo.proveedorEmpresa : ''}`
      : 'Sin proveedor';
  const ultimaActualizacionLabel = cargandoUltimaRepo
    ? 'Cargando...'
    : ultimaRepo?.fecha
      ? formatFechaHistorial(ultimaRepo.fecha)
      : 'Sin reposiciones';
  const vencimientoLabel = cargandoUltimaRepo
    ? 'Cargando...'
    : ultimaRepo?.vencimiento || 'Sin fecha de vencimiento';

  // "Datos adicionales": ya no repite el stock mínimo (vive arriba, editable)
  const datos = [
    { k: 'Código', v: producto.codigo },
    { k: 'Tipo de stock', v: etiqueta },
    { k: 'Última actualización', v: ultimaActualizacionLabel },
    { k: 'Fecha de vencimiento', v: vencimientoLabel },
  ];

  const esFraccionable = producto.unidad === 'g' || producto.unidad === 'ml';

  return (
    <>
      {/* Stats: izquierda = solo lectura, derecha = editable */}
      <div className="gp-stats-grid">
        <div className="gp-stat-card">
          <div className="gp-stat-label">{`Stock actual (${etiqueta})`}</div>
          <div className="gp-stat-value">{stockLabel}</div>
        </div>

        <StatEditable
          label={`Stock mínimo (${etiqueta})`}
          value={minimoLabel}
          editando={editMinimo}
          cambiado={minimoCambio}
          draft={draftMinimo}
          setDraft={setDraftMinimo}
          onToggle={toggleMinimo}
          step="any"
        />

        <div className="gp-stat-card">
          <div className="gp-stat-label">Último proveedor</div>
          <div className="gp-stat-value gp-stat-value-sm">{ultimoProveedorLabel}</div>
        </div>

        <StatEditable
          label={`Precio (${etiqueta})`}
          value={formatPrecio(producto.precio, unidad)}
          editando={editPrecio}
          cambiado={precioCambio}
          draft={draftPrecio}
          setDraft={setDraftPrecio}
          onToggle={togglePrecio}
        />

        <div className="gp-stat-card">
          <div className="gp-stat-label">Categoría</div>
          <div className="gp-stat-value gp-stat-value-sm">{producto.categoria || 'Sin categoría'}</div>
        </div>

        <StatEditable
          label={`Precio oferta (${etiqueta})`}
          value={ofertaLabel}
          editando={editOferta}
          cambiado={ofertaCambio}
          draft={draftOferta}
          setDraft={setDraftOferta}
          onToggle={toggleEditOferta}
        />
      </div>

      {/* Botón de guardar: se colorea cuando hay cambios */}
      <button
        type="button"
        className={`gp-save-changes-btn${hayCambios ? ' active' : ''}`}
        disabled={!hayCambios}
        onClick={() => { setErrorGuardado(''); setConfirmando(true); }}
      >
        {hayCambios ? '✓  Guardar cambios' : 'Sin cambios por guardar'}
      </button>

      {/* Datos adicionales */}
      <div className="gp-info-block">
        <div className="gp-block-title">Datos adicionales</div>
        {datos.map((row, i) => (
          <div key={i} className="gp-info-row">
            <span className="gp-info-key">{row.k}</span>
            <span className="gp-info-val">{row.v}</span>
          </div>
        ))}
      </div>

      {/* Switch estado activo */}
      <div className="gp-info-block">
        <div className="gp-info-row">
          <div style={{ flex: 1 }}>
            <div className="gp-info-key">Estado del producto</div>
            <div className="gp-stat-sub" style={{ marginTop: 2 }}>
              {producto.activo ? 'Visible y disponible para venta' : 'Oculto / fuera de operación'}
            </div>
          </div>
          <button
            className={`gp-switch-track ${producto.activo ? 'gp-switch-on' : 'gp-switch-off'}`}
            onClick={onToggleActivo}
            aria-label="Alternar estado activo"
          >
            <span className="gp-switch-thumb" />
          </button>
        </div>
      </div>

      {/* Switch de oferta: solo se puede activar si ya hay un precio de oferta */}
      <div className="gp-info-block">
        <div className="gp-info-row">
          <div style={{ flex: 1 }}>
            <div className="gp-info-key">Oferta</div>
            <div className="gp-stat-sub" style={{ marginTop: 2 }}>
              {producto.ofertaActiva
                ? `Se está vendiendo a ${ofertaLabel}`
                : tieneOferta
                  ? 'Precio de oferta definido, pero desactivada'
                  : 'Define un precio de oferta para poder activarla'}
            </div>
          </div>
          <button
            className={`gp-switch-track ${producto.ofertaActiva ? 'gp-switch-on' : 'gp-switch-off'}`}
            onClick={onToggleOferta}
            disabled={!producto.ofertaActiva && !tieneOferta}
            aria-label="Alternar oferta activa"
          >
            <span className="gp-switch-thumb" />
          </button>
        </div>
      </div>

      {/* Historial — datos reales de historialStock, filtrados a este producto en este local */}
      <HistorialProducto key={producto.id} local={local} producto={producto} />

      {/* Botón de acción */}
      <button className="gp-edit-btn gp-edit-btn-transfer" onClick={onTransferir}>⇄  Transferir a otro local</button>

      <div style={{ height: 20 }} />

      {/* Mensaje flotante de confirmación */}
      {confirmando && (
        <div
          className="gp-modal-overlay desktop gp-confirm-overlay"
          onClick={(e) => { e.stopPropagation(); if (!guardando) setConfirmando(false); }}
        >
          <div className="gp-confirm-box" onClick={(e) => e.stopPropagation()}>
            <div className="gp-confirm-title">¿Actualizar este producto?</div>
            <div className="gp-confirm-sub">{producto.nombre}</div>

            <div className="gp-confirm-changes">
              {minimoCambio && (
                <div className="gp-confirm-row">
                  <span className="gp-confirm-key">{`Stock mínimo (${etiqueta})`}</span>
                  <span className="gp-confirm-vals">
                    <span className="gp-confirm-old">{minimoLabel}</span>
                    <span className="gp-confirm-arrow">→</span>
                    <span className="gp-confirm-new">{formatStock(convertirACantidadBase(Number(draftMinimo), producto.unidad), unidad)}</span>
                  </span>
                </div>
              )}
              {precioCambio && (
                <div className="gp-confirm-row">
                  <span className="gp-confirm-key">{esFraccionable ? `Precio por ${etiqueta}` : 'Precio unitario'}</span>
                  <span className="gp-confirm-vals">
                    <span className="gp-confirm-old">{formatPrecio(producto.precio, unidad)}</span>
                    <span className="gp-confirm-arrow">→</span>
                    <span className="gp-confirm-new">{formatPrecio(Number(draftPrecio), unidad)}</span>
                  </span>
                </div>
              )}
              {ofertaCambio && (
                <div className="gp-confirm-row">
                  <span className="gp-confirm-key">{esFraccionable ? `Precio oferta por ${etiqueta}` : 'Precio oferta'}</span>
                  <span className="gp-confirm-vals">
                    <span className="gp-confirm-old">{tieneOferta ? formatPrecio(producto.oferta, unidad) : 'Sin oferta'}</span>
                    <span className="gp-confirm-arrow">→</span>
                    <span className="gp-confirm-new">{Number(draftOferta) > 0 ? formatPrecio(Number(draftOferta), unidad) : 'Sin oferta'}</span>
                  </span>
                </div>
              )}
            </div>

            {errorGuardado && <div className="gp-confirm-error">{errorGuardado}</div>}

            <div className="gp-confirm-actions">
              <button type="button" className="gp-confirm-cancel" onClick={() => setConfirmando(false)} disabled={guardando}>
                Cancelar
              </button>
              <button type="button" className="gp-confirm-ok" onClick={confirmarCambios} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Sí, actualizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Historial de movimientos: fila simple, click para ver todo el detalle ──
const ETIQUETAS_TIPO_MOVIMIENTO = {
  reposicion: 'Reposición',
  transferencia: 'Transferencia',
  devolucion: 'Devolución',
  autoconsumo: 'Autoconsumo',
};

function formatFechaHistorial(fecha) {
  // fecha llega como Firestore Timestamp (o null mientras el serverTimestamp
  // todavía no se resuelve, justo después de crear el movimiento).
  if (!fecha || typeof fecha.toDate !== 'function') return 'Justo ahora';
  return fecha.toDate().toLocaleString('es-CL', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatMonto(valor) {
  if (valor === null || valor === undefined) return null;
  return '$' + Number(valor).toLocaleString('es-CL');
}

// Cuántos registros se muestran de entrada en cada historial
const LIMITE_HISTORIAL = 5;

function BotonVerTodos({ total, verTodos, onToggle }) {
  // Con límite activo solo se leen LIMITE+1 registros: si llegan más de LIMITE
  // es que hay más; el total exacto no se conoce hasta que se piden todos.
  if (total <= LIMITE_HISTORIAL) return null;
  return (
    <button type="button" className="gp-hist-more" onClick={onToggle}>
      {verTodos ? 'Ver menos' : 'Ver todos'}
    </button>
  );
}

function ListaMovimientos({ producto, historial, cargando, verTodos, onToggleVerTodos }) {
  const [expandidoId, setExpandidoId] = useState(null);
  const visibles = verTodos ? historial : historial.slice(0, LIMITE_HISTORIAL);
  const etiqueta = etiquetaUnidadIngreso(producto.unidad);

  return (
    <>
      {cargando && <p className="gp-stat-sub gp-hist-empty">Cargando historial...</p>}

      {!cargando && historial.length === 0 && (
        <p className="gp-stat-sub gp-hist-empty">Todavía no hay movimientos registrados para este producto en este local.</p>
      )}

      {!cargando && visibles.map((mov) => {
        const delta = Number(mov.stockNuevo) - Number(mov.stockAnterior);
        const esPositivo = delta >= 0;
        const expandido = expandidoId === mov.id;

        return (
          <div key={mov.id}>
            <button
              type="button"
              className="gp-hist-row"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setExpandidoId(expandido ? null : mov.id)}
            >
              <span className={`gp-hist-dot ${esPositivo ? 'gp-hist-dot-in' : 'gp-hist-dot-adj'}`} />
              <div className="gp-hist-info">
                <div className="gp-hist-tipo">{ETIQUETAS_TIPO_MOVIMIENTO[mov.tipoMovimiento] ?? mov.tipoMovimiento}</div>
                <div className="gp-hist-fecha">{formatFechaHistorial(mov.fecha)}</div>
              </div>
              <span className={esPositivo ? 'gp-hist-pos' : 'gp-hist-neg'}>
                {(esPositivo ? '+' : '-') + formatStock(Math.abs(delta), producto.unidad || 'uds')}
              </span>
            </button>

            {expandido && (
              <div style={{ padding: '4px 12px 12px 30px', fontSize: 12.5 }}>
                <DetalleRow k="Código del producto" v={producto.codigo} />
                <DetalleRow k={`Stock anterior (${etiqueta})`} v={formatStock(mov.stockAnterior, producto.unidad || 'uds')} />
                <DetalleRow k={`Stock nuevo (${etiqueta})`} v={formatStock(mov.stockNuevo, producto.unidad || 'uds')} />
                <DetalleRow k={`Cantidad del movimiento (${etiqueta})`} v={formatStock(mov.cantidad, producto.unidad || 'uds')} />
                {mov.proveedorNombre && (
                  <DetalleRow k="Proveedor" v={`${mov.proveedorNombre} — ${mov.proveedorEmpresa || 'sin empresa'}`} />
                )}
                {mov.fechaVencimiento && <DetalleRow k="Fecha de vencimiento" v={mov.fechaVencimiento} />}
                {mov.localRelacionado && <DetalleRow k="Local relacionado" v={mov.localRelacionado} />}
                {(mov.valorUnitario !== null && mov.valorUnitario !== undefined) && (
                  <DetalleRow
                    k={`Costo unitario (por ${etiquetaUnidadIngreso(producto.unidad)})`}
                    v={formatMonto(convertirValorUnitarioAIngreso(mov.valorUnitario, producto.unidad))}
                  />
                )}
                {formatMonto(mov.valorTotal) && <DetalleRow k="Costo total" v={formatMonto(mov.valorTotal)} />}
                <DetalleRow k="Usuario" v={mov.usuarioNombre || 'Desconocido'} />
              </div>
            )}
          </div>
        );
      })}

      {!cargando && (
        <BotonVerTodos total={historial.length} verTodos={verTodos} onToggle={onToggleVerTodos} />
      )}
    </>
  );
}

// ─── Historial de modificaciones (stock mínimo / precio) ────────────────────
const ETIQUETAS_CAMPO_MODIFICACION = {
  stockMinimo: 'Stock mínimo',
  precioVenta: 'Precio',
  oferta: 'Precio oferta',
};

function formatValorModificacion(campo, valor, producto) {
  const unidad = producto.unidad || 'uds';
  if (campo === 'oferta') return Number(valor) > 0 ? formatPrecio(valor, unidad) : 'Sin oferta';
  if (campo === 'precioVenta') return formatPrecio(valor, unidad);
  if (campo === 'stockMinimo') return formatStock(valor, unidad);
  return String(valor ?? '—');
}

function ListaModificaciones({ producto, modificaciones, cargando, verTodos, onToggleVerTodos }) {
  const [expandidoId, setExpandidoId] = useState(null);
  const visibles = verTodos ? modificaciones : modificaciones.slice(0, LIMITE_HISTORIAL);
  const etiqueta = etiquetaUnidadIngreso(producto.unidad);

  return (
    <>
      {cargando && <p className="gp-stat-sub gp-hist-empty">Cargando modificaciones...</p>}

      {!cargando && modificaciones.length === 0 && (
        <p className="gp-stat-sub gp-hist-empty">Todavía no se ha modificado el stock mínimo ni los precios de este producto en este local.</p>
      )}

      {!cargando && visibles.map((mod) => {
        const expandido = expandidoId === mod.id;
        const titulo = mod.cambios
          .map((c) => ETIQUETAS_CAMPO_MODIFICACION[c.campo] ?? c.campo)
          .join(' y ');
        const quien = mod.usuarioNombre || 'Desconocido';

        return (
          <div key={mod.id}>
            <button
              type="button"
              className="gp-hist-row"
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
              onClick={() => setExpandidoId(expandido ? null : mod.id)}
            >
              <span className="gp-hist-dot gp-hist-dot-adj" />
              <div className="gp-hist-info">
                <div className="gp-hist-tipo">{titulo || 'Modificación'}</div>
                <div className="gp-hist-fecha">{formatFechaHistorial(mod.fecha)} · {quien}</div>
              </div>
              <span className="gp-hist-count">{mod.cambios.length === 1 ? '1 cambio' : `${mod.cambios.length} cambios`}</span>
            </button>

            {expandido && (
              <div style={{ padding: '4px 12px 12px 30px', fontSize: 12.5 }}>
                {mod.cambios.map((c, i) => (
                  <DetalleRow
                    key={i}
                    k={`${ETIQUETAS_CAMPO_MODIFICACION[c.campo] ?? c.campo} (${etiqueta})`}
                    v={`${formatValorModificacion(c.campo, c.anterior, producto)} → ${formatValorModificacion(c.campo, c.nuevo, producto)}`}
                  />
                ))}
                <DetalleRow k="Modificado por" v={quien} />
                <DetalleRow k="Fecha" v={formatFechaHistorial(mod.fecha)} />
              </div>
            )}
          </div>
        );
      })}

      {!cargando && (
        <BotonVerTodos total={modificaciones.length} verTodos={verTodos} onToggle={onToggleVerTodos} />
      )}
    </>
  );
}

// ─── Historial con switch: movimientos | modificaciones ─────────────────────
function HistorialProducto({ local, producto }) {
  const [vista, setVista] = useState('movimientos');

  // Movimientos: se suscribe al abrir el producto, pero solo a los LIMITE+1 más recientes
  const [movimientos, setMovimientos] = useState([]);
  const [cargandoMov, setCargandoMov] = useState(true);
  const [cargarTodosMov, setCargarTodosMov] = useState(false); // ¿ya se pidió el historial completo?
  const [expandidoMov, setExpandidoMov] = useState(false);     // ¿se muestra completo o solo los últimos?

  useEffect(() => {
    const unsubscribe = suscribirHistorialProductoLocal(
      local, producto.id,
      (lista) => { setMovimientos(lista); setCargandoMov(false); },
      { limite: cargarTodosMov ? null : LIMITE_HISTORIAL + 1 },
    );
    return () => unsubscribe?.();
  }, [local, producto.id, cargarTodosMov]);

  // Modificaciones: no se consulta nada hasta que se abre esa pestaña por primera vez
  const [modVisitada, setModVisitada] = useState(false);
  const [modificaciones, setModificaciones] = useState([]);
  const [cargandoMod, setCargandoMod] = useState(true);
  const [cargarTodasMod, setCargarTodasMod] = useState(false);
  const [expandidoMod, setExpandidoMod] = useState(false);

  useEffect(() => {
    if (!modVisitada) return undefined;
    const unsubscribe = suscribirModificacionesProducto(
      local, producto.id,
      (lista) => { setModificaciones(lista); setCargandoMod(false); },
      { limite: cargarTodasMod ? null : LIMITE_HISTORIAL + 1 },
    );
    return () => unsubscribe?.();
  }, [local, producto.id, modVisitada, cargarTodasMod]);

  function alternarVerTodosMov() {
    setCargarTodosMov(true);            // la primera vez dispara la lectura completa
    setExpandidoMov((v) => !v);
  }
  function alternarVerTodasMod() {
    setCargarTodasMod(true);
    setExpandidoMod((v) => !v);
  }
  function abrirModificaciones() {
    setModVisitada(true);
    setVista('modificaciones');
  }

  return (
    <div className="gp-info-block">
      <div className="gp-block-title">Historial</div>

      <div className="gp-seg" role="tablist" aria-label="Tipo de historial">
        <button
          type="button" role="tab" aria-selected={vista === 'movimientos'}
          className={`gp-seg-btn${vista === 'movimientos' ? ' active' : ''}`}
          onClick={() => setVista('movimientos')}
        >
          Movimientos
        </button>
        <button
          type="button" role="tab" aria-selected={vista === 'modificaciones'}
          className={`gp-seg-btn${vista === 'modificaciones' ? ' active' : ''}`}
          onClick={abrirModificaciones}
        >
          Modificaciones
        </button>
      </div>

      {vista === 'movimientos' ? (
        <ListaMovimientos
          producto={producto} historial={movimientos} cargando={cargandoMov}
          verTodos={expandidoMov} onToggleVerTodos={alternarVerTodosMov}
        />
      ) : (
        <ListaModificaciones
          producto={producto} modificaciones={modificaciones} cargando={cargandoMod}
          verTodos={expandidoMod} onToggleVerTodos={alternarVerTodasMod}
        />
      )}
    </div>
  );
}

function DetalleRow({ k, v }) {
  return (
    <div className="gp-info-row">
      <span className="gp-info-key">{k}</span>
      <span className="gp-info-val">{v}</span>
    </div>
  );
}

// ─── Modal: Detalle (solo se usa en layout móvil, en desktop va en el panel) ─

export function DetalleModal({ isDesktop, visible, producto, onClose, onActualizar, onTransferir, onToggleActivo, onToggleOferta, local }) {
  if (isDesktop || !visible) return null;
  return (
    <ModalShell isDesktop={false} onClose={onClose} title={producto?.nombre || ''}>
      <DetalleContenido
        producto={producto}
        onActualizar={onActualizar}
        onTransferir={onTransferir}
        onToggleActivo={onToggleActivo}
        onToggleOferta={onToggleOferta}
        local={local}
      />
    </ModalShell>
  );
}

// ─── Modal: Actualizar stock ──────────────────────────────────────────────────

// ─── Modal: Actualizar stock (movimientos: reposición / transferencia / devolución) ──
// El scanner y el input manual de código de barras se mantienen igual que
// siempre. Lo que cambia es que, según el tipo de movimiento elegido, se
// muestran solo los campos que corresponden. Ya NO existe número de lote.
// Qué aviso corresponde (o null si el movimiento no está bloqueado) según el estado de
// vencimiento del producto en este local y el tipo de movimiento elegido.
//  'reposicion' / 'transferencia': vencido con stock · 'devolucion': vencido (con o sin stock)
// Un producto POR VENCER no bloquea nada: solo genera una recomendación (ver hayRecomendacion).
function motivoBloqueo(bloqueo, tipoMovimiento) {
  if (!bloqueo || bloqueo.tipo !== 'vencido') return null;
  if (tipoMovimiento === 'devolucion') return 'devolucion';
  if (bloqueo.conStock && (tipoMovimiento === 'reposicion' || tipoMovimiento === 'transferencia')) return tipoMovimiento;
  return null;
}

const ESTILO_AVISO = {
  rojo:  { background: '#FCEBEB', border: '1px solid #F5A6A6', color: '#791F1F' },
  ambar: { background: '#FAEEDA', border: '1px solid #FAC775', color: '#633806' },
};

// Recomendación (no bloquea) al reponer un producto que va a vencer y aún tiene stock.
function AvisoRecomendacion({ bloqueo, producto }) {
  return (
    <div
      role="note"
      style={{
        ...ESTILO_AVISO.ambar,
        borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.4, marginBottom: 12,
      }}
    >
      <strong>Recomendación:</strong>{' '}
      este producto {bloqueo.dias === 0 ? 'vence hoy' : `vence en ${bloqueo.dias} ${bloqueo.dias === 1 ? 'día' : 'días'}`} ({bloqueo.fecha})
      y todavía tiene {formatStock(producto.stock, producto.unidad || 'uds')} en stock.
      Al reponer, prioriza la venta de los productos pronto a vencer.
    </div>
  );
}

// Recuadro que explica por qué el movimiento no se puede hacer (ver motivoBloqueo).
function AvisoProductoVencido({ bloqueo, producto, motivo }) {
  const box = {
    ...ESTILO_AVISO.rojo,
    borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.4, marginBottom: 12,
  };
  const hace = (
    <>Venció hace {bloqueo.diasVencido} {bloqueo.diasVencido === 1 ? 'día' : 'días'} ({bloqueo.fecha})</>
  );
  const stock = formatStock(producto.stock, producto.unidad || 'uds');

  if (motivo === 'devolucion') {
    return (
      <div role="alert" style={box}>
        <strong>Producto vencido.</strong> {hace}.
        No es posible hacer una devolución de un producto vencido.
      </div>
    );
  }
  return (
    <div role="alert" style={box}>
      <strong>Producto vencido.</strong> {hace} y todavía tiene {stock} en stock.
      No se puede {motivo === 'transferencia' ? 'transferir' : 'reponer'} hasta que se elimine ese stock vencido
      (Inventario → Por vencer → Eliminar stock vencido).
    </div>
  );
}

export function ActualizarStockModal({
  isDesktop, visible, onClose, onConfirmar, onEscanear,
  codigo, setCodigo, cantidad, setCantidad,
  tipoMovimiento, setTipoMovimiento,
  productoEncontrado, bloqueoVencido = null,
  proveedores = [], proveedorId, setProveedorId,
  fechaVencimiento, setFechaVencimiento,
  valorTotal, setValorTotal,
  localesDestino = [], localLabels = {}, localDestino, setLocalDestino,
  guardando, errors = {},
}) {
  if (!visible) return null;

  const etiqueta = etiquetaUnidadIngreso(productoEncontrado?.unidad);
  const esFraccionable = productoEncontrado?.unidad === 'g' || productoEncontrado?.unidad === 'ml';

  // Vencido con stock: no se puede reponer ni transferir hasta eliminar ese stock.
  // Vencido (con o sin stock): no se puede devolver.
  const motivoBloqueado = motivoBloqueo(bloqueoVencido, tipoMovimiento);
  const bloqueado = Boolean(motivoBloqueado);
  // Por vencer con stock: solo se recomienda priorizar su venta al reponer (no bloquea).
  const hayRecomendacion = tipoMovimiento === 'reposicion'
    && bloqueoVencido?.tipo === 'porVencer' && bloqueoVencido.conStock;

  const TIPOS_MOVIMIENTO_STOCK = [
    { value: 'reposicion', label: 'Reposición' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'devolucion', label: 'Devolución' },
  ];

  return (
    <ModalShell isDesktop={isDesktop} onClose={onClose} title="Actualizar stock">
      <div className="gp-form-wrap">
        <button className="gp-scan-box" onClick={onEscanear}>
          <span className="gp-scan-icon">▦</span>
          <span className="gp-scan-title">Escanear código de barras</span>
          <span className="gp-scan-sub">Usa la pistola o haz clic para simular</span>
        </button>

        <div className="gp-or-divider">— o ingresa manualmente —</div>

        <FormField label="Código de barras" value={codigo} onChangeText={setCodigo} placeholder="Ej: 7891234560012" type="text" />

        {productoEncontrado && (
          <div className="gp-found-box">
            <div className="gp-found-title">PRODUCTO ENCONTRADO</div>
            <div className="gp-found-name">{productoEncontrado.nombre}</div>
            <div className="gp-found-sub">
              {productoEncontrado.categoria} · Stock: {formatStock(productoEncontrado.stock, productoEncontrado.unidad || 'uds')}
            </div>
          </div>
        )}
        {!productoEncontrado && codigo.trim() && (
          <p style={{ color: '#E24B4A', fontSize: 12.5, marginTop: -6, marginBottom: 10 }}>
            No se encontró un producto con ese código en este local.
          </p>
        )}

        <div className="gp-form-group">
          <span className="gp-form-label">TIPO DE MOVIMIENTO</span>
          <div className="gp-select-wrap">
            {TIPOS_MOVIMIENTO_STOCK.map((t) => (
              <button
                key={t.value}
                className={`gp-select-option${tipoMovimiento === t.value ? ' active' : ''}`}
                onClick={() => setTipoMovimiento(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {errors.tipoMovimiento && <p style={{ color: '#E24B4A', fontSize: 12 }}>{errors.tipoMovimiento}</p>}
        </div>

        {hayRecomendacion && (
          <AvisoRecomendacion bloqueo={bloqueoVencido} producto={productoEncontrado} />
        )}
        {bloqueado && (
          <AvisoProductoVencido
            bloqueo={bloqueoVencido}
            producto={productoEncontrado}
            motivo={motivoBloqueado}
          />
        )}

        <FormField
          label={`Cantidad (${etiqueta})`}
          value={cantidad}
          onChangeText={(v) => setCantidad(esFraccionable ? v.replace(/[^\d.]/g, '') : v.replace(/\D/g, ''))}
          placeholder={esFraccionable ? 'Ej: 5' : 'Ej: 50'}
          type="number"
        />
        {errors.cantidad && (
          <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.cantidad}</p>
        )}

        {/* ── Reposición: proveedor + fecha de vencimiento ── */}
        {tipoMovimiento === 'reposicion' && (
          <>
            <div className="gp-form-group">
              <label className="gp-form-label">Proveedor *</label>
              <select className="gp-form-input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Selecciona un proveedor...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
              {errors.proveedorId && <p style={{ color: '#E24B4A', fontSize: 12 }}>{errors.proveedorId}</p>}
            </div>

            <div className="gp-form-group">
              <label className="gp-form-label">Fecha de vencimiento *</label>
              <CampoFechaVencimiento
                className="gp-form-input"
                value={fechaVencimiento}
                onChange={setFechaVencimiento}
                error={errors.fechaVencimiento}
              />
            </div>

            <FormField
              label="Costo total de la compra ($) *"
              value={valorTotal}
              onChangeText={(v) => setValorTotal(v.replace(/\D/g, ''))}
              placeholder="Ej: 15000"
              type="number"
            />
            {errors.valorUnitario && (
              <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.valorUnitario}</p>
            )}
          </>
        )}

        {/* ── Transferencia: local destino ── */}
        {tipoMovimiento === 'transferencia' && (
          <div className="gp-form-group">
            <label className="gp-form-label">Local destino *</label>
            <select className="gp-form-input" value={localDestino} onChange={(e) => setLocalDestino(e.target.value)}>
              <option value="">Selecciona un local...</option>
              {localesDestino.map((loc) => (
                <option key={loc} value={loc}>{localLabels[loc] ?? loc}</option>
              ))}
            </select>
            {errors.localDestino && <p style={{ color: '#E24B4A', fontSize: 12 }}>{errors.localDestino}</p>}
          </div>
        )}

        {tipoMovimiento === 'transferencia' && (
          <>
            <FormField
              label="Costo total de lo transferido ($) *"
              value={valorTotal}
              onChangeText={(v) => setValorTotal(v.replace(/\D/g, ''))}
              placeholder="Ej: 15000"
              type="number"
            />
            {errors.valorUnitario && (
              <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.valorUnitario}</p>
            )}
          </>
        )}

        {errors.general && <p style={{ color: '#E24B4A', fontSize: 13, marginBottom: 10 }}>{errors.general}</p>}

        <button className="gp-btn-primary" onClick={onConfirmar} disabled={guardando || bloqueado}>
          {guardando ? 'Guardando...' : 'Confirmar actualización'}
        </button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Registrar producto (en este local) ──────────────────────────────
// Ya NO crea un producto nuevo "desde cero": el nombre, categoría, código de
// barras y unidad de medida viven en el nodo GLOBAL de productos (ver
// DetalleModals > ModalRegistrarProductoGlobal). Acá solo se busca/selecciona
// ese producto global y se completa la info que es propia de ESTE local:
// stock mínimo y precio de venta. El stock actual siempre parte en 0.

export function RegistrarModal({
  isDesktop, visible, onClose, onGuardar, onEscanear,
  codigo, setCodigo, onBuscarCodigo, buscando, errorBusqueda,
  productoGlobal, productosGlobales, onSeleccionarGlobal,
  stockMinimo, setStockMinimo, precioVenta, setPrecioVenta,
  guardando, errors = {},
}) {
  if (!visible) return null;
  return (
    <ModalShell isDesktop={isDesktop} onClose={onClose} title="Registrar producto">
      <div className="gp-form-wrap">
        <button className="gp-scan-box" onClick={onEscanear}>
          <span className="gp-scan-icon">▦</span>
          <span className="gp-scan-title">Escanear código de barras</span>
          <span className="gp-scan-sub">Usa la pistola o haz clic para simular</span>
        </button>

        <div className="gp-or-divider">— o ingresa manualmente —</div>

        <div className="gp-form-group">
          <label className="gp-form-label">Código de barras</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="gp-form-input"
              style={{ flex: 1 }}
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
              placeholder="Ej: 7891234560012"
            />
            <button
              className="gp-btn-primary"
              style={{ width: 'auto', padding: '0 18px', flexShrink: 0 }}
              onClick={onBuscarCodigo}
              disabled={buscando}
            >
              {buscando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
          {errorBusqueda && (
            <p style={{ color: '#E24B4A', fontSize: 12, marginTop: 4 }}>{errorBusqueda}</p>
          )}
        </div>

        <div className="gp-or-divider">— o selecciona del catálogo —</div>

        <div className="gp-form-group">
          <label className="gp-form-label">Producto del catálogo global</label>
          <select
            className="gp-form-input"
            value={productoGlobal?.id ?? ''}
            onChange={(e) => {
              const seleccionado = productosGlobales.find((p) => p.id === e.target.value);
              if (seleccionado) onSeleccionarGlobal(seleccionado);
            }}
          >
            <option value="">Selecciona un producto...</option>
            {productosGlobales.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        {productoGlobal && (
          <div className="gp-found-box">
            <div className="gp-found-title">PRODUCTO VERIFICADO</div>
            <div className="gp-found-name">{productoGlobal.nombre}</div>
            <div className="gp-found-sub">
              {productoGlobal.categoria} · {productoGlobal.unidadMedida} · {productoGlobal.codigoBarra}
            </div>
          </div>
        )}

        {productoGlobal && (() => {
          const unidadBase = unidadBaseDesdeUnidadMedida(productoGlobal.unidadMedida);
          const etiqueta = etiquetaUnidadIngreso(unidadBase);
          const esFraccionable = unidadBase === 'g' || unidadBase === 'ml';
          return (
            <>
              <FormField
                label={`Stock mínimo (${etiqueta})`}
                value={stockMinimo}
                onChangeText={(v) => setStockMinimo(esFraccionable ? v.replace(/[^\d.]/g, '') : v.replace(/\D/g, ''))}
                placeholder={esFraccionable ? 'Ej: 5' : 'Ej: 20'}
                type="number"
              />
              {errors.stockMinimo && (
                <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.stockMinimo}</p>
              )}

              <FormField
                label={esFraccionable ? `Precio por ${etiqueta} ($)` : 'Precio de venta ($)'}
                value={precioVenta}
                onChangeText={(v) => setPrecioVenta(v.replace(/\D/g, ''))}
                placeholder="Ej: 1290"
                type="number"
              />
            {errors.precioVenta && (
              <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.precioVenta}</p>
            )}

            <p className="gp-scan-sub" style={{ marginTop: -6, marginBottom: 10 }}>
              El stock actual de este producto en el local parte en 0.
            </p>
          </>
          );
        })()}

        {errors.general && (
          <p style={{ color: '#E24B4A', fontSize: 13, marginBottom: 10 }}>{errors.general}</p>
        )}

        <button
          className="gp-btn-primary"
          onClick={onGuardar}
          disabled={!productoGlobal || guardando}
        >
          {guardando ? 'Guardando...' : 'Guardar producto'}
        </button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Transferir a otro local ───────────────────────────────────────────

export function TransferirModal({
  isDesktop, visible, onClose, onConfirmar,
  producto, cantidad, setCantidad, local, setLocal,
  valorTotal, setValorTotal,
  localesDestino = [], localLabels = {},
  bloqueoVencido = null,
  guardando, errors = {},
}) {
  if (!visible) return null;
  const etiqueta = etiquetaUnidadIngreso(producto?.unidad);
  const esFraccionable = producto?.unidad === 'g' || producto?.unidad === 'ml';
  return (
    <ModalShell isDesktop={isDesktop} onClose={onClose} title="⇄  Transferir a otro local">
      <div className="gp-form-wrap">
        {producto && (
          <div className="gp-found-box roomy">
            <div className="gp-found-title" style={{ marginBottom: 4 }}>PRODUCTO</div>
            <div className="gp-found-name roomy">{producto.nombre}</div>
            <div className="gp-found-sub roomy">
              Stock disponible: {formatStock(producto.stock, producto.unidad || 'uds')}
            </div>
          </div>
        )}
        {bloqueoVencido && producto && (
          <AvisoProductoVencido bloqueo={bloqueoVencido} producto={producto} motivo="transferencia" />
        )}
        <div className="gp-form-group">
          <label className="gp-form-label">Local de destino *</label>
          <select
            className="gp-form-input"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
          >
            <option value="">Selecciona un local...</option>
            {localesDestino.map((loc) => (
              <option key={loc} value={loc}>{localLabels[loc] ?? loc}</option>
            ))}
          </select>
          {errors.localDestino && <p style={{ color: '#E24B4A', fontSize: 12 }}>{errors.localDestino}</p>}
        </div>
        <FormField
          label={`Cantidad a transferir (${etiqueta}) *`}
          value={cantidad}
          onChangeText={(v) => setCantidad(esFraccionable ? v.replace(/[^\d.]/g, '') : v.replace(/\D/g, ''))}
          placeholder={esFraccionable ? 'Ej: 2' : 'Ej: 10'}
          type="number"
        />
        {errors.cantidad && <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.cantidad}</p>}

        <FormField
          label="Costo total de lo transferido ($) *"
          value={valorTotal}
          onChangeText={(v) => setValorTotal(v.replace(/\D/g, ''))}
          placeholder="Ej: 5000"
          type="number"
        />
        {errors.valorUnitario && <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.valorUnitario}</p>}

        {errors.general && <p style={{ color: '#E24B4A', fontSize: 13, marginBottom: 10 }}>{errors.general}</p>}

        <button className="gp-btn-primary" style={{ background: '#1A6FA8' }} onClick={onConfirmar} disabled={guardando || Boolean(bloqueoVencido)}>
          {guardando ? 'Transfiriendo...' : 'Confirmar transferencia'}
        </button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}