import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../controllers/AuthContext';
import {
  CATEGORIAS,
  getStockStatus, formatStock, unidadBaseDesdeUnidadMedida,
  convertirACantidadBase, etiquetaUnidadIngreso,
  convertirValorUnitarioABase,
} from './gestionProductosData';
import {
  FiltroPickerModal, DetalleContenido, DetalleModal,
  ActualizarStockModal, RegistrarModal, TransferirModal,
} from './GestionProductosForms';
import {
  obtenerProductoPorCodigoBarra, suscribirProductosGlobales,
} from '../../controllers/ProductoControl';
import {
  crearProductoEnLocal, obtenerProductoLocal, suscribirProductosLocal,
  actualizarProductoLocal, cambiarEstadoProductoLocal, cambiarOfertaActivaProductoLocal,
  transferirProductoEntreLocales, registrarMovimientoStock,
} from '../../controllers/LocalProductoControl';
import { suscribirProveedoresPorLocal } from '../../controllers/ProveedorControl';
import { suscribirUltimaReposicionProducto } from '../../controllers/HistorialStockControl';
import { diasHastaVencimiento, formatFechaVencimiento } from './vencimientoUtils';
import { DIAS_VENCIMIENTO_MAX } from './inventarioHelpers';
import { LOCAL_LABELS, LOCALES_LIST } from './inventarioData';
import '../../css/GestionProductos.css';

const DESKTOP_BREAKPOINT = 768;

// Hook simple para saber el ancho de la ventana (equivalente a useWindowDimensions de RN)
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

// ─── Tarjeta de producto ──────────────────────────────────────────────────────

function TarjetaProducto({ item, onClick, selected = false }) {
  const status = getStockStatus(item.stock, item.minimo);

  return (
    <button className={`gp-card${!item.activo ? ' inactivo' : ''}${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="gp-card-icon">{item.unidad === 'uds' ? ' ' : ' '}</div>
      <div className="gp-card-info">
        <div className="gp-card-nombre">{item.nombre}</div>
        <div className="gp-card-codigo">{item.codigo}</div>
        {item.activo ? (
          <div className={`gp-badge gp-badge-${status}`}>
            {status === 'ok' ? 'Disponible' : status === 'low' ? 'Stock bajo' : 'Sin stock'}
          </div>
        ) : (
          <div className="gp-badge gp-badge-inactive">Inactivo</div>
        )}
      </div>
      {item.ofertaActiva && (
        <div className="gp-card-right">
          <span className="gp-offer-tag">OFERTA</span>
        </div>
      )}
    </button>
  );
}

function TarjetaProductoGrid({ item, onClick, selected = false }) {
  return (
    <button className={`gp-grid-card${!item.activo ? ' inactivo' : ''}${selected ? ' selected' : ''}`} onClick={onClick}>
      <div className="gp-grid-img-wrap">
        {item.ofertaActiva && <span className="gp-offer-tag gp-offer-tag-grid">OFERTA</span>}
        {item.imagen ? (
          <img src={item.imagen} alt={item.nombre} loading="lazy" />
        ) : (
          <span className="gp-grid-img-fallback">{item.unidad === 'uds' ? ' ' : ' '}</span>
        )}
      </div>
      <span className="gp-grid-name">{item.nombre}</span>
    </button>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function GestionProductosModal({ onClose, local, localLabel, autoAbrirRegistro = false }) {
  const { colors, isDark, toggle } = useTheme();
  const { usuario } = useAuth();
  const width = useWindowWidth();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  // ── Productos EN TIEMPO REAL ─────────────────────────────────────────────
  // locales/{local}/productos vive el stock/precio/activo de este local;
  // productos (global) vive nombre/categoría/código/unidad. Se combinan acá.
  const [productosLocalRaw, setProductosLocalRaw] = useState([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [filtroProveedor, setFiltroProveedor] = useState(null);
  const [pickerVisible, setPickerVisible] = useState(false); // 'categoria' | 'proveedor' | false
  const [vista, setVista] = useState('list'); // 'list' | 'grid'

  // Modales
  const [modalDetalle, setModalDetalle] = useState(false);
  const [modalActualizar, setModalActualizar] = useState(false);
  const [modalRegistrar, setModalRegistrar] = useState(false);
  const [modalTransferir, setModalTransferir] = useState(false);

  // Producto seleccionado
  const [productoActual, setProductoActual] = useState(null);

  // Formulario actualizar stock (movimientos: reposición / transferencia / devolución)
  const [updCodigo, setUpdCodigo] = useState('');
  const [updCantidad, setUpdCantidad] = useState('');
  const [updTipoMovimiento, setUpdTipoMovimiento] = useState('');
  const [updProveedorId, setUpdProveedorId] = useState('');
  const [updFechaVencimiento, setUpdFechaVencimiento] = useState('');
  const [updValorTotal, setUpdValorTotal] = useState('');
  const [updLocalDestino, setUpdLocalDestino] = useState('');
  const [updGuardando, setUpdGuardando] = useState(false);
  const [updErrors, setUpdErrors] = useState({});

  // Proveedores asignados a ESTE local (para el select de Reposición)
  const [proveedoresLocal, setProveedoresLocal] = useState([]);

  // Formulario transferencia (desde el panel de detalle)
  const [transCantidad, setTransCantidad] = useState('');
  const [transLocal, setTransLocal] = useState('');
  const [transValorTotal, setTransValorTotal] = useState('');
  const [transGuardando, setTransGuardando] = useState(false);
  const [transErrors, setTransErrors] = useState({});

  // Formulario registrar (busca/selecciona un producto del catálogo GLOBAL
  // y solo pide los datos propios de este local: stock mínimo y precio de venta)
  const [regCodigo, setRegCodigo] = useState('');
  const [regBuscando, setRegBuscando] = useState(false);
  const [regErrorBusqueda, setRegErrorBusqueda] = useState('');
  const [regProductoGlobal, setRegProductoGlobal] = useState(null);
  const [productosGlobales, setProductosGlobales] = useState([]);
  const [regStockMinimo, setRegStockMinimo] = useState('');
  const [regPrecioVenta, setRegPrecioVenta] = useState('');
  const [regUsoReceta, setRegUsoReceta] = useState(false);
  const [regGuardando, setRegGuardando] = useState(false);
  const [regErrors, setRegErrors] = useState({});

  // Catálogo global de productos (para el desplegable de selección y el merge)
  useEffect(() => {
    const unsubscribe = suscribirProductosGlobales(setProductosGlobales);
    return () => unsubscribe?.();
  }, []);

  // Proveedores asignados a este local (para el select de Reposición)
  useEffect(() => {
    const unsubscribe = suscribirProveedoresPorLocal(local, setProveedoresLocal);
    return () => unsubscribe?.();
  }, [local]);

  // Productos de ESTE local, en tiempo real
  useEffect(() => {
    setCargandoProductos(true);
    const unsubscribe = suscribirProductosLocal(local, (lista) => {
      setProductosLocalRaw(lista);
      setCargandoProductos(false);
    });
    return () => unsubscribe?.();
  }, [local]);

  // Merge: producto "completo" = datos base globales + stock/precio/activo local
  const globalesPorId = useMemo(
    () => new Map(productosGlobales.map((p) => [p.id, p])),
    [productosGlobales]
  );

  const productos = useMemo(() => productosLocalRaw.map((lp) => {
    const global = globalesPorId.get(lp.idProducto);
    return {
      id: lp.idProducto,
      nombre: global?.nombre ?? 'Producto sin datos en catálogo global',
      codigo: global?.codigoBarra ?? '',
      categoria: global?.categoria ?? '',
      unidadMedida: global?.unidadMedida ?? 'unidad',
      proveedor: 'Sin proveedor',
      precio: lp.precioVenta,
      stock: lp.stockActual,
      minimo: lp.stockMinimo,
      unidad: unidadBaseDesdeUnidadMedida(global?.unidadMedida),
      activo: lp.activo,
      oferta: lp.oferta,
      ofertaActiva: lp.ofertaActiva,
      usoReceta: lp.usoReceta,
      ultima: lp.actualizadoEn ? new Date(lp.actualizadoEn).toLocaleDateString('es-CL') : '—',
      imagen: null,
    };
  }), [productosLocalRaw, globalesPorId]);

  // Mantiene el panel de detalle sincronizado si el producto cambia en vivo
  useEffect(() => {
    if (!productoActual) return;
    const actualizado = productos.find((p) => p.id === productoActual.id);
    if (actualizado) setProductoActual(actualizado);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos]);

  // Cerrar con tecla Escape
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Si se solicitó desde afuera, abrir directo el formulario de registrar producto
  useEffect(() => {
    if (autoAbrirRegistro) setModalRegistrar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAbrirRegistro]);

  // ── Filtrado ────────────────────────────────────────────────────────────────
  const proveedores = [...new Set(productos.map((p) => p.proveedor))];

  // Producto encontrado en modal actualizar (para condicionar campos)
  const productoUpdCodigo = productos.find((p) => p.codigo === updCodigo.trim()) || null;

  // Producto al que se le va a mover stock en el formulario abierto: el encontrado por
  // código ("Actualizar stock") o el del panel de detalle ("Transferir a otro local").
  const productoMovimiento = modalActualizar ? productoUpdCodigo : (modalTransferir ? productoActual : null);
  const idProductoMov = productoMovimiento?.id ?? null;

  // Vencimiento vigente de ese producto. Solo se consulta mientras hay un formulario abierto.
  const [ultimaRepoMov, setUltimaRepoMov] = useState(null);
  useEffect(() => {
    if (!idProductoMov) { setUltimaRepoMov(null); return undefined; }
    setUltimaRepoMov(null);
    const unsubscribe = suscribirUltimaReposicionProducto(local, idProductoMov, setUltimaRepoMov);
    return () => unsubscribe?.();
  }, [local, idProductoMov]);

  // Estado de vencimiento del producto en ESTE LOCAL (solo si venció o vence en ≤ DIAS_VENCIMIENTO_MAX días).
  //  · tipo 'vencido':   con stock no se puede reponer ni transferir (hasta darlo de baja);
  //                      vencido (con o sin stock) no se puede devolver.
  //  · tipo 'porVencer': con stock no se puede reponer (hay que terminar el stock actual).
  // `conStock` dice si le queda stock. (El controlador también lo valida; esto solo adelanta
  // el aviso. Que el DESTINO de una transferencia tenga stock vencido solo lo detecta el
  // controlador, y el mensaje sale bajo "Local destino".)
  const bloqueoVencido = useMemo(() => {
    if (!productoMovimiento) return null;
    const dias = diasHastaVencimiento(ultimaRepoMov?.vencimiento);
    if (dias === null || dias > DIAS_VENCIMIENTO_MAX) return null;
    return {
      tipo: dias < 0 ? 'vencido' : 'porVencer',
      dias,
      diasVencido: dias < 0 ? -dias : 0,
      fecha: formatFechaVencimiento(ultimaRepoMov.vencimiento),
      conStock: Number(productoMovimiento.stock) > 0,
    };
  }, [productoMovimiento, ultimaRepoMov]);

  const productosFiltrados = productos.filter((p) => {
    const matchBusqueda =
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo.includes(busqueda);
    const matchCategoria = !filtroCategoria || p.categoria === filtroCategoria;
    const matchProveedor = !filtroProveedor || p.proveedor === filtroProveedor;
    return matchBusqueda && matchCategoria && matchProveedor;
  });

  // ── Acciones ────────────────────────────────────────────────────────────────
  function abrirDetalle(producto) {
    setProductoActual(producto);
    setModalDetalle(true);
  }

  // Actualiza solo stock mínimo y/o precio de venta de ESTE local (se llama desde
  // el panel de detalle tras confirmar el resumen de cambios). Lanza Error con un
  // mensaje legible para que el panel lo muestre dentro del mensaje de confirmación.
  async function actualizarMinimoPrecio({ minimo, precio, oferta }) {
    let stockMinimo = productoActual.minimo;
    let precioVenta = productoActual.precio;
    let precioOferta = productoActual.oferta ?? 0;

    if (minimo !== undefined) {
      const minimoIngresado = Number(minimo);
      if (isNaN(minimoIngresado) || minimoIngresado < 0) {
        throw new Error('Revisa el stock mínimo');
      }
      // El usuario lo ingresa en kg/L (unidad de compra): se convierte a g/ml
      stockMinimo = convertirACantidadBase(minimoIngresado, productoActual.unidad);
    }
    if (precio !== undefined) {
      const precioNum = parseInt(precio);
      if (isNaN(precioNum) || precioNum <= 0) {
        throw new Error('Revisa el precio de venta');
      }
      precioVenta = precioNum;
    }
    if (oferta !== undefined) {
      const ofertaNum = Math.round(Number(oferta));
      if (isNaN(ofertaNum) || ofertaNum < 0) {
        throw new Error('Revisa el precio de oferta');
      }
      precioOferta = ofertaNum;
    }

    try {
      await actualizarProductoLocal(local, productoActual.id, { stockMinimo, precioVenta, oferta: precioOferta }, { usuario });
    } catch (err) {
      const primerError = err?.errores ? Object.values(err.errores)[0] : null;
      throw new Error(primerError ?? 'No se pudo actualizar el producto. Intenta nuevamente.');
    }
  }

  // Simula escaneo de pistola (en producción: usar la API real del lector/cámara)
  function simularEscaneo(contexto) {
    if (contexto === 'actualizar') {
      setUpdCodigo('7891234560012');
      window.alert('Escaneado — Código: 7891234560012 — Arroz Premium 1kg');
    } else {
      const codigoSimulado = '7891234560012';
      setRegCodigo(codigoSimulado);
      buscarProductoGlobalPorCodigo(codigoSimulado);
    }
  }

  function resetRegistrar() {
    setRegCodigo('');
    setRegErrorBusqueda('');
    setRegProductoGlobal(null);
    setRegStockMinimo('');
    setRegPrecioVenta('');
    setRegUsoReceta(false);
    setRegErrors({});
  }

  function resetActualizar() {
    setUpdCodigo('');
    setUpdCantidad('');
    setUpdTipoMovimiento('');
    setUpdProveedorId('');
    setUpdFechaVencimiento('');
    setUpdValorTotal('');
    setUpdLocalDestino('');
    setUpdErrors({});
  }

  function resetTransferencia() {
    setTransCantidad('');
    setTransLocal('');
    setTransValorTotal('');
    setTransErrors({});
  }

  // Busca el código en el catálogo GLOBAL y verifica que no esté ya
  // registrado en este local antes de dejar completar el formulario.
  async function buscarProductoGlobalPorCodigo(codigoParam) {
    const codigo = (codigoParam ?? regCodigo).trim();
    if (!codigo) {
      setRegErrorBusqueda('Ingresa o escanea un código de barras');
      return;
    }
    setRegErrorBusqueda('');
    setRegProductoGlobal(null);
    setRegBuscando(true);
    try {
      const encontrado = await obtenerProductoPorCodigoBarra(codigo);
      if (!encontrado) {
        setRegErrorBusqueda('No existe un producto con ese código en el catálogo global. Regístralo primero en "Productos".');
        return;
      }
      const yaEnLocal = await obtenerProductoLocal(local, encontrado.id);
      if (yaEnLocal) {
        setRegErrorBusqueda(`"${encontrado.nombre}" ya está registrado en este local`);
        return;
      }
      setRegCodigo(encontrado.codigoBarra);
      setRegProductoGlobal(encontrado);
    } catch (err) {
      setRegErrorBusqueda('No se pudo verificar el código. Intenta nuevamente.');
    } finally {
      setRegBuscando(false);
    }
  }

  // Selección directa desde el desplegable del catálogo global
  async function seleccionarProductoGlobal(producto) {
    setRegErrorBusqueda('');
    setRegBuscando(true);
    try {
      const yaEnLocal = await obtenerProductoLocal(local, producto.id);
      if (yaEnLocal) {
        setRegErrorBusqueda(`"${producto.nombre}" ya está registrado en este local`);
        setRegProductoGlobal(null);
        return;
      }
      setRegCodigo(producto.codigoBarra);
      setRegProductoGlobal(producto);
    } catch (err) {
      setRegErrorBusqueda('No se pudo verificar el producto. Intenta nuevamente.');
    } finally {
      setRegBuscando(false);
    }
  }

  // Guarda el producto DENTRO de este local: stockActual parte en 0,
  // stockMinimo y precioVenta vienen del formulario. No hace falta tocar el
  // estado local a mano: la suscripción en tiempo real lo refleja solita.
  async function guardarProducto() {
    if (!regProductoGlobal) return;
    setRegErrors({});
    setRegGuardando(true);
    try {
      const unidadBase = unidadBaseDesdeUnidadMedida(regProductoGlobal.unidadMedida);
      await crearProductoEnLocal(local, regProductoGlobal.id, {
        stockMinimo: convertirACantidadBase(regStockMinimo, unidadBase),
        precioVenta: regPrecioVenta,
        usoReceta: regUsoReceta,
      });
      const nombreCreado = regProductoGlobal.nombre;
      resetRegistrar();
      setModalRegistrar(false);
      window.alert(`"${nombreCreado}" registrado en ${localLabel || 'este local'}`);
    } catch (err) {
      setRegErrors(err?.errores ?? { general: 'No se pudo guardar el producto. Intenta nuevamente.' });
    } finally {
      setRegGuardando(false);
    }
  }

  // La validación "real" (obligatoriedad de proveedor/fecha/local destino,
  // cálculo de stockNuevo, stock suficiente para transferir, etc.) vive en
  // registrarMovimientoStock (controller). Acá solo se resuelven los dos
  // datos que la vista es la única que puede resolver: el código de barras
  // escaneado/ingresado → idProducto, y el disparo de la llamada.
  async function confirmarActualizacion() {
    if (!updCodigo.trim()) {
      window.alert('Ingresa o escanea un código de barras');
      return;
    }
    if (!productoUpdCodigo) {
      window.alert('No se encontró un producto con ese código en este local');
      return;
    }
    setUpdErrors({});
    setUpdGuardando(true);
    try {
      const unidadBase = productoUpdCodigo.unidad;
      const esCostoRelevante = updTipoMovimiento === 'reposicion' || updTipoMovimiento === 'transferencia';
      // El usuario ingresa el costo TOTAL de la compra; el costo por kg/L/unidad
      // sale de dividirlo por la cantidad ingresada (misma unidad de compra).
      const cantidadIngresada = Number(updCantidad) || 0;
      const valorUnitarioIngreso = cantidadIngresada > 0 ? Number(updValorTotal) / cantidadIngresada : 0;

      await registrarMovimientoStock({
        local,
        idProducto: productoUpdCodigo.id,
        tipoMovimiento: updTipoMovimiento,
        cantidad: convertirACantidadBase(updCantidad, unidadBase),
        proveedorId: updTipoMovimiento === 'reposicion' ? updProveedorId : undefined,
        fechaVencimiento: updTipoMovimiento === 'reposicion' ? updFechaVencimiento : undefined,
        localDestino: updTipoMovimiento === 'transferencia' ? updLocalDestino : undefined,
        valorUnitario: esCostoRelevante ? convertirValorUnitarioABase(valorUnitarioIngreso, unidadBase) : undefined,
        usuario,
      });
      resetActualizar();
      setModalActualizar(false);
      window.alert('Movimiento de stock registrado correctamente');
    } catch (err) {
      setUpdErrors(err?.errores ?? { general: 'No se pudo registrar el movimiento. Intenta nuevamente.' });
    } finally {
      setUpdGuardando(false);
    }
  }

  async function toggleActivo() {
    if (!productoActual) return;
    const nuevoActivo = !productoActual.activo;
    try {
      await cambiarEstadoProductoLocal(local, productoActual.id, nuevoActivo);
      setProductoActual((prev) => (prev ? { ...prev, activo: nuevoActivo } : prev));
    } catch (err) {
      window.alert('No se pudo actualizar el estado. Intenta nuevamente.');
    }
  }

  async function toggleOferta() {
    if (!productoActual) return;
    const nuevaOfertaActiva = !productoActual.ofertaActiva;
    try {
      await cambiarOfertaActivaProductoLocal(local, productoActual.id, nuevaOfertaActiva);
      setProductoActual((prev) => (prev ? { ...prev, ofertaActiva: nuevaOfertaActiva } : prev));
    } catch (err) {
      window.alert(err?.errores?.general ?? 'No se pudo actualizar la oferta. Intenta nuevamente.');
    }
  }

  // Este botón (desde el panel de detalle) usa la MISMA transferirProductoEntreLocales
  // que "Actualizar Stock → Transferencia", así que también queda registrado
  // en historialStock — por eso ahora también pide el costo total de lo transferido.
  async function confirmarTransferencia() {
    const errores = {};
    const cant = Number(transCantidad);
    if (!transCantidad.trim() || isNaN(cant) || cant <= 0) {
      errores.cantidad = 'Ingresa una cantidad válida (mayor que 0)';
    }
    if (!transLocal.trim()) {
      errores.localDestino = 'Selecciona un local de destino';
    }
    const valorTotalNum = Number(transValorTotal);
    if (!transValorTotal.trim() || isNaN(valorTotalNum) || valorTotalNum <= 0) {
      errores.valorUnitario = 'Ingresa el costo total de lo transferido';
    }
    if (Object.keys(errores).length > 0) {
      setTransErrors(errores);
      return;
    }

    setTransErrors({});
    setTransGuardando(true);
    try {
      const unidadBase = productoActual.unidad;
      // El usuario ingresa el costo TOTAL de lo transferido; el costo por
      // kg/L/unidad sale de dividirlo por la cantidad ingresada.
      const valorUnitarioIngreso = cant > 0 ? valorTotalNum / cant : 0;

      await transferirProductoEntreLocales(productoActual.id, local, transLocal, convertirACantidadBase(cant, unidadBase), {
        usuario,
        valorUnitario: convertirValorUnitarioABase(valorUnitarioIngreso, unidadBase),
      });
      const destinoLabel = LOCAL_LABELS?.[transLocal] ?? transLocal;
      resetTransferencia();
      setModalTransferir(false);
      window.alert(`Transferencia realizada — ${formatStock(convertirACantidadBase(cant, unidadBase), unidadBase)} enviados a "${destinoLabel}"`);
    } catch (err) {
      setTransErrors(err?.errores ?? { general: 'No se pudo realizar la transferencia. Intenta nuevamente.' });
    } finally {
      setTransGuardando(false);
    }
  }

  // ── Variables CSS de tema ────────────────────────────────────────────────────
  const themeVars = {
    '--gp-bg': colors.bg,
    '--gp-surface': colors.surface,
    '--gp-surface2': colors.surface2,
    '--gp-border': colors.border,
    '--gp-text-primary': colors.textPrimary,
    '--gp-text-secondary': colors.textSecondary,
    '--gp-placeholder': colors.placeholder,
    '--gp-btn-bg': colors.btnBg,
    '--gp-btn-text': colors.btnText,
    '--gp-accent-text': colors.accentText,
  };

  return (
    <div className="gp-overlay" style={themeVars}>

      {/* Header */}
      <div className="gp-topbar">
        <div className="gp-topbar-row">
          <div>
            <p className="gp-topbar-title">Gestión de productos</p>
            <p className="gp-topbar-sub">
              {cargandoProductos
                ? 'Cargando productos...'
                : `${productosFiltrados.length} productos${localLabel ? ` · ${localLabel}` : ''}`}
            </p>
          </div>
          <div className="gp-topbar-actions">
            <button className="gp-close-btn" onClick={onClose} aria-label="Cerrar">✕</button>
          </div>
        </div>
      </div>

      {/* Buscador */}
      <div className="gp-search-wrap">
        <div className="gp-search-row">
          <input
            className="gp-search-input"
            placeholder="Buscar por nombre o código..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
          {busqueda.length > 0 && (
            <button className="gp-search-clear-btn" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">✕</button>
          )}
          <button className="gp-search-scan-btn" onClick={() => setBusqueda('7891234560012')} aria-label="Simular escaneo">▦</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="gp-filter-wrap">
        <button
          className={`gp-filter-dropdown${filtroCategoria ? ' active' : ''}`}
          onClick={() => setPickerVisible('categoria')}
        >
          <span className={`gp-filter-dropdown-text${filtroCategoria ? ' active' : ''}`}>
            {filtroCategoria ?? 'Categoría'}
          </span>
          <span className={`gp-filter-dropdown-arrow${filtroCategoria ? ' active' : ''}`}>▾</span>
        </button>

        <button
          className={`gp-filter-dropdown${filtroProveedor ? ' active' : ''}`}
          onClick={() => setPickerVisible('proveedor')}
        >
          <span className={`gp-filter-dropdown-text${filtroProveedor ? ' active' : ''}`}>
            {filtroProveedor ?? 'Proveedor'}
          </span>
          <span className={`gp-filter-dropdown-arrow${filtroProveedor ? ' active' : ''}`}>▾</span>
        </button>

        {(filtroCategoria || filtroProveedor) && (
          <button className="gp-filter-clear" onClick={() => { setFiltroCategoria(null); setFiltroProveedor(null); }} aria-label="Limpiar filtros">
            ✕
          </button>
        )}

        <div className="gp-view-toggle">
          <button
            className={`gp-view-toggle-btn${vista === 'list' ? ' active' : ''}`}
            onClick={() => setVista('list')}
            aria-label="Ver en lista"
            title="Ver en lista"
          >
            ☰
          </button>
          <button
            className={`gp-view-toggle-btn${vista === 'grid' ? ' active' : ''}`}
            onClick={() => setVista('grid')}
            aria-label="Ver en cuadrícula"
            title="Ver en cuadrícula"
          >
            ▦
          </button>
        </div>
      </div>

      {/* Picker de filtros */}
      <FiltroPickerModal
        isDesktop={isDesktop}
        tipo={pickerVisible}
        valorActual={pickerVisible === 'categoria' ? filtroCategoria : filtroProveedor}
        opciones={pickerVisible === 'categoria' ? CATEGORIAS : proveedores}
        onSelect={(opcion) => {
          if (pickerVisible === 'categoria') setFiltroCategoria(opcion);
          else setFiltroProveedor(opcion);
          setPickerVisible(false);
        }}
        onClose={() => setPickerVisible(false)}
      />

      {/* ── Layout desktop: master-detail en fila ────────────────────────────── */}
      {isDesktop ? (
        <div className="gp-master-detail">

          {/* Panel izquierdo: lista */}
          <div className={`gp-master-panel${productoActual ? ' has-selection' : ''}`}>
            {vista === 'grid' ? (
              <div className="gp-grid">
                {productosFiltrados.map((item) => (
                  <TarjetaProductoGrid key={item.id} item={item} selected={productoActual?.id === item.id} onClick={() => abrirDetalle(item)} />
                ))}
              </div>
            ) : (
              <div className="gp-list">
                {productosFiltrados.map((item) => (
                  <TarjetaProducto key={item.id} item={item} selected={productoActual?.id === item.id} onClick={() => abrirDetalle(item)} />
                ))}
              </div>
            )}
            <div className="gp-fab-row">
              <button className="gp-fab gp-fab-update" onClick={() => setModalActualizar(true)}>↑  Actualizar stock</button>
              <button className="gp-fab gp-fab-register" onClick={() => setModalRegistrar(true)}>+  Registrar producto</button>
            </div>
          </div>

          {/* Panel derecho: detalle */}
          <div className={`gp-detail-panel${productoActual ? ' has-selection' : ''}`}>
            {productoActual ? (
              <>
                <div className="gp-sheet-header">
                  <span className="gp-sheet-title">{productoActual.nombre}</span>
                </div>
                <DetalleContenido
                  producto={productoActual}
                  onActualizar={actualizarMinimoPrecio}
                  onTransferir={() => setModalTransferir(true)}
                  onToggleActivo={toggleActivo}
                  onToggleOferta={toggleOferta}
                  local={local}
                />
              </>
            ) : (
              <div className="gp-detail-empty">
                <div className="gp-detail-empty-text">Selecciona un producto para ver su detalle</div>
              </div>
            )}
          </div>

        </div>
      ) : (
        /* ── Layout móvil: lista + FABs ──────────────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {vista === 'grid' ? (
            <div className="gp-grid">
              {productosFiltrados.map((item) => (
                <TarjetaProductoGrid key={item.id} item={item} onClick={() => abrirDetalle(item)} />
              ))}
            </div>
          ) : (
            <div className="gp-list">
              {productosFiltrados.map((item) => (
                <TarjetaProducto key={item.id} item={item} onClick={() => abrirDetalle(item)} />
              ))}
            </div>
          )}
          <div className="gp-fab-row">
            <button className="gp-fab gp-fab-update" onClick={() => setModalActualizar(true)}>↑  Actualizar stock</button>
            <button className="gp-fab gp-fab-register" onClick={() => setModalRegistrar(true)}>+  Registrar producto</button>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle (solo móvil) ───────────────────────────────────────── */}
      <DetalleModal
        isDesktop={isDesktop}
        visible={modalDetalle}
        producto={productoActual}
        onClose={() => setModalDetalle(false)}
        onActualizar={actualizarMinimoPrecio}
        onTransferir={() => setModalTransferir(true)}
        onToggleActivo={toggleActivo}
        onToggleOferta={toggleOferta}
        local={local}
      />

      {/* ── Modal: Actualizar stock ────────────────────────────────────────── */}
      <ActualizarStockModal
        isDesktop={isDesktop}
        visible={modalActualizar}
        onClose={() => { setModalActualizar(false); resetActualizar(); }}
        onConfirmar={confirmarActualizacion}
        onEscanear={() => simularEscaneo('actualizar')}
        codigo={updCodigo} setCodigo={setUpdCodigo}
        cantidad={updCantidad} setCantidad={setUpdCantidad}
        tipoMovimiento={updTipoMovimiento} setTipoMovimiento={setUpdTipoMovimiento}
        productoEncontrado={productoUpdCodigo}
        bloqueoVencido={bloqueoVencido}
        proveedores={proveedoresLocal}
        proveedorId={updProveedorId} setProveedorId={setUpdProveedorId}
        fechaVencimiento={updFechaVencimiento} setFechaVencimiento={setUpdFechaVencimiento}
        valorTotal={updValorTotal} setValorTotal={setUpdValorTotal}
        localesDestino={(LOCALES_LIST ?? []).filter((l) => l !== local)}
        localLabels={LOCAL_LABELS ?? {}}
        localDestino={updLocalDestino} setLocalDestino={setUpdLocalDestino}
        guardando={updGuardando}
        errors={updErrors}
      />

      {/* ── Modal: Registrar producto ──────────────────────────────────────── */}
      <RegistrarModal
        isDesktop={isDesktop}
        visible={modalRegistrar}
        onClose={() => { setModalRegistrar(false); resetRegistrar(); }}
        onGuardar={guardarProducto}
        onEscanear={() => simularEscaneo('registrar')}
        codigo={regCodigo} setCodigo={setRegCodigo}
        onBuscarCodigo={() => buscarProductoGlobalPorCodigo()}
        buscando={regBuscando}
        errorBusqueda={regErrorBusqueda}
        productoGlobal={regProductoGlobal}
        productosGlobales={productosGlobales}
        onSeleccionarGlobal={seleccionarProductoGlobal}
        stockMinimo={regStockMinimo} setStockMinimo={setRegStockMinimo}
        precioVenta={regPrecioVenta} setPrecioVenta={setRegPrecioVenta}
        usoReceta={regUsoReceta} setUsoReceta={setRegUsoReceta}
        guardando={regGuardando}
        errors={regErrors}
      />

      {/* ── Modal: Transferir a otro local ──────────────────────────────────── */}
      <TransferirModal
        isDesktop={isDesktop}
        visible={modalTransferir}
        onClose={() => { setModalTransferir(false); resetTransferencia(); }}
        onConfirmar={confirmarTransferencia}
        producto={productoActual}
        cantidad={transCantidad} setCantidad={setTransCantidad}
        local={transLocal} setLocal={setTransLocal}
        valorTotal={transValorTotal} setValorTotal={setTransValorTotal}
        localesDestino={(LOCALES_LIST ?? []).filter((l) => l !== local)}
        localLabels={LOCAL_LABELS ?? {}}
        bloqueoVencido={bloqueoVencido?.tipo === 'vencido' && bloqueoVencido.conStock ? bloqueoVencido : null}
        guardando={transGuardando}
        errors={transErrors}
      />

    </div>
  );
}