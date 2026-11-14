import { useState, useEffect } from 'react';
import { FiCheckCircle, FiX } from 'react-icons/fi';
import { useAuth, localesAsignados } from '../../controllers/AuthContext';
import { crearProductoEnLocal, registrarMovimientoStock } from '../../controllers/LocalProductoControl';
import { suscribirProveedoresPorLocal } from '../../controllers/ProveedorControl';
import { nombreProveedor } from '../../models/ProveedorModel';
import { LOCAL_LABELS, LOCALES_LIST } from './inventarioData';
import { svgCode128, esCode128B } from './code128';
import { svgCodigoComercial } from './barcodeSvg';
import {
  unidadBaseDesdeUnidadMedida, convertirACantidadBase, etiquetaUnidadIngreso,
} from './gestionProductosData';

// Flujo que se abre justo después de crear un producto global:
// Si el usuario tiene UN solo local (cajero, o supervisor con un local) se salta el selector:
// tras "Aceptar" va directo al formulario de ese local.
//  1) "creado":      confirma que el producto fue creado (y con qué código) → Aceptar
//  2) "selector":    elige en qué locales registrarlo (o "Ahora no")
//  3) "formularios": un formulario por local elegido, todos visibles a la vez
//                    (stock mínimo, precio y uso en receta propios de cada local)
//  3b) "reposicion": tras registrar, una card por local con el formulario de reposición
//                    (proveedor, cantidad, vencimiento y costo total); se puede omitir
//  4) "listo":       mensaje "se asignó a ..." con botón Aceptar
// Al terminar (o cancelar en cualquier paso) llama a onTerminar() y el modal
// "Registrar producto" queda otra vez disponible.

// Estilos propios: este flujo vive fuera del contenedor de Gestión de productos, así que no
// puede depender de las variables --gp-*. Usa las --c-* del tema del layout (con respaldo).
const CSS = `
.rel-overlay { position: fixed; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center;
  padding: 20px; background: rgba(0, 0, 0, 0.5); }
.rel-card { width: 100%; max-height: calc(100vh - 40px); overflow-y: auto; box-sizing: border-box; padding: 22px;
  border-radius: 18px; background: var(--c-surface, #fff); color: var(--c-textPrimary, #1B1B1B);
  border: 1px solid var(--c-border, #E4E2DD); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); }
.rel-title { margin: 0; font-size: 18px; font-weight: 700; }
.rel-hint { margin: 4px 0 16px; font-size: 13px; color: var(--c-textSecondary, #7F8C8D); }
.rel-close { background: none; border: none; cursor: pointer; padding: 4px; color: var(--c-textSecondary, #7F8C8D); display: flex; }
.rel-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.rel-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.rel-local { padding: 16px; border-radius: 14px; border: 1.5px solid var(--c-border, #D5D2CB); background: var(--c-surface2, #F6F5F2); }
.rel-local-ok { border-color: #639922; }
.rel-local-title { margin: 0 0 14px; font-size: 15px; font-weight: 700; }
.rel-field { margin-bottom: 14px; }
.rel-label { display: block; margin-bottom: 6px; font-size: 12.5px; font-weight: 600; color: var(--c-textSecondary, #5F6B6C); }
.rel-input { width: 100%; box-sizing: border-box; padding: 11px 12px; font-size: 15px; border-radius: 10px;
  border: 1.5px solid var(--c-textSecondary, #8C8A84); background: var(--c-surface, #fff); color: var(--c-textPrimary, #1B1B1B);
  outline: none; transition: border-color .15s, box-shadow .15s; }
.rel-input::placeholder { color: var(--c-placeholder, #A3A19B); }
.rel-input:focus { border-color: var(--c-btnBg, #1B1B1B); box-shadow: 0 0 0 3px rgba(80, 120, 200, 0.25); }
.rel-input:disabled { opacity: .6; cursor: not-allowed; }
.rel-input-error { border-color: #E24B4A; }
.rel-error { margin: 6px 0 0; font-size: 12px; color: #E24B4A; }
.rel-check { display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13.5px; }
.rel-check input { width: 18px; height: 18px; flex-shrink: 0; cursor: pointer; }
.rel-actions { display: flex; gap: 10px; margin-top: 18px; }
.rel-btn { flex: 1; padding: 13px 16px; font-size: 14px; font-weight: 600; border-radius: 12px; cursor: pointer;
  border: 1.5px solid var(--c-border, #D5D2CB); background: var(--c-surface, #fff); color: var(--c-textPrimary, #1B1B1B); }
.rel-btn-primary { background: var(--c-btnBg, #1B1B1B); color: var(--c-btnText, #fff); border-color: var(--c-btnBg, #1B1B1B); }
.rel-btn:disabled { opacity: .5; cursor: not-allowed; }
.rel-chip { padding: 10px 16px; font-size: 14px; font-weight: 600; border-radius: 999px; cursor: pointer;
  border: 1.5px solid var(--c-border, #D5D2CB); background: var(--c-surface, #fff); color: var(--c-textPrimary, #1B1B1B); }
.rel-chip-on { background: var(--c-btnBg, #1B1B1B); color: var(--c-btnText, #fff); border-color: var(--c-btnBg, #1B1B1B); }
`;

const ESTADO_INICIAL = {
  stockMinimo: '', precioVenta: '', precioOferta: '', usoReceta: false, errors: {}, estado: 'pendiente',
  // Reposición (paso posterior al registro)
  reposProveedor: '', reposCantidad: '', reposVence: '', reposCosto: '', reposErrors: {}, reposEstado: 'pendiente',
};

// Fecha local (no UTC) en formato AAAA-MM-DD, para el min/max del <input type="date">.
const aISOLocal = (f) =>
  `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
const hoyISO = () => aISOLocal(new Date());
const maxVencISO = () => { const f = new Date(); f.setFullYear(f.getFullYear() + 10); return aISOLocal(f); };

// Una card de reposición está "vacía" (se omite) si no se tocó ningún campo.
const reposVacia = (d) =>
  [d.reposProveedor, d.reposCantidad, d.reposVence, d.reposCosto].every((v) => String(v).trim() === '');

// El controller devuelve errores con sus propios nombres de campo; se traducen a los de la card.
const ERRORES_REPOS = { cantidad: 'cantidad', proveedorId: 'proveedor', fechaVencimiento: 'vence', valorUnitario: 'costo', general: 'general' };
function traducirErroresRepos(errores) {
  const salida = {};
  Object.entries(errores ?? {}).forEach(([k, v]) => { salida[ERRORES_REPOS[k] ?? 'general'] = v; });
  return salida;
}

export default function RegistroEnLocalesFlujo({ producto, onTerminar }) {
  const { usuario } = useAuth();
  const localesUsuario = localesAsignados(usuario?.localAsignado || usuario?.local);
  const localesDisponibles = LOCALES_LIST.filter((l) => localesUsuario.includes(l));

  const [paso, setPaso]           = useState('creado');
  const [elegidos, setElegidos]   = useState([]);
  const [porLocal, setPorLocal]   = useState({});   // { [local]: { stockMinimo, precioVenta, usoReceta, errors, estado } }
  const [guardando, setGuardando] = useState(false);
  const [proveedoresPorLocal, setProveedoresPorLocal] = useState({});  // { [local]: ProveedorModel[] activos }

  // En el paso de reposición se cargan (en vivo) los proveedores activos de cada local elegido.
  useEffect(() => {
    if (paso !== 'reposicion') return undefined;
    const cancelar = elegidos.map((local) =>
      suscribirProveedoresPorLocal(local, (lista) =>
        setProveedoresPorLocal((prev) => ({ ...prev, [local]: lista.filter((p) => p.activo) }))
      )
    );
    return () => cancelar.forEach((fn) => fn());
  }, [paso, elegidos]);

  if (!producto) return null;

  // Un solo local (cajero, o supervisor con uno): no hay nada que elegir.
  const unSoloLocal = localesDisponibles.length === 1;

  const unidadBase     = unidadBaseDesdeUnidadMedida(producto.unidadMedida);
  const etiqueta       = etiquetaUnidadIngreso(unidadBase);
  const esFraccionable = unidadBase === 'g' || unidadBase === 'ml';

  const datosLocal = (local) => porLocal[local] ?? ESTADO_INICIAL;
  const actualizarLocal = (local, cambios) =>
    setPorLocal((prev) => ({ ...prev, [local]: { ...(prev[local] ?? ESTADO_INICIAL), ...cambios } }));

  function continuarDesdeCreado() {
    if (unSoloLocal) {
      setElegidos([localesDisponibles[0]]);
      setPaso('formularios');
    } else {
      setPaso('selector');
    }
  }

  function alternarLocal(local) {
    setElegidos((prev) => (prev.includes(local) ? prev.filter((l) => l !== local) : [...prev, local]));
  }

  async function guardarTodos() {
    setGuardando(true);
    let fallo = false;
    for (const local of elegidos) {
      const d = datosLocal(local);
      if (d.estado === 'ok') continue;               // ya guardado en un intento anterior
      actualizarLocal(local, { estado: 'guardando', errors: {} });
      try {
        await crearProductoEnLocal(local, producto.id, {
          stockMinimo: convertirACantidadBase(d.stockMinimo, unidadBase),
          precioVenta: d.precioVenta,
          oferta: d.precioOferta,     // opcional; la oferta nace desactivada
          usoReceta: d.usoReceta,
        });
        actualizarLocal(local, { estado: 'ok' });
      } catch (err) {
        fallo = true;
        actualizarLocal(local, {
          estado: 'pendiente',
          errors: err?.errores ?? { general: 'No se pudo guardar en este local. Intenta nuevamente.' },
        });
      }
    }
    setGuardando(false);
    if (!fallo) setPaso('reposicion');   // todos los locales quedaron registrados → reposición
  }

  // Reposición: las cards sin ningún campo tocado se omiten; las demás se validan completas.
  const hayReposicion = elegidos.some((l) => !reposVacia(datosLocal(l)));

  async function guardarReposiciones() {
    let invalido = false;
    for (const local of elegidos) {
      const d = datosLocal(local);
      if (d.reposEstado === 'ok' || reposVacia(d)) continue;
      const errs = {};
      const cant = Number(d.reposCantidad);
      const costo = Number(d.reposCosto);
      if (!d.reposProveedor) errs.proveedor = 'Selecciona un proveedor';
      if (!Number.isFinite(cant) || cant <= 0) errs.cantidad = 'Ingresa una cantidad mayor a 0';
      if (!d.reposVence) errs.vence = 'La fecha de vencimiento es obligatoria';
      else if (d.reposVence < hoyISO()) errs.vence = 'La fecha de vencimiento no puede ser anterior a hoy';
      if (!Number.isFinite(costo) || costo <= 0) errs.costo = 'Ingresa el costo total (mayor a 0)';
      if (Object.keys(errs).length) { invalido = true; actualizarLocal(local, { reposErrors: errs }); }
    }
    if (invalido) return;

    setGuardando(true);
    let fallo = false;
    for (const local of elegidos) {
      const d = datosLocal(local);
      if (d.reposEstado === 'ok' || reposVacia(d)) continue;
      actualizarLocal(local, { reposEstado: 'guardando', reposErrors: {} });
      try {
        const cantidadBase = Number(convertirACantidadBase(d.reposCantidad, unidadBase));
        await registrarMovimientoStock({
          local,
          idProducto: producto.id,
          tipoMovimiento: 'reposicion',
          cantidad: cantidadBase,
          proveedorId: d.reposProveedor,
          fechaVencimiento: d.reposVence,                       // AAAA-MM-DD; el controller la normaliza
          valorUnitario: Number(d.reposCosto) / cantidadBase,   // costo total ÷ cantidad (unidad base)
          usuario,
        });
        actualizarLocal(local, { reposEstado: 'ok' });
      } catch (err) {
        fallo = true;
        actualizarLocal(local, {
          reposEstado: 'pendiente',
          reposErrors: err?.errores
            ? traducirErroresRepos(err.errores)
            : { general: 'No se pudo registrar la reposición en este local. Intenta nuevamente.' },
        });
      }
    }
    setGuardando(false);
    if (!fallo) setPaso('listo');
  }

  // "Comida Rápida", "Comida Rápida y Almacén", "Comida Rápida, Almacén y Cafetería"
  function listarLocales(locales) {
    const nombres = locales.map((l) => LOCAL_LABELS[l] ?? l);
    if (nombres.length <= 1) return nombres.join('');
    return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
  }

  const overlay = (children, ancho = 460) => (
    <div className="rel-overlay">
      <style>{CSS}</style>
      <div className="rel-card" style={{ maxWidth: ancho }} role="dialog" aria-modal="true">
        {children}
      </div>
    </div>
  );

  // ── 1) Producto creado ──
  if (paso === 'creado') {
    // Código de barras dibujado: los internos (GR-####) en Code 128; los comerciales con su propia
    // simbología (EAN-13, UPC-A o EAN-8); cualquier otro código cae a Code 128 si es posible.
    const codigo = producto.codigoBarra;
    let svgBarras = null;
    try {
      if (producto.esGranel && esCode128B(codigo)) svgBarras = svgCode128(codigo);
      else svgBarras = svgCodigoComercial(codigo) ?? (esCode128B(codigo) ? svgCode128(codigo) : null);
    } catch {
      svgBarras = null;
    }
    return overlay(
      <>
        <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
          <FiCheckCircle size={36} color="#639922" />
          <h2 className="rel-title" style={{ marginTop: 10 }}>Producto creado</h2>
          <p style={{ margin: '6px 0 4px', fontWeight: 600, fontSize: 14 }}>{producto.nombre}</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--c-textSecondary, #7F8C8D)' }}>
            Código de barras
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' }}>
            {producto.codigoBarra}
          </p>
          {svgBarras && (
            // Ambos SVG se generan solo a partir del código ya validado: seguros como HTML
            <div
              style={{ width: 240, maxWidth: '100%', margin: '10px auto 0', background: '#fff', borderRadius: 6, overflow: 'hidden' }}
              dangerouslySetInnerHTML={{ __html: svgBarras }}
            />
          )}
          {producto.esGranel && (
            <p className="rel-hint" style={{ marginTop: 8, marginBottom: 0 }}>
              Código interno (Code 128) para producto a granel. Imprímelo desde “Códigos de barras (granel)”.
            </p>
          )}
        </div>
        <div className="rel-actions">
          <button type="button" className="rel-btn rel-btn-primary" onClick={continuarDesdeCreado}>
            Aceptar
          </button>
        </div>
      </>
    );
  }

  // ── 2) Selección de locales ──
  if (paso === 'selector') {
    return overlay(
      <>
        <div className="rel-row">
          <h2 className="rel-title">¿En qué locales lo registras?</h2>
          <button type="button" className="rel-close" onClick={onTerminar} aria-label="Cerrar"><FiX size={20} /></button>
        </div>
        <p className="rel-hint">
          Puedes elegir varios y completar los datos de cada uno al mismo tiempo. Si prefieres hacerlo después,
          usa “+ Registrar producto” dentro de Gestión de productos de cada local.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {localesDisponibles.map((local) => (
            <button
              key={local}
              type="button"
              onClick={() => alternarLocal(local)}
              className={`rel-chip ${elegidos.includes(local) ? 'rel-chip-on' : ''}`}
            >
              {LOCAL_LABELS[local]}
            </button>
          ))}
        </div>
        <div className="rel-actions">
          <button type="button" className="rel-btn" onClick={onTerminar}>Ahora no</button>
          <button
            type="button"
            className="rel-btn rel-btn-primary"
            disabled={elegidos.length === 0}
            onClick={() => setPaso('formularios')}
          >
            Continuar ({elegidos.length})
          </button>
        </div>
      </>
    );
  }

  // ── 4) Confirmación ──
  if (paso === 'listo') {
    const atodos = elegidos.length === LOCALES_LIST.length;
    return overlay(
      <>
        <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
          <FiCheckCircle size={36} color="#639922" />
          <h2 className="rel-title" style={{ marginTop: 10 }}>
            {atodos ? 'Asignado a todos los locales' : (elegidos.length === 1 ? 'Asignado al local' : 'Asignado a los locales')}
          </h2>
          <p style={{ margin: '8px 0 0', fontSize: 14 }}>
            “{producto.nombre}” se asignó {atodos ? 'a todos los locales' : `a ${listarLocales(elegidos)}`}.
          </p>
          {elegidos.some((l) => datosLocal(l).reposEstado === 'ok') && (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--c-textSecondary, #7F8C8D)' }}>
              Reposición registrada en {listarLocales(elegidos.filter((l) => datosLocal(l).reposEstado === 'ok'))}.
            </p>
          )}
        </div>
        <div className="rel-actions">
          <button type="button" className="rel-btn rel-btn-primary" onClick={onTerminar} autoFocus>
            Aceptar
          </button>
        </div>
      </>
    );
  }

  // ── 3b) Reposición: una card por local ──
  if (paso === 'reposicion') {
    return overlay(
      <>
        <div className="rel-row">
          <h2 className="rel-title">Reposición de “{producto.nombre}”</h2>
          <button type="button" className="rel-close" onClick={() => setPaso('listo')} aria-label="Omitir" disabled={guardando}>
            <FiX size={20} />
          </button>
        </div>
        <p className="rel-hint">
          El producto ya quedó registrado con stock 0. Ingresa la compra que repones en cada local; las cards que dejes
          vacías se omiten y podrás reponerlas después.
        </p>

        <div className="rel-grid">
          {elegidos.map((local) => {
            const d = datosLocal(local);
            const bloqueado = d.reposEstado === 'ok' || guardando;
            const proveedores = proveedoresPorLocal[local];   // undefined = cargando
            const sinProveedores = Array.isArray(proveedores) && proveedores.length === 0;
            return (
              <div key={local} className={`rel-local ${d.reposEstado === 'ok' ? 'rel-local-ok' : ''}`}>
                <p className="rel-local-title">
                  {LOCAL_LABELS[local]}
                  {d.reposEstado === 'ok' && <span style={{ color: '#3B6D11', fontWeight: 600 }}> · Repuesto ✓</span>}
                </p>

                <div className="rel-field">
                  <label className="rel-label" htmlFor={`repo-prov-${local}`}>Proveedor</label>
                  <select
                    id={`repo-prov-${local}`}
                    className={`rel-input ${d.reposErrors.proveedor ? 'rel-input-error' : ''}`}
                    disabled={bloqueado || !proveedores || sinProveedores}
                    value={d.reposProveedor}
                    onChange={(e) => actualizarLocal(local, {
                      reposProveedor: e.target.value,
                      reposErrors: { ...d.reposErrors, proveedor: undefined },
                    })}
                  >
                    <option value="">{!proveedores ? 'Cargando...' : 'Selecciona un proveedor'}</option>
                    {(proveedores ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{nombreProveedor(p)}</option>
                    ))}
                  </select>
                  {sinProveedores && (
                    <p className="rel-error">Este local no tiene proveedores activos. Asigna uno desde Proveedores para reponer aquí.</p>
                  )}
                  {d.reposErrors.proveedor && <p className="rel-error">{d.reposErrors.proveedor}</p>}
                </div>

                <div className="rel-field">
                  <label className="rel-label" htmlFor={`repo-cant-${local}`}>Cantidad a reponer ({etiqueta})</label>
                  <input
                    id={`repo-cant-${local}`}
                    className={`rel-input ${d.reposErrors.cantidad ? 'rel-input-error' : ''}`}
                    type="text"
                    inputMode="decimal"
                    disabled={bloqueado}
                    value={d.reposCantidad}
                    placeholder={esFraccionable ? 'Ej: 10' : 'Ej: 24'}
                    onChange={(e) => actualizarLocal(local, {
                      reposCantidad: esFraccionable ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, ''),
                      reposErrors: { ...d.reposErrors, cantidad: undefined },
                    })}
                  />
                  {d.reposErrors.cantidad && <p className="rel-error">{d.reposErrors.cantidad}</p>}
                </div>

                <div className="rel-field">
                  <label className="rel-label" htmlFor={`repo-venc-${local}`}>Fecha de vencimiento</label>
                  <input
                    id={`repo-venc-${local}`}
                    className={`rel-input ${d.reposErrors.vence ? 'rel-input-error' : ''}`}
                    type="date"
                    min={hoyISO()}
                    max={maxVencISO()}
                    disabled={bloqueado}
                    value={d.reposVence}
                    onChange={(e) => actualizarLocal(local, {
                      reposVence: e.target.value,
                      reposErrors: { ...d.reposErrors, vence: undefined },
                    })}
                  />
                  {d.reposErrors.vence && <p className="rel-error">{d.reposErrors.vence}</p>}
                </div>

                <div className="rel-field">
                  <label className="rel-label" htmlFor={`repo-costo-${local}`}>Costo total de la compra ($)</label>
                  <input
                    id={`repo-costo-${local}`}
                    className={`rel-input ${d.reposErrors.costo ? 'rel-input-error' : ''}`}
                    type="text"
                    inputMode="numeric"
                    disabled={bloqueado}
                    value={d.reposCosto}
                    placeholder="Ej: 15000"
                    onChange={(e) => actualizarLocal(local, {
                      reposCosto: e.target.value.replace(/\D/g, ''),
                      reposErrors: { ...d.reposErrors, costo: undefined },
                    })}
                  />
                  {d.reposErrors.costo && <p className="rel-error">{d.reposErrors.costo}</p>}
                </div>

                {d.reposErrors.general && <p className="rel-error">{d.reposErrors.general}</p>}
              </div>
            );
          })}
        </div>

        <div className="rel-actions">
          <button type="button" className="rel-btn" onClick={() => setPaso('listo')} disabled={guardando}>
            Omitir por ahora
          </button>
          <button
            type="button"
            className="rel-btn rel-btn-primary"
            onClick={guardarReposiciones}
            disabled={guardando || !hayReposicion}
          >
            {guardando ? 'Registrando...' : 'Registrar reposición'}
          </button>
        </div>
      </>,
      elegidos.length > 1 ? 1000 : 460
    );
  }

  // ── 3) Un formulario por local, todos a la vez ──
  return overlay(
    <>
      <div className="rel-row">
        <h2 className="rel-title">Registrar “{producto.nombre}”</h2>
        <button type="button" className="rel-close" onClick={onTerminar} aria-label="Cerrar" disabled={guardando}>
          <FiX size={20} />
        </button>
      </div>
      <p className="rel-hint">
        El stock actual parte en 0 en cada local. Completa los valores propios de cada uno.
      </p>

      <div className="rel-grid">
        {elegidos.map((local) => {
          const d = datosLocal(local);
          const bloqueado = d.estado === 'ok' || guardando;
          return (
            <div key={local} className={`rel-local ${d.estado === 'ok' ? 'rel-local-ok' : ''}`}>
              <p className="rel-local-title">
                {LOCAL_LABELS[local]}
                {d.estado === 'ok' && <span style={{ color: '#3B6D11', fontWeight: 600 }}> · Registrado ✓</span>}
              </p>

              <div className="rel-field">
                <label className="rel-label" htmlFor={`min-${local}`}>Stock mínimo ({etiqueta})</label>
                <input
                  id={`min-${local}`}
                  className={`rel-input ${d.errors.stockMinimo ? 'rel-input-error' : ''}`}
                  type="text"
                  inputMode="decimal"
                  disabled={bloqueado}
                  value={d.stockMinimo}
                  placeholder={esFraccionable ? 'Ej: 5' : 'Ej: 20'}
                  onChange={(e) => actualizarLocal(local, {
                    stockMinimo: esFraccionable ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, ''),
                    errors: { ...d.errors, stockMinimo: undefined },
                  })}
                />
                {d.errors.stockMinimo && <p className="rel-error">{d.errors.stockMinimo}</p>}
              </div>

              <div className="rel-field">
                <label className="rel-label" htmlFor={`precio-${local}`}>
                  {esFraccionable ? `Precio por ${etiqueta} ($)` : 'Precio de venta ($)'}
                </label>
                <input
                  id={`precio-${local}`}
                  className={`rel-input ${d.errors.precioVenta ? 'rel-input-error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  disabled={bloqueado}
                  value={d.precioVenta}
                  placeholder="Ej: 1290"
                  onChange={(e) => actualizarLocal(local, {
                    precioVenta: e.target.value.replace(/\D/g, ''),
                    errors: { ...d.errors, precioVenta: undefined },
                  })}
                />
                {d.errors.precioVenta && <p className="rel-error">{d.errors.precioVenta}</p>}
              </div>

              <div className="rel-field">
                <label className="rel-label" htmlFor={`oferta-${local}`}>
                  {esFraccionable ? `Precio de oferta por ${etiqueta} ($)` : 'Precio de oferta ($)'} (opcional)
                </label>
                <input
                  id={`oferta-${local}`}
                  className={`rel-input ${d.errors.oferta ? 'rel-input-error' : ''}`}
                  type="text"
                  inputMode="numeric"
                  disabled={bloqueado}
                  value={d.precioOferta}
                  placeholder="Ej: 990"
                  onChange={(e) => actualizarLocal(local, {
                    precioOferta: e.target.value.replace(/\D/g, ''),
                    errors: { ...d.errors, oferta: undefined },
                  })}
                />
                {d.errors.oferta
                  ? <p className="rel-error">{d.errors.oferta}</p>
                  : <p className="rel-hint" style={{ margin: '6px 0 0', fontSize: 12 }}>
                      Podrás definirlo y activarlo más adelante desde el detalle del producto. La oferta queda desactivada.
                    </p>}
              </div>

              <label className="rel-check">
                <input
                  type="checkbox"
                  disabled={bloqueado}
                  checked={d.usoReceta}
                  onChange={(e) => actualizarLocal(local, { usoReceta: e.target.checked })}
                />
                <span>Se usa para receta (ingrediente)</span>
              </label>

              {d.errors.general && <p className="rel-error">{d.errors.general}</p>}
            </div>
          );
        })}
      </div>

      <div className="rel-actions">
        <button type="button" className="rel-btn" onClick={onTerminar} disabled={guardando}>
          Cancelar
        </button>
        <button type="button" className="rel-btn rel-btn-primary" onClick={guardarTodos} disabled={guardando}>
          {guardando ? 'Asignando...' : `Asignar a ${elegidos.length} ${elegidos.length === 1 ? 'local' : 'locales'}`}
        </button>
      </div>
    </>,
    elegidos.length > 1 ? 1000 : 460
  );
}