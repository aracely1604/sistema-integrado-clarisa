import { useState } from 'react';
import { productosDisponiblesParaIngrediente } from '../../models/RecetaLocalModel';

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

// ─── Dropdown genérico (reemplaza al Modal+Pressable de RN) ─────────────────

export function DropdownPicker({ label, valor, opciones, onSeleccionar, placeholder }) {
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
              <span className="rec-picker-title">{label || placeholder}</span>
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
        <p style={{ fontSize: 12.5, color: 'var(--rec-text-secondary, #7F8C8D)', marginBottom: 10 }}>
          Selecciona una receta del recetario global para asignarle productos de este local.
        </p>

        <input
          className="rec-search-input"
          placeholder="Buscar receta..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {filtradas.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--rec-text-secondary, #7F8C8D)' }}>
            No hay recetas globales disponibles para asignar.
          </p>
        ) : (
          <div className="rec-list">
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
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}

// ─── Formulario de asignación: producto local por ingrediente + precio ──────
// A diferencia del formulario anterior, esto NO crea una receta nueva: la
// receta (nombre, ingredientes, cantidades, unidades) ya existe en el
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

  return (
    <ModalShell isDesktop={isDesktop} onClose={onCerrar} title={recetaGlobal.nombre}>
      <div className="rec-form-wrap">
        {errores.general && (
          <p style={{ color: '#E24B4A', fontSize: 12.5, marginBottom: 10 }}>{errores.general}</p>
        )}

        <p style={{ fontSize: 12.5, color: 'var(--rec-text-secondary, #7F8C8D)', marginBottom: 14 }}>
          Asigna el producto de tu inventario que corresponde a cada ingrediente. La cantidad y
          unidad de medida vienen fijas desde la receta global y no se pueden modificar acá.
        </p>

        {recetaGlobal.ingredientes.map((ing, index) => {
          const seleccion = asignacion.ingredientes.find(a => a.idIngredienteGlobal === ing.id);
          const error = erroresIngredientes[index];
          const productosDisponibles = productosDisponiblesParaIngrediente(productosLocal, ing, asignacion);
          const opciones = productosDisponibles.map(p => ({ value: p.id, label: p.nombre }));
          const nombreSeleccionado = productosLocal.find(p => p.id === seleccion?.idProductoLocal)?.nombre ?? '';

          return (
            <div className="rec-form-group" key={ing.id}>
              <DropdownPicker
                label={`${ing.nombre} · ${ing.cantidad} ${ing.unidadMedida}`}
                valor={nombreSeleccionado}
                opciones={opciones}
                onSeleccionar={(idProductoLocal) => handleProductoChange(ing.id, idProductoLocal)}
                placeholder="Seleccionar producto del inventario..."
              />
              {opciones.length === 0 && (
                <p style={{ color: 'var(--rec-text-secondary, #7F8C8D)', fontSize: 12, marginTop: -4 }}>
                  No quedan productos disponibles en este local para este ingrediente.
                </p>
              )}
              {error && <p style={{ color: '#E24B4A', fontSize: 12, marginTop: -4 }}>{error}</p>}
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
          {errores.precioVenta && (
            <p style={{ color: '#E24B4A', fontSize: 12 }}>{errores.precioVenta}</p>
          )}
        </div>

        <button className="rec-btn-primary" onClick={onGuardar} disabled={guardando}>
          {guardando ? 'Guardando...' : 'Guardar asignación'}
        </button>
        <div style={{ height: 20 }} />
      </div>
    </ModalShell>
  );
}

// ─── Contenido de detalle (compartido entre panel desktop y modal móvil) ────

export function DetalleContenido({ receta, asignacion, productosLocal, onEditar, onToggleActiva }) {
  if (!receta) return null;

  function nombreProducto(idProductoLocal) {
    return productosLocal.find(p => p.id === idProductoLocal)?.nombre ?? 'Sin asignar';
  }

  const stats = [
    {
      label: 'Precio de venta',
      value: asignacion ? '$' + Number(asignacion.precioVenta).toLocaleString('es-CL') : 'Sin asignar',
      sub: asignacion ? 'CLP' : null,
    },
    { label: 'Ingredientes', value: String(receta.ingredientes.length), sub: 'items' },
    { label: 'Estado', value: asignacion?.activo ? 'Activa' : 'Desactivada' },
  ];

  return (
    <>
      <div className="rec-stats-grid">
        {stats.map((item, i) => (
          <div key={i} className="rec-stat-card">
            <div className="rec-stat-label">{item.label}</div>
            <div className="rec-stat-value">{item.value}</div>
            {item.sub && <div className="rec-stat-sub">{item.sub}</div>}
          </div>
        ))}
      </div>

      <div className="rec-info-block">
        <div className="rec-block-title">Ingredientes</div>
        {receta.ingredientes.map((ing) => {
          const asignado = asignacion?.ingredientes?.find(a => a.idIngredienteGlobal === ing.id);
          return (
            <div key={ing.id} className="rec-info-row">
              <span className="rec-info-key">{ing.nombre} · {ing.cantidad} {ing.unidadMedida}</span>
              <span className="rec-info-val">
                {asignado ? nombreProducto(asignado.idProductoLocal) : 'Sin asignar'}
              </span>
            </div>
          );
        })}
      </div>

      <button className="rec-edit-btn" onClick={onEditar}>
        {asignacion ? 'Editar asignación' : 'Asignar productos'}
      </button>

      {asignacion && (
        <button
          className="rec-edit-btn"
          style={{
            marginTop: 8,
            borderColor: asignacion.activo ? '#F5C6C6' : '#B5D4F4',
            color: asignacion.activo ? '#791F1F' : '#0C447C',
          }}
          onClick={onToggleActiva}
        >
          {asignacion.activo ? 'Desactivar receta' : 'Activar receta'}
        </button>
      )}

      <div style={{ height: 20 }} />
    </>
  );
}

// ─── Modal: Detalle (solo se usa en layout móvil) ───────────────────────────

export function DetalleModal({ isDesktop, visible, receta, asignacion, productosLocal, onClose, onEditar, onToggleActiva }) {
  if (isDesktop || !visible) return null;
  return (
    <ModalShell isDesktop={false} onClose={onClose} title={receta?.nombre || ''}>
      <DetalleContenido
        receta={receta}
        asignacion={asignacion}
        productosLocal={productosLocal}
        onEditar={onEditar}
        onToggleActiva={onToggleActiva}
      />
    </ModalShell>
  );
}