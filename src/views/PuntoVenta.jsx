import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../controllers/AuthContext';
import { suscribirProductosVenta, registrarVentaConStock, registrarAutoconsumoConStock } from '../controllers/VentaControl,jsx';
import { crearProductoGlobal, obtenerProductoPorCodigoBarra } from '../controllers/ProductoControl';
import { ajustarStockLocal, actualizarProductoLocal, cambiarEstadoProductoLocal, crearProductoEnLocal, obtenerProductoLocal } from '../controllers/LocalProductoControl';
import BarcodeScanner from '../components/BarcodeScanner';
import { CATEGORIAS, UNIDADES_MEDIDA, convertirACantidadBase, unidadBaseDesdeUnidadMedida } from '../screens/inventario/gestionProductosData';
import '../styles/views/pointOfSale.css';

const metodosBase = ['Débito', 'Efectivo', 'Transferencia'];

const formatearFechaHora = (fecha) => {
  return fecha.toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

function PuntoVenta({ localId, localNombre, usuario, notify, metodosPago = metodosBase }) {
  const [productos, setProductos] = useState([]);
  const [guardandoVenta, setGuardandoVenta] = useState(false);
  const [carrito, setCarrito] = useState([]);
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [cajaActual, setCajaActual] = useState(null);
  const [metodoPago, setMetodoPago] = useState(metodosPago[0] || '');
  const [montoEfectivo, setMontoEfectivo] = useState('');
  const [efectivoInicial, setEfectivoInicial] = useState('');
  const [cajaSincronizada, setCajaSincronizada] = useState(false);
  const [mostrarAlertaInicio, setMostrarAlertaInicio] = useState(false);
  const [alertaInicialMostrada, setAlertaInicialMostrada] = useState(false);
  const [mostrarAutoconsumo, setMostrarAutoconsumo] = useState(false);
  const [mostrarFirma, setMostrarFirma] = useState(false);
  const [codigoNuevoPendiente, setCodigoNuevoPendiente] = useState('');
  const [destinoProductoNuevo, setDestinoProductoNuevo] = useState('venta');
  const [mostrarFormularioProductoNuevo, setMostrarFormularioProductoNuevo] = useState(false);
  const [guardandoProductoNuevo, setGuardandoProductoNuevo] = useState(false);
  const [formProductoNuevo, setFormProductoNuevo] = useState({
    nombre: '', categoria: '', unidadMedida: 'unidad', precioVenta: '', stockInicial: '1',
  });
  const [autoconsumo, setAutoconsumo] = useState([]);
  const [seccionProductoActiva, setSeccionProductoActiva] = useState('Productos');
  const [aceptaFirma, setAceptaFirma] = useState(false);
  const [firmaDibujada, setFirmaDibujada] = useState(false);
  const firmaCanvasRef = useRef(null);
  const dibujandoFirmaRef = useRef(false);
  const { usuario: trabajador } = useAuth();
  const [ahora, setAhora] = useState(new Date());
  const sesion = JSON.parse(localStorage.getItem("sesion")) || {};
  const nombre = sesion.nombre || "";
  const apellido = sesion.apellido || "";


  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(reloj);
  }, []);

  // Productos activos del local (nombre desde el nodo global, precio y stock
  // desde locales/{local}/productos). Se actualiza en vivo.
  useEffect(() => {
    setProductos([]);
    const desuscribir = suscribirProductosVenta(localId, setProductos);
    return desuscribir;
  }, [localId]);

  useEffect(() => {
    const sincronizarCaja = async () => {
      const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
      const cajaEncontrada = cajas.find((caja) => caja.local === localId && caja.usuario === usuario && caja.estado !== 'cerrada');

      if (cajaEncontrada?.id) {
        try {
          const cajaRemota = await getDoc(doc(db, 'cajas', cajaEncontrada.id));
          if (cajaRemota.exists() && cajaRemota.data().estado === 'cerrada') {
            const cajasActualizadas = cajas.filter((caja) => caja.id !== cajaEncontrada.id);
            guardarCajas(cajasActualizadas);
            setCajaActual(null);
            setCajaAbierta(false);
            setCajaSincronizada(true);
            return;
          }
        } catch (error) {
          console.error('No se pudo sincronizar caja con Firebase:', error);
        }
      }

      if (!cajaEncontrada) {
        try {
          const consulta = query(
            collection(db, 'cajas'),
            where('local', '==', localId),
            where('usuario', '==', usuario),
            where('estado', '==', 'abierta'),
            limit(1),
          );
          const resultado = await getDocs(consulta);

          if (!resultado.empty) {
            const cajaRemota = { id: resultado.docs[0].id, ...resultado.docs[0].data() };
            guardarCajas([...cajas.filter((caja) => caja.id !== cajaRemota.id), cajaRemota]);
            setCajaActual(cajaRemota);
            setCajaAbierta(true);
            setCajaSincronizada(true);
            return;
          }
        } catch (error) {
          console.error('No se pudieron cargar cajas abiertas desde Firebase:', error);
        }
      }

      setCajaActual(cajaEncontrada || null);
      setCajaAbierta(Boolean(cajaEncontrada));
      setCajaSincronizada(true);
    };

    sincronizarCaja();
    const intervalo = setInterval(sincronizarCaja, 2500);
    window.addEventListener('cajas-actualizadas', sincronizarCaja);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('cajas-actualizadas', sincronizarCaja);
    };
  }, [localId, usuario]);

  useEffect(() => {
    if (cajaSincronizada && !cajaAbierta && !alertaInicialMostrada) {
      setMostrarAlertaInicio(true);
      setAlertaInicialMostrada(true);
    }
  }, [cajaAbierta, cajaSincronizada, alertaInicialMostrada]);

  const esComidaRapida = localId === 'comidaRapida';
  const total = carrito.reduce((suma, producto) => suma + producto.precio * (producto.cantidad || 1), 0);
  const montoPagado = Number(montoEfectivo);
  const vuelto = metodoPago === 'Efectivo' && montoPagado >= total ? montoPagado - total : 0;

  const guardarCajas = (cajas) => {
    localStorage.setItem('cajas', JSON.stringify(cajas));
    window.dispatchEvent(new Event('cajas-actualizadas'));
  };

  const abrirCaja = async () => {
    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    const existeCaja = cajas.find((caja) => caja.local === localId && caja.usuario === usuario);

    if (existeCaja) {
      setCajaActual(existeCaja);
      setCajaAbierta(true);
      notify('La caja ya está abierta.', 'info');
      return true;
    }

    const montoInicial = Number(efectivoInicial);
    if (efectivoInicial === '' || Number.isNaN(montoInicial) || montoInicial < 0) {
      notify('Ingresa el efectivo inicial disponible en la caja.', 'error');
      return false;
    }

    const nuevaCaja = {
      id: `${localId}-${usuario}-${Date.now()}`,
      local: localId,
      localNombre,
      usuario,
      uid: trabajador?.uid || null,
      nombre,
      apellido,
      efectivoInicial: montoInicial,
      estado: 'abierta',
      abiertaDesde: new Date().toISOString(),
    };

    guardarCajas([...cajas, nuevaCaja]);
    setCajaActual(nuevaCaja);
    setCajaAbierta(true);
    setEfectivoInicial('');

    try {
      await setDoc(doc(db, 'cajas', nuevaCaja.id), nuevaCaja);
      notify(`Caja de ${localNombre} abierta por ${nombre} ${apellido}.`, 'success');
    } catch (error) {
      console.error('Error al guardar apertura de caja en Firebase:', error);
      notify('Caja abierta localmente, pero no se pudo guardar en Firebase.', 'error');
    }

    return true;
  };

  const agregarAutoconsumo = (producto) => {
    setAutoconsumo((actual) => {
      const indice = actual.findIndex((item) => item.nombre === producto.nombre);
      return indice === -1
        ? [...actual, { ...producto, cantidad: 1 }]
        : actual.map((item, index) => index === indice ? { ...item, cantidad: item.cantidad + 1 } : item);
    });
  };

  const quitarAutoconsumo = (nombreProducto) => {
    setAutoconsumo((actual) => actual.flatMap((item) => {
      if (item.nombre !== nombreProducto) return [item];
      return item.cantidad > 1 ? [{ ...item, cantidad: item.cantidad - 1 }] : [];
    }));
  };

  const totalAutoconsumo = autoconsumo.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
  const identificadorTrabajador = trabajador?.uid || trabajador?.rut || usuario;
  const diaLocalChile = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const consumosPersonalesHoy = (JSON.parse(localStorage.getItem('autoconsumos')) || []).filter((registro) => (
    registro.trabajadorId === identificadorTrabajador
    && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date(registro.fecha || Date.now())) === diaLocalChile
  ));
  const totalPersonalHoy = consumosPersonalesHoy.reduce((suma, registro) => suma + Number(registro.total || 0), 0);
  const unidadesGranel = ['kilogramos', 'kilogramo', 'kg', 'gramos', 'litros', 'litro', 'ml'];
  const esProductoReceta = (p) => Boolean(p.recetaId || p.tipo === 'receta' || p.esReceta || p.ingredientesBase?.length);
  const seccionesProductos = [
    { titulo: 'Productos a granel', items: productos.filter((p) => !esProductoReceta(p) && unidadesGranel.includes(String(p.unidadMedida || '').toLowerCase())) },
    { titulo: 'Productos a base de recetas', items: productos.filter(esProductoReceta) },
    { titulo: 'Productos', items: productos.filter((p) => !esProductoReceta(p) && !unidadesGranel.includes(String(p.unidadMedida || '').toLowerCase())) },
  ];

  const registrarAutoconsumo = async () => {
    if (autoconsumo.length === 0) {
      notify('Selecciona al menos un producto para registrar el autoconsumo.', 'error');
      return;
    }
    if (!trabajador?.rut) {
      notify('No tienes un RUT registrado. Solicita a administración que lo complete antes de registrar un autoconsumo.', 'error');
      return;
    }

    const registro = {
      id: `autoconsumo-${Date.now()}`,
      trabajadorId: identificadorTrabajador,
      trabajadorNombre: [trabajador?.nombre, trabajador?.apellido].filter(Boolean).join(' ') || usuario,
      trabajadorRut: trabajador?.rut || '',
      local: localId,
      localNombre,
      productos: autoconsumo,
      total: totalAutoconsumo,
      usuario: identificadorTrabajador,
      credencial: 'rut',
      codigoCredencial: trabajador.rut,
      fecha: new Date().toISOString(),
      firmaEstado: 'pendiente',
    };
    try {
      await registrarAutoconsumoConStock(localId, registro);
    } catch (error) {
      if (error.faltantes) {
        const detalle = error.faltantes
          .map((f) => `${f.nombre} (disponible: ${f.disponible}, solicitado: ${f.pedido})`)
          .join(', ');
        notify(`Stock insuficiente para el autoconsumo: ${detalle}.`, 'error');
      } else {
        console.error('No se pudo registrar el autoconsumo ni descontar stock:', error);
        notify('No se pudo registrar el autoconsumo. No se descontó stock; inténtalo nuevamente.', 'error');
      }
      return;
    }

    const registros = JSON.parse(localStorage.getItem('autoconsumos')) || [];
    localStorage.setItem('autoconsumos', JSON.stringify([...registros, registro]));
    const ventas = JSON.parse(localStorage.getItem('ventas')) || [];
    localStorage.setItem('ventas', JSON.stringify([...ventas, { ...registro, tipo: 'autoconsumo', metodoPago: 'Autoconsumo' }]));
    window.dispatchEvent(new Event('autoconsumos-actualizados'));
    window.dispatchEvent(new Event('ventas-actualizadas'));
    setAutoconsumo([]);
    setMostrarAutoconsumo(false);
    notify('Autoconsumo registrado. Quedará pendiente de tu firma diaria.', 'success');
  };

  const firmarResumenDiario = async () => {
    if (!aceptaFirma || !firmaDibujada) {
      notify('Confirma el resumen y dibuja tu firma antes de continuar.', 'error');
      return;
    }
    const hoyFirma = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
    const firma = {
      id: `firma-autoconsumo-${Date.now()}`,
      trabajadorId: identificadorTrabajador,
      trabajadorNombre: [trabajador?.nombre, trabajador?.apellido].filter(Boolean).join(' ') || usuario,
      fecha: hoyFirma,
      firmadaEn: new Date().toISOString(),
      local: localId,
      aceptada: true,
      firmaDigital: firmaCanvasRef.current?.toDataURL('image/png') || null,
      resumenConsumo: {
        cantidadRegistros: consumosPersonalesHoy.length,
        total: totalPersonalHoy,
        productos: consumosPersonalesHoy.flatMap((registro) => (registro.productos || []).map((producto) => ({
          nombre: producto.nombre,
          cantidad: Number(producto.cantidad || 0),
          subtotal: Number(producto.precio || 0) * Number(producto.cantidad || 0),
        }))),
        registros: consumosPersonalesHoy.map((registro) => ({
          id: registro.id,
          localNombre: registro.localNombre || registro.local || '',
          fecha: registro.fecha,
          total: Number(registro.total || 0),
          productos: registro.productos || [],
        })),
      },
    };
    const firmas = JSON.parse(localStorage.getItem('firmasAutoconsumo')) || [];
    localStorage.setItem('firmasAutoconsumo', JSON.stringify([...firmas, firma]));
    window.dispatchEvent(new Event('autoconsumos-actualizados'));
    try {
      await setDoc(doc(db, 'firmasAutoconsumo', firma.id), firma);
    } catch (error) {
      console.error('No se pudo guardar la firma en Firebase:', error);
    }
    setAceptaFirma(false);
    setFirmaDibujada(false);
    setMostrarFirma(false);
    notify('Resumen diario de autoconsumos firmado.', 'success');
  };

  const posicionFirma = (evento) => {
    const canvas = firmaCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: (evento.clientX - rect.left) * (canvas.width / rect.width),
      y: (evento.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const iniciarFirma = (evento) => {
    const canvas = firmaCanvasRef.current;
    if (!canvas) return;
    const contexto = canvas.getContext('2d');
    const { x, y } = posicionFirma(evento);
    evento.currentTarget.setPointerCapture?.(evento.pointerId);
    contexto.beginPath();
    contexto.moveTo(x, y);
    dibujandoFirmaRef.current = true;
  };

  const dibujarFirma = (evento) => {
    if (!dibujandoFirmaRef.current) return;
    const canvas = firmaCanvasRef.current;
    const contexto = canvas.getContext('2d');
    const { x, y } = posicionFirma(evento);
    contexto.lineWidth = 2.4;
    contexto.lineCap = 'round';
    contexto.strokeStyle = '#0f172a';
    contexto.lineTo(x, y);
    contexto.stroke();
    setFirmaDibujada(true);
  };

  const limpiarFirma = () => {
    const canvas = firmaCanvasRef.current;
    canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setFirmaDibujada(false);
  };

  const cerrarCaja = async () => {
    if (carrito.length > 0) {
      notify('Vacía el carrito antes de cerrar caja.', 'error');
      return;
    }

    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    const cajaParaCerrar = cajaActual || cajas.find((caja) => caja.local === localId && caja.usuario === usuario);
    const cajasActualizadas = cajas.filter((caja) => !(caja.local === localId && caja.usuario === usuario));
    const cerradaEn = new Date().toISOString();

    guardarCajas(cajasActualizadas);
    setCajaActual(null);
    setCajaAbierta(false);

    try {
      if (cajaParaCerrar?.id) {
        await updateDoc(doc(db, 'cajas', cajaParaCerrar.id), {
          estado: 'cerrada',
          cerradaEn,
          cerradaPor: usuario,
        });
      }
      notify(`Caja de ${localNombre} cerrada por ${nombre} ${apellido}.`, 'success');
    } catch (error) {
      console.error('Error al guardar cierre de caja en Firebase:', error);
      notify('Caja cerrada localmente, pero no se pudo actualizar en Firebase.', 'error');
    }
  };

  const agregarProducto = (producto) => {
    if (!cajaAbierta) {
      notify('Debes abrir caja antes de agregar productos.', 'error');
      return;
    }

    // Cuántas unidades de este producto ya hay en el carrito (sumando todas
    // sus líneas, porque en comida rápida puede haber varias con distintos
    // ingredientes) vs. el stock que hay en el local.
    const enCarrito = carrito
      .filter((item) => item.id === producto.id)
      .reduce((suma, item) => suma + (item.cantidad || 1), 0);

    if (enCarrito >= producto.stockActual) {
      notify(`Stock insuficiente de ${producto.nombre} (disponible: ${producto.stockActual}).`, 'error');
      return;
    }

    const ingredientesBase = producto.ingredientes || [];
    setCarrito((actual) => {
      const indiceExistente = actual.findIndex((item) => (
        item.id === producto.id
        && (item.ingredientes || []).join('|') === ingredientesBase.join('|')
      ));

      if (indiceExistente === -1) {
        return [...actual, {
          ...producto,
          cantidad: 1,
          ingredientes: [...ingredientesBase],
          ingredientesBase,
        }];
      }

      return actual.map((item, index) => (
        index === indiceExistente ? { ...item, cantidad: item.cantidad + 1 } : item
      ));
    });
  };

  // La pistola envía el código como teclado y termina con Enter. El catálogo
  // de ventas ya incluye codigoBarra, por lo que se puede resolver localmente.
  const manejarCodigoEscaneado = (codigo) => {
    const codigoBuscado = codigo.trim();
    const producto = productos.find(
      (item) => String(item.codigoBarra ?? '').trim() === codigoBuscado,
    );

    if (!producto) {
      setCodigoNuevoPendiente(codigoBuscado);
      setDestinoProductoNuevo(mostrarAutoconsumo ? 'autoconsumo' : 'venta');
      setFormProductoNuevo({ nombre: '', categoria: '', unidadMedida: 'unidad', precioVenta: '', stockInicial: '1' });
      return;
    }

    if (mostrarAutoconsumo) {
      agregarAutoconsumo(producto);
      return;
    }

    if (!cajaAbierta) {
      notify('Debes abrir caja antes de agregar productos.', 'error');
      return;
    }

    if (producto.stockActual <= 0) {
      notify(`${producto.nombre} no tiene stock disponible.`, 'error');
      return;
    }

    agregarProducto(producto);
  };

  const cancelarAltaProductoNuevo = () => {
    setCodigoNuevoPendiente('');
    setMostrarFormularioProductoNuevo(false);
  };

  const guardarProductoNuevoDesdeVenta = async (event) => {
    event.preventDefault();
    if (destinoProductoNuevo === 'venta' && !cajaAbierta) {
      notify('Debes abrir caja antes de agregar productos.', 'error');
      cancelarAltaProductoNuevo();
      return;
    }

    const stockInicial = Number(formProductoNuevo.stockInicial);
    const precioVenta = Number(formProductoNuevo.precioVenta);
    if (!formProductoNuevo.nombre.trim() || !formProductoNuevo.categoria || !precioVenta || stockInicial < 1) {
      notify('Completa el nombre, la categoría, un precio válido y un stock inicial de al menos 1.', 'error');
      return;
    }

    setGuardandoProductoNuevo(true);
    try {
      // Si el alta global se completó antes de un error de red, reaprovecha
      // ese registro al reintentar en vez de crear un duplicado.
      const productoGlobalExistente = await obtenerProductoPorCodigoBarra(codigoNuevoPendiente);
      const productoGlobal = productoGlobalExistente || await crearProductoGlobal({
        nombre: formProductoNuevo.nombre.trim(),
        categoria: formProductoNuevo.categoria,
        codigoBarra: codigoNuevoPendiente,
        unidadMedida: formProductoNuevo.unidadMedida,
      });
      const unidadBase = unidadBaseDesdeUnidadMedida(formProductoNuevo.unidadMedida);
      const cantidadInicialBase = convertirACantidadBase(stockInicial, unidadBase);
      const productoLocalExistente = await obtenerProductoLocal(localId, productoGlobal.id);
      if (productoLocalExistente) {
        await actualizarProductoLocal(localId, productoGlobal.id, { stockMinimo: 0, precioVenta });
        await cambiarEstadoProductoLocal(localId, productoGlobal.id, true);
      } else {
        await crearProductoEnLocal(localId, productoGlobal.id, { stockMinimo: 0, precioVenta });
      }
      // Un reintento después de un corte de red no debe duplicar el stock.
      const stockTotalBase = productoLocalExistente
        ? (productoLocalExistente.stockActual || cantidadInicialBase)
        : cantidadInicialBase;
      await ajustarStockLocal(localId, productoGlobal.id, stockTotalBase);

      const productoVenta = {
        ...productoGlobal,
        precio: precioVenta,
        stockActual: stockTotalBase,
        stockMinimo: 0,
      };
      if (destinoProductoNuevo === 'autoconsumo') {
        agregarAutoconsumo(productoVenta);
        notify(`${productoGlobal.nombre} se agregó al inventario y al autoconsumo.`, 'success');
      } else {
        agregarProducto(productoVenta);
        notify(`${productoGlobal.nombre} se agregó al inventario y al carrito.`, 'success');
      }
      cancelarAltaProductoNuevo();
    } catch (error) {
      console.error('No se pudo crear el producto escaneado:', error);
      notify(error?.message || 'No se pudo agregar el producto al inventario.', 'error');
    } finally {
      setGuardandoProductoNuevo(false);
    }
  };

  // Botón "+" de una línea del carrito: reutiliza la validación de stock
  // contra el stock en vivo del producto.
  const sumarUno = (indexProducto) => {
    const item = carrito[indexProducto];
    const productoVivo = productos.find((producto) => producto.id === item.id);
    const enCarrito = carrito
      .filter((linea) => linea.id === item.id)
      .reduce((suma, linea) => suma + (linea.cantidad || 1), 0);

    if (!productoVivo || enCarrito >= productoVivo.stockActual) {
      notify(`Stock insuficiente de ${item.nombre} (disponible: ${productoVivo?.stockActual ?? 0}).`, 'error');
      return;
    }

    setCarrito((actual) => actual.map((linea, index) => (
      index === indexProducto ? { ...linea, cantidad: linea.cantidad + 1 } : linea
    )));
  };

  const eliminarProducto = (indexProducto) => {
    setCarrito((actual) => {
      const producto = actual[indexProducto];
      if (producto.cantidad > 1) {
        return actual.map((item, index) => (
          index === indexProducto ? { ...item, cantidad: item.cantidad - 1 } : item
        ));
      }
      return actual.filter((_, index) => index !== indexProducto);
    });
  };

  const quitarIngrediente = (indexProducto, ingrediente) => {
    setCarrito((actual) => actual.map((item, index) => (
      index === indexProducto
        ? { ...item, ingredientes: item.ingredientes.filter((nombre) => nombre !== ingrediente) }
        : item
    )));
  };

  const registrarPago = async () => {
    if (!cajaAbierta) {
      notify('Debes abrir caja antes de registrar el pago.', 'error');
      return;
    }

    if (carrito.length === 0) {
      notify('Agrega productos al carrito antes de pagar.', 'error');
      return;
    }

    if (!metodoPago) {
      notify('Selecciona un método de pago.', 'error');
      return;
    }

    if (metodoPago === 'Efectivo' && (!montoPagado || montoPagado < total)) {
      notify('Ingresa un monto en efectivo igual o mayor al total.', 'error');
      return;
    }

    const nuevaVenta = {
      id: `${localId}-${Date.now()}`,
      cajaId: cajaActual?.id || null,
      local: localId,
      localNombre,
      usuario,
      usuarioNombre: `${nombre} ${apellido}`.trim(),
      nombreUsuario: nombre,
      apellidoUsuario: apellido,
      productos: carrito.map((item) => ({
        id: item.id,
        nombre: item.nombre,
        precio: item.precio,                       // precio unitario
        cantidad: item.cantidad || 1,
        subtotal: item.precio * (item.cantidad || 1),
        ingredientes: item.ingredientes || [],
      })),
      total,
      metodoPago,
      montoPagado: metodoPago === 'Efectivo' ? montoPagado : total,
      vuelto: metodoPago === 'Efectivo' ? montoPagado - total : 0,
      fecha: new Date().toISOString(),
    };

    setGuardandoVenta(true);
    try {
      // Guarda la venta y descuenta el stock en una sola transacción.
      // Si falta stock en cualquier producto, no se guarda nada.
      await registrarVentaConStock(localId, nuevaVenta);

      const ventas = JSON.parse(localStorage.getItem('ventas')) || [];
      localStorage.setItem('ventas', JSON.stringify([...ventas, nuevaVenta]));
      window.dispatchEvent(new Event('ventas-actualizadas'));

      setCarrito([]);
      setMontoEfectivo('');
      notify(`Venta registrada con ${metodoPago} por $${total.toLocaleString('es-CL')}.`, 'success');
    } catch (error) {
      if (error.faltantes) {
        const detalle = error.faltantes
          .map((f) => `${f.nombre} (disponible: ${f.disponible}, pedido: ${f.pedido})`)
          .join(', ');
        notify(`Stock insuficiente: ${detalle}. Ajusta el carrito.`, 'error');
      } else {
        console.error('Error al registrar la venta:', error);
        notify('No se pudo registrar la venta. Revisa la conexión e inténtalo de nuevo.', 'error');
      }
    } finally {
      setGuardandoVenta(false);
    }
  };

  return (
    <>
      <BarcodeScanner onScan={manejarCodigoEscaneado} enabled={!codigoNuevoPendiente} />
      {codigoNuevoPendiente && !mostrarFormularioProductoNuevo && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="producto-nuevo-pregunta">
            <h2 id="producto-nuevo-pregunta">Producto no encontrado</h2>
            <p>El código <strong>{codigoNuevoPendiente}</strong> no está registrado. ¿Quieres agregar este producto al inventario y al {destinoProductoNuevo === 'autoconsumo' ? 'autoconsumo' : 'carrito'}?</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelarAltaProductoNuevo}>No, cancelar</button>
              <button type="button" className="btn btn-primary" onClick={() => setMostrarFormularioProductoNuevo(true)}>Sí, agregar</button>
            </div>
          </section>
        </div>
      )}
      {codigoNuevoPendiente && mostrarFormularioProductoNuevo && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="producto-nuevo-titulo" onSubmit={guardarProductoNuevoDesdeVenta}>
            <h2 id="producto-nuevo-titulo">Datos del producto</h2>
            <p>Código escaneado: <strong>{codigoNuevoPendiente}</strong></p>
            <label className="cash-opening-field">Nombre
              <input className="field" required value={formProductoNuevo.nombre} onChange={(e) => setFormProductoNuevo((actual) => ({ ...actual, nombre: e.target.value }))} autoFocus />
            </label>
            <label className="cash-opening-field">Categoría
              <select className="field" required value={formProductoNuevo.categoria} onChange={(e) => setFormProductoNuevo((actual) => ({ ...actual, categoria: e.target.value }))}>
                <option value="">Selecciona una categoría</option>
                {CATEGORIAS.map((categoria) => <option key={categoria} value={categoria}>{categoria}</option>)}
              </select>
            </label>
            <label className="cash-opening-field">Unidad de medida
              <select className="field" value={formProductoNuevo.unidadMedida} onChange={(e) => setFormProductoNuevo((actual) => ({ ...actual, unidadMedida: e.target.value }))}>
                {UNIDADES_MEDIDA.map((unidad) => <option key={unidad.value} value={unidad.value}>{unidad.label}</option>)}
              </select>
            </label>
            <label className="cash-opening-field">Precio de venta
              <input className="field" type="number" min="1" step="1" required value={formProductoNuevo.precioVenta} onChange={(e) => setFormProductoNuevo((actual) => ({ ...actual, precioVenta: e.target.value }))} />
            </label>
            <label className="cash-opening-field">Stock inicial ({UNIDADES_MEDIDA.find((unidad) => unidad.value === formProductoNuevo.unidadMedida)?.label.toLowerCase()})
              <input className="field" type="number" min="1" step="any" required value={formProductoNuevo.stockInicial} onChange={(e) => setFormProductoNuevo((actual) => ({ ...actual, stockInicial: e.target.value }))} />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cancelarAltaProductoNuevo} disabled={guardandoProductoNuevo}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardandoProductoNuevo}>{guardandoProductoNuevo ? 'Guardando…' : `Crear y agregar al ${destinoProductoNuevo === 'autoconsumo' ? 'autoconsumo' : 'carrito'}`}</button>
            </div>
          </form>
        </div>
      )}
      {mostrarAlertaInicio && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card cash-opening-modal" role="dialog" aria-modal="true" aria-labelledby="inicio-caja-titulo">
            <h2 id="inicio-caja-titulo">Iniciar caja</h2>
            <p className="muted">Registra el efectivo disponible al comenzar el día antes de abrir la caja.</p>
            <label className="cash-opening-field" htmlFor={`efectivo-alerta-${localId}`}>
              Efectivo inicial en caja
              <input
                id={`efectivo-alerta-${localId}`}
                className="field"
                type="number"
                min="0"
                step="100"
                autoFocus
                value={efectivoInicial}
                onChange={(e) => setEfectivoInicial(e.target.value)}
                placeholder="Ej.: 20000"
              />
            </label>
            <div className="modal-actions cash-opening-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarAlertaInicio(false)}>
                Más tarde
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  const cajaAbiertaConExito = await abrirCaja();
                  if (cajaAbiertaConExito) setMostrarAlertaInicio(false);
                }}
              >
                Abrir caja
              </button>
            </div>
          </section>
        </div>
      )}

      {mostrarAutoconsumo && (
        <div className="modal-backdrop">
          <section className="modal-card autoconsumo-modal" role="dialog" aria-modal="true">
            <div className="modal-head"><h2>Registrar autoconsumo</h2><button className="icon-btn" onClick={() => setMostrarAutoconsumo(false)}>×</button></div>
            <p className="muted">Elige tus productos. Este registro no se suma a una venta de cliente.</p>
            <div className="autoconsumo-products">
              {productos.map((producto) => <button type="button" className="product-button" key={producto.nombre} onClick={() => agregarAutoconsumo(producto)}><span>{producto.nombre}</span><strong>${producto.precio.toLocaleString('es-CL')}</strong></button>)}
            </div>
            <div className="autoconsumo-selected">
              {autoconsumo.length === 0 ? <p className="muted">Sin productos seleccionados.</p> : autoconsumo.map((item) => <div key={item.nombre}><span>{item.nombre} ×{item.cantidad}</span><button type="button" className="btn btn-secondary btn-small" onClick={() => quitarAutoconsumo(item.nombre)}>Quitar uno</button></div>)}
              <strong>Total referencial: ${totalAutoconsumo.toLocaleString('es-CL')}</strong>
            </div>
            <div className="credential-rut-summary"><strong>Credencial virtual</strong><span>RUT: {trabajador?.rut || 'Sin RUT registrado'}</span></div>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setMostrarAutoconsumo(false)}>Cancelar</button><button className="btn btn-primary" onClick={registrarAutoconsumo}>Registrar consumo</button></div>
          </section>
        </div>
      )}

      {mostrarFirma && (
        <div className="modal-backdrop">
          <section className="modal-card" role="dialog" aria-modal="true">
            <h2>Firma digital diaria</h2><p className="muted">Resumen de hoy: {consumosPersonalesHoy.length} autoconsumo(s) por ${totalPersonalHoy.toLocaleString('es-CL')}. Revisa el detalle y confirma que corresponde a tus consumos.</p>
            <div className="autoconsumo-selected signature-consumption-summary">
              {consumosPersonalesHoy.length === 0 ? <p className="muted">No tienes consumos registrados hoy.</p> : consumosPersonalesHoy.map((registro) => <div className="signature-consumption-row" key={registro.id}><span><strong>{registro.localNombre || registro.local}</strong><small>{(registro.productos || []).map((producto) => `${producto.cantidad}× ${producto.nombre}`).join(', ')}</small></span><b>${Number(registro.total || 0).toLocaleString('es-CL')}</b></div>)}
              <strong>Total del resumen: ${totalPersonalHoy.toLocaleString('es-CL')}</strong>
            </div>
            <div className="signature-box">
              <div><strong>Dibuja tu firma</strong><button type="button" className="btn btn-secondary btn-small" onClick={limpiarFirma}>Limpiar</button></div>
              <canvas ref={firmaCanvasRef} width="480" height="180" onPointerDown={iniciarFirma} onPointerMove={dibujarFirma} onPointerUp={() => { dibujandoFirmaRef.current = false; }} onPointerLeave={() => { dibujandoFirmaRef.current = false; }} aria-label="Recuadro para firma digital" />
            </div>
            <label className="signature-check"><input type="checkbox" checked={aceptaFirma} onChange={(e) => setAceptaFirma(e.target.checked)} /> Confirmo que los consumos registrados corresponden a mí.</label>
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setMostrarFirma(false)}>Cancelar</button><button className="btn btn-primary" onClick={firmarResumenDiario}>Firmar resumen</button></div>
          </section>
        </div>
      )}

      <section className="cash-panel">
        <div>
          <p className="eyebrow">Caja</p>
          <h2>{cajaAbierta ? 'Caja abierta' : 'Caja cerrada'}</h2>
          {cajaAbierta ? (
            <p className="cash-opening-amount">
              Efectivo inicial: ${Number(cajaActual?.efectivoInicial || 0).toLocaleString('es-CL')}
            </p>
          ) : (
            <label className="cash-opening-field" htmlFor={`efectivo-inicial-${localId}`}>
              Efectivo disponible al iniciar el día
              <input
                id={`efectivo-inicial-${localId}`}
                className="field"
                type="number"
                min="0"
                step="100"
                value={efectivoInicial}
                onChange={(e) => setEfectivoInicial(e.target.value)}
                placeholder="Ej.: 20000"
              />
              <small>Ingresa el monto y luego presiona “Abrir caja”.</small>
            </label>
          )}
        </div>
        <button className={cajaAbierta ? 'btn btn-danger' : 'btn btn-primary'} onClick={cajaAbierta ? cerrarCaja : abrirCaja}>
          {cajaAbierta ? 'Cerrar caja' : 'Abrir caja'}
        </button>
      </section>

      <section className="personal-consumption-panel">
        <div><p className="eyebrow">Consumo personal</p><h2>Autoconsumo del trabajador</h2><p className="muted">Tu credencial virtual corresponde a tu RUT. Firma tu resumen al terminar el turno.</p></div>
        <div className="personal-consumption-actions"><button className="btn btn-secondary" onClick={() => setMostrarAutoconsumo(true)}>Registrar autoconsumo</button><button className="btn btn-primary" onClick={() => setMostrarFirma(true)}>Firmar resumen diario</button></div>
      </section>

      <section className="pos-layout">
        <div className="work-panel">
          <div className="pos-products-heading">
            <nav className="pos-product-tabs" aria-label="Secciones de productos">
              {seccionesProductos.map((seccion) => <button type="button" key={seccion.titulo} className={seccionProductoActiva === seccion.titulo ? 'active' : ''} aria-pressed={seccionProductoActiva === seccion.titulo} onClick={() => setSeccionProductoActiva(seccion.titulo)}>{seccion.titulo}</button>)}
            </nav>
          </div>
          <div className="pos-product-browser">
            <div className="product-grid">
            {(seccionesProductos.find((seccion) => seccion.titulo === seccionProductoActiva)?.items || []).map((producto) => (
              <button
                className="product-button"
                onClick={() => agregarProducto(producto)}
                disabled={!cajaAbierta || producto.stockActual <= 0}
                key={producto.id}
              >
                <span>{producto.nombre}</span>
                <strong>${producto.precio.toLocaleString('es-CL')}</strong>
                <small className="product-stock">
                  {producto.stockActual <= 0
                    ? 'Sin stock'
                    : `Stock: ${producto.stockActual}${producto.stockActual <= producto.stockMinimo ? ' ⚠' : ''}`}
                </small>
              </button>
            ))}
            </div>
          </div>
          {(seccionesProductos.find((seccion) => seccion.titulo === seccionProductoActiva)?.items || []).length === 0 && <p className="muted">No hay productos en esta sección.</p>}
        </div>

        <aside className="work-panel">
          <div className="cart-head">
            <h2>Carrito</h2>
            <span>{carrito.reduce((cantidad, item) => cantidad + (item.cantidad || 1), 0)} productos</span>
          </div>

          <div className="cart-list">
            {carrito.length === 0 ? (
              <p className="muted">Aún no hay productos agregados.</p>
            ) : (
              carrito.map((item, index) => (
                <div className="cart-row" key={`${item.id}-${index}`}>
                  <div className="cart-item-detail">
                    <span className="cart-item-name">{item.nombre}</span>
                    <small className="cart-item-unit">
                      ${item.precio.toLocaleString('es-CL')} c/u × {item.cantidad || 1}
                    </small>
                    {esComidaRapida && item.ingredientesBase?.length > 0 && (
                      <>
                        {item.ingredientes.length > 0 && (
                          <div className="ingredient-list" aria-label={`Ingredientes de ${item.nombre}`}>
                            {item.ingredientes.map((ingrediente) => (
                              <button
                                type="button"
                                className="ingredient-chip"
                                key={ingrediente}
                                onClick={() => quitarIngrediente(index, ingrediente)}
                                title={`Quitar ${ingrediente}`}
                              >
                                {ingrediente} <span aria-hidden="true">×</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {item.ingredientes.length === 0 && <small>Sin ingredientes seleccionados</small>}
                        {item.ingredientes.length < item.ingredientesBase.length && (
                          <small className="removed-ingredients">
                            Sin: {item.ingredientesBase.filter((ingrediente) => !item.ingredientes.includes(ingrediente)).join(', ')}
                          </small>
                        )}
                      </>
                    )}
                  </div>
                  <strong>${(item.precio * (item.cantidad || 1)).toLocaleString('es-CL')}</strong>
                  <button className="btn btn-secondary btn-small" onClick={() => sumarUno(index)} title="Sumar uno">
                    +
                  </button>
                  <button className="btn btn-danger btn-small" onClick={() => eliminarProducto(index)}>
                    {item.cantidad > 1 ? 'Quitar uno' : 'Eliminar'}
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="cart-total">
            <span>Total</span>
            <strong>${total.toLocaleString('es-CL')}</strong>
          </div>

          <div className="payment-panel">
            <label htmlFor={`metodo-pago-${localId}`}>Método de pago</label>
            <select
              id={`metodo-pago-${localId}`}
              className="field"
              value={metodoPago}
              onChange={(e) => {
                setMetodoPago(e.target.value);
                setMontoEfectivo('');
              }}
              disabled={!cajaAbierta}
            >
              {metodosPago.map((metodo) => (
                <option value={metodo} key={metodo}>{metodo}</option>
              ))}
            </select>

            {metodoPago === 'Efectivo' && (
              <label className="cash-paid-field" htmlFor={`monto-efectivo-${localId}`}>
                Monto pagado
                <input
                  id={`monto-efectivo-${localId}`}
                  className="field"
                  type="number"
                  min={total}
                  value={montoEfectivo}
                  onChange={(e) => setMontoEfectivo(e.target.value)}
                  placeholder="Ingresa el monto recibido"
                  disabled={!cajaAbierta}
                />
                {montoPagado >= total && (
                  <small>Vuelto: ${vuelto.toLocaleString('es-CL')}</small>
                )}
              </label>
            )}

            <button className="btn btn-primary btn-full" onClick={registrarPago} disabled={!cajaAbierta || carrito.length === 0 || guardandoVenta}>
              {guardandoVenta ? 'Registrando...' : 'Registrar pago'}
            </button>
          </div>
        </aside>
      </section>
    </>
  );
}

export default PuntoVenta;
