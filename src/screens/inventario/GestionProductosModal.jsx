import { useState, useEffect, useMemo } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../controllers/AuthContext';
import {
  CATEGORIAS,
  getStockStatus, formatStock,
} from './gestionProductosData';
import {
  FiltroPickerModal, DetalleContenido, DetalleModal,
  EditarModal, ActualizarStockModal, RegistrarModal, TransferirModal,
} from './GestionProductosForms';
import {
  obtenerProductoPorCodigoBarra, suscribirProductosGlobales, actualizarProductoGlobal,
} from '../../controllers/ProductoControl';
import {
  crearProductoEnLocal, obtenerProductoLocal, suscribirProductosLocal,
  actualizarProductoLocal, cambiarEstadoProductoLocal,
  transferirProductoEntreLocales, registrarMovimientoStock,
} from '../../controllers/LocalProductoControl';
import { suscribirProveedoresPorLocal } from '../../controllers/ProveedorControl';
import { suscribirHistorialProductoLocal } from '../../controllers/HistorialStockControl';
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

function TarjetaProducto({ item, onClick }) {
  const status = getStockStatus(item.stock, item.minimo);
  const stockNum = item.unidad === 'g'
    ? (item.stock >= 1000 ? (item.stock / 1000).toFixed(1) : item.stock)
    : item.stock;
  const stockLbl = item.unidad === 'g' ? (item.stock >= 1000 ? 'kg' : 'g') : 'uds.';

  return (
    <button className={`gp-card${!item.activo ? ' inactivo' : ''}`} onClick={onClick}>
      <div className="gp-card-icon">{item.unidad === 'g' ? ' ' : ' '}</div>
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
      <div className="gp-card-right">
        <div className="gp-stock-num">{stockNum}</div>
        <div className="gp-stock-lbl">{stockLbl}</div>
      </div>
    </button>
  );
}

function TarjetaProductoGrid({ item, onClick }) {
  return (
    <button className={`gp-grid-card${!item.activo ? ' inactivo' : ''}`} onClick={onClick}>
      <div className="gp-grid-img-wrap">
        {item.imagen ? (
          <img src={item.imagen} alt={item.nombre} loading="lazy" />
        ) : (
          <span className="gp-grid-img-fallback">{item.unidad === 'g' ? ' ' : ' '}</span>
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
  const [modalEditar, setModalEditar] = useState(false);
  const [modalActualizar, setModalActualizar] = useState(false);
  const [modalRegistrar, setModalRegistrar] = useState(false);
  const [modalTransferir, setModalTransferir] = useState(false);

  // Producto seleccionado
  const [productoActual, setProductoActual] = useState(null);

  // Formulario editar
  const [editNombre, setEditNombre] = useState('');
  const [editPrecio, setEditPrecio] = useState('');
  const [editMinimo, setEditMinimo] = useState('');

  // Formulario actualizar stock (movimientos: reposición / transferencia / devolución)
  const [updCodigo, setUpdCodigo] = useState('');
  const [updCantidad, setUpdCantidad] = useState('');
  const [updTipoMovimiento, setUpdTipoMovimiento] = useState('');
  const [updProveedorId, setUpdProveedorId] = useState('');
  const [updFechaVencimiento, setUpdFechaVencimiento] = useState('');
  const [updValorUnitario, setUpdValorUnitario] = useState('');
  const [updLocalDestino, setUpdLocalDestino] = useState('');
  const [updGuardando, setUpdGuardando] = useState(false);
  const [updErrors, setUpdErrors] = useState({});

  // Proveedores asignados a ESTE local (para el select de Reposición)
  const [proveedoresLocal, setProveedoresLocal] = useState([]);

  // Formulario transferencia (desde el panel de detalle)
  const [transCantidad, setTransCantidad] = useState('');
  const [transLocal, setTransLocal] = useState('');
  const [transValorUnitario, setTransValorUnitario] = useState('');
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
      unidad: global?.unidadMedida === 'kilogramos' ? 'g' : 'uds',
      activo: lp.activo,
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

  // Historial de movimientos del producto seleccionado, en tiempo real
  const [historialProducto, setHistorialProducto] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    if (!productoActual?.id) {
      setHistorialProducto([]);
      return;
    }
    setCargandoHistorial(true);
    const unsubscribe = suscribirHistorialProductoLocal(local, productoActual.id, (movimientos) => {
      setHistorialProducto(movimientos);
      setCargandoHistorial(false);
    });
    return () => unsubscribe?.();
  }, [local, productoActual?.id]);

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

  function abrirEditar() {
    setEditNombre(productoActual.nombre);
    setEditPrecio(String(productoActual.precio));
    setEditMinimo(String(productoActual.minimo));
    setModalEditar(true);
  }

  async function guardarEdicion() {
    if (!editNombre.trim()) {
      window.alert('El nombre no puede estar vacío');
      return;
    }
    const minimoNum = parseInt(editMinimo);
    const precioNum = parseInt(editPrecio);
    if (isNaN(minimoNum) || minimoNum < 0 || isNaN(precioNum) || precioNum <= 0) {
      window.alert('Revisa el stock mínimo y el precio de venta');
      return;
    }
    try {
      // Nombre vive en el catálogo GLOBAL (se reenvían categoría/código/unidad
      // tal cual estaban, porque validarProducto exige los 4 campos juntos)
      await actualizarProductoGlobal(productoActual.id, {
        nombre: editNombre.trim(),
        categoria: productoActual.categoria,
        codigoBarra: productoActual.codigo,
        unidadMedida: productoActual.unidadMedida,
      });
      // Stock mínimo y precio de venta viven en ESTE local
      await actualizarProductoLocal(local, productoActual.id, {
        stockMinimo: minimoNum,
        precioVenta: precioNum,
      });
      setModalEditar(false);
      window.alert('Producto actualizado correctamente');
    } catch (err) {
      const primerError = err?.errores ? Object.values(err.errores)[0] : null;
      window.alert(primerError ?? 'No se pudo actualizar el producto. Intenta nuevamente.');
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
    setRegErrors({});
  }

  function resetActualizar() {
    setUpdCodigo('');
    setUpdCantidad('');
    setUpdTipoMovimiento('');
    setUpdProveedorId('');
    setUpdFechaVencimiento('');
    setUpdValorUnitario('');
    setUpdLocalDestino('');
    setUpdErrors({});
  }

  function resetTransferencia() {
    setTransCantidad('');
    setTransLocal('');
    setTransValorUnitario('');
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
      await crearProductoEnLocal(local, regProductoGlobal.id, {
        stockMinimo: regStockMinimo,
        precioVenta: regPrecioVenta,
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
      await registrarMovimientoStock({
        local,
        idProducto: productoUpdCodigo.id,
        tipoMovimiento: updTipoMovimiento,
        cantidad: updCantidad,
        proveedorId: updTipoMovimiento === 'reposicion' ? updProveedorId : undefined,
        fechaVencimiento: updTipoMovimiento === 'reposicion' ? updFechaVencimiento : undefined,
        localDestino: updTipoMovimiento === 'transferencia' ? updLocalDestino : undefined,
        valorUnitario: (updTipoMovimiento === 'reposicion' || updTipoMovimiento === 'transferencia') ? updValorUnitario : undefined,
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

  // Este botón (desde el panel de detalle) usa la MISMA transferirProductoEntreLocales
  // que "Actualizar Stock → Transferencia", así que también queda registrado
  // en historialStock — por eso ahora también pide costo unitario.
  async function confirmarTransferencia() {
    const errores = {};
    const cant = parseInt(transCantidad);
    if (!transCantidad.trim() || isNaN(cant) || cant <= 0) {
      errores.cantidad = 'Ingresa una cantidad válida (mayor que 0)';
    }
    if (!transLocal.trim()) {
      errores.localDestino = 'Selecciona un local de destino';
    }
    const valor = Number(transValorUnitario);
    if (!transValorUnitario.trim() || isNaN(valor) || valor <= 0) {
      errores.valorUnitario = 'Ingresa el costo unitario';
    }
    if (Object.keys(errores).length > 0) {
      setTransErrors(errores);
      return;
    }

    setTransErrors({});
    setTransGuardando(true);
    try {
      await transferirProductoEntreLocales(productoActual.id, local, transLocal, cant, {
        usuario,
        valorUnitario: transValorUnitario,
      });
      const destinoLabel = LOCAL_LABELS?.[transLocal] ?? transLocal;
      resetTransferencia();
      setModalTransferir(false);
      window.alert(`Transferencia realizada — ${cant} ${productoActual.unidad === 'g' ? 'g' : 'uds.'} enviados a "${destinoLabel}"`);
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
          <div className="gp-master-panel">
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

          {/* Panel derecho: detalle */}
          <div className="gp-detail-panel">
            {productoActual ? (
              <>
                <div className="gp-sheet-header">
                  <span className="gp-sheet-title">{productoActual.nombre}</span>
                </div>
                <DetalleContenido
                  producto={productoActual}
                  onEditar={abrirEditar}
                  onTransferir={() => setModalTransferir(true)}
                  onToggleActivo={toggleActivo}
                  historial={historialProducto}
                  cargandoHistorial={cargandoHistorial}
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
        onEditar={abrirEditar}
        onTransferir={() => setModalTransferir(true)}
        onToggleActivo={toggleActivo}
        historial={historialProducto}
        cargandoHistorial={cargandoHistorial}
      />

      {/* ── Modal: Editar ──────────────────────────────────────────────────── */}
      <EditarModal
        isDesktop={isDesktop}
        visible={modalEditar}
        onClose={() => setModalEditar(false)}
        onGuardar={guardarEdicion}
        nombre={editNombre} setNombre={setEditNombre}
        precio={editPrecio} setPrecio={setEditPrecio}
        minimo={editMinimo} setMinimo={setEditMinimo}
        unidad={productoActual?.unidad}
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
        proveedores={proveedoresLocal}
        proveedorId={updProveedorId} setProveedorId={setUpdProveedorId}
        fechaVencimiento={updFechaVencimiento} setFechaVencimiento={setUpdFechaVencimiento}
        valorUnitario={updValorUnitario} setValorUnitario={setUpdValorUnitario}
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
        valorUnitario={transValorUnitario} setValorUnitario={setTransValorUnitario}
        localesDestino={(LOCALES_LIST ?? []).filter((l) => l !== local)}
        localLabels={LOCAL_LABELS ?? {}}
        guardando={transGuardando}
        errors={transErrors}
      />

    </div>
  );
}