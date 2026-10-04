import { useState } from 'react';
import {
  formatStock, formatPrecio, etiquetaUnidadIngreso,
  convertirValorUnitarioAIngreso, unidadBaseDesdeUnidadMedida,
} from './gestionProductosData';

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

// ─── Contenido de detalle (compartido entre panel desktop y modal móvil) ────

export function DetalleContenido({ producto, onEditar, onTransferir, onToggleActivo, historial = [], cargandoHistorial = false }) {
  if (!producto) return null;
  const etiqueta = etiquetaUnidadIngreso(producto.unidad);
  const stockLabel = formatStock(producto.stock, producto.unidad || 'uds');
  const minimoLabel = formatStock(producto.minimo, producto.unidad || 'uds');

  // El historial ya viene ordenado del más reciente al más antiguo, así que
  // el primero que tenga proveedor (solo las reposiciones lo traen) es el
  // último proveedor real con el que se repuso este producto en este local.
  const ultimoMovConProveedor = historial.find((m) => m.proveedorNombre);
  const ultimoProveedorLabel = ultimoMovConProveedor
    ? `${ultimoMovConProveedor.proveedorNombre}${ultimoMovConProveedor.proveedorEmpresa ? ' — ' + ultimoMovConProveedor.proveedorEmpresa : ''}`
    : 'Sin proveedor';

  const stats = [
    { label: `Stock actual (${etiqueta})`, value: stockLabel },
    { label: `Precio (${etiqueta})`, value: formatPrecio(producto.precio, producto.unidad || 'uds') },
    { label: 'Categoría', value: producto.categoria },
    { label: 'Último proveedor', value: ultimoProveedorLabel },
  ];

  const datos = [
    { k: 'Código', v: producto.codigo },
    { k: `Stock mínimo (${etiqueta})`, v: minimoLabel },
    { k: 'Tipo de stock', v: etiqueta },
    { k: 'Última actualización', v: producto.ultima },
  ];

  return (
    <>
      {/* Stats */}
      <div className="gp-stats-grid">
        {stats.map((item, i) => (
          <div key={i} className="gp-stat-card">
            <div className="gp-stat-label">{item.label}</div>
            <div className="gp-stat-value">{item.value}</div>
            {item.sub && <div className="gp-stat-sub">{item.sub}</div>}
          </div>
        ))}
      </div>

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

      {/* Historial — datos reales de historialStock, filtrados a este producto en este local */}
      <HistorialMovimientos producto={producto} historial={historial} cargando={cargandoHistorial} />

      {/* Botones de acción */}
      <button className="gp-edit-btn" onClick={onEditar}>✎  Editar datos del producto</button>
      <button className="gp-edit-btn gp-edit-btn-transfer" onClick={onTransferir}>⇄  Transferir a otro local</button>

      <div style={{ height: 20 }} />
    </>
  );
}

// ─── Historial de movimientos: fila simple, click para ver todo el detalle ──
const ETIQUETAS_TIPO_MOVIMIENTO = {
  reposicion: 'Reposición',
  transferencia: 'Transferencia',
  devolucion: 'Devolución',
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

function HistorialMovimientos({ producto, historial, cargando }) {
  const [expandidoId, setExpandidoId] = useState(null);
  const etiqueta = etiquetaUnidadIngreso(producto.unidad);

  return (
    <div className="gp-info-block">
      <div className="gp-block-title">Historial de movimientos</div>

      {cargando && <p className="gp-stat-sub">Cargando historial...</p>}

      {!cargando && historial.length === 0 && (
        <p className="gp-stat-sub">Todavía no hay movimientos registrados para este producto en este local.</p>
      )}

      {!cargando && historial.map((mov) => {
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

export function DetalleModal({ isDesktop, visible, producto, onClose, onEditar, onTransferir, onToggleActivo, historial, cargandoHistorial }) {
  if (isDesktop || !visible) return null;
  return (
    <ModalShell isDesktop={false} onClose={onClose} title={producto?.nombre || ''}>
      <DetalleContenido
        producto={producto}
        onEditar={onEditar}
        onTransferir={onTransferir}
        onToggleActivo={onToggleActivo}
        historial={historial}
        cargandoHistorial={cargandoHistorial}
      />
    </ModalShell>
  );
}

// ─── Modal: Editar producto ──────────────────────────────────────────────────

export function EditarModal({
  isDesktop, visible, onClose, onGuardar,
  nombre, setNombre, precio, setPrecio, minimo, setMinimo,
  unidad,
}) {
  if (!visible) return null;
  const etiqueta = etiquetaUnidadIngreso(unidad);
  const esFraccionable = unidad === 'g' || unidad === 'ml';
  return (
    <ModalShell isDesktop={isDesktop} onClose={onClose} title="Editar producto">
      <div className="gp-form-wrap">
        <FormField label="Nombre" value={nombre} onChangeText={setNombre} placeholder="Nombre del producto" />
        <FormField
          label={esFraccionable ? `Precio por ${etiqueta} ($)` : 'Precio unitario ($)'}
          value={precio}
          onChangeText={setPrecio}
          placeholder="Ej: 1290"
          type="number"
        />
        <FormField
          label={`Stock mínimo (${etiqueta})`}
          value={minimo}
          onChangeText={setMinimo}
          placeholder={esFraccionable ? 'Ej: 5' : 'Ej: 20'}
          type="number"
        />
        <button className="gp-btn-primary" onClick={onGuardar}>Guardar cambios</button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}

// ─── Modal: Actualizar stock ──────────────────────────────────────────────────

// ─── Modal: Actualizar stock (movimientos: reposición / transferencia / devolución) ──
// El scanner y el input manual de código de barras se mantienen igual que
// siempre. Lo que cambia es que, según el tipo de movimiento elegido, se
// muestran solo los campos que corresponden. Ya NO existe número de lote.
export function ActualizarStockModal({
  isDesktop, visible, onClose, onConfirmar, onEscanear,
  codigo, setCodigo, cantidad, setCantidad,
  tipoMovimiento, setTipoMovimiento,
  productoEncontrado,
  proveedores = [], proveedorId, setProveedorId,
  fechaVencimiento, setFechaVencimiento,
  valorTotal, setValorTotal,
  localesDestino = [], localLabels = {}, localDestino, setLocalDestino,
  guardando, errors = {},
}) {
  if (!visible) return null;

  const etiqueta = etiquetaUnidadIngreso(productoEncontrado?.unidad);
  const esFraccionable = productoEncontrado?.unidad === 'g' || productoEncontrado?.unidad === 'ml';

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

            <FormField
              label="Fecha de vencimiento *"
              value={fechaVencimiento}
              onChangeText={setFechaVencimiento}
              placeholder="DD/MM/AAAA"
            />
            {errors.fechaVencimiento && (
              <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -10, marginBottom: 10 }}>{errors.fechaVencimiento}</p>
            )}

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

        <button className="gp-btn-primary" onClick={onConfirmar} disabled={guardando}>
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

        <button className="gp-btn-primary" style={{ background: '#1A6FA8' }} onClick={onConfirmar} disabled={guardando}>
          {guardando ? 'Transfiriendo...' : 'Confirmar transferencia'}
        </button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}