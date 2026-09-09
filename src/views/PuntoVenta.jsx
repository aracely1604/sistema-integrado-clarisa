import React, { useEffect, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../controllers/AuthContext';
import '../styles/views/pointOfSale.css';

const metodosBase = ['Débito', 'Efectivo', 'Transferencia'];

const formatearFechaHora = (fecha) => {
  return fecha.toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

function PuntoVenta({ localId, localNombre, productos, usuario, notify, metodosPago = metodosBase }) {
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
  const [autoconsumo, setAutoconsumo] = useState([]);
  const [tipoCredencial, setTipoCredencial] = useState('virtual');
  const [identificadorFisico, setIdentificadorFisico] = useState('');
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

  const esComidaRapida = localId === 'comida_rapida';
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
  const consumosPersonalesHoy = (JSON.parse(localStorage.getItem('autoconsumos')) || []).filter((registro) => (
    registro.trabajadorId === identificadorTrabajador
    && String(registro.fecha || '').slice(0, 10) === new Date().toISOString().slice(0, 10)
  ));
  const totalPersonalHoy = consumosPersonalesHoy.reduce((suma, registro) => suma + Number(registro.total || 0), 0);

  const registrarAutoconsumo = async () => {
    if (autoconsumo.length === 0) {
      notify('Selecciona al menos un producto para registrar el autoconsumo.', 'error');
      return;
    }
    if (tipoCredencial === 'fisica' && !identificadorFisico.trim()) {
      notify('Ingresa el código de la credencial física.', 'error');
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
      credencial: tipoCredencial,
      codigoCredencialFisica: tipoCredencial === 'fisica' ? identificadorFisico.trim() : null,
      fecha: new Date().toISOString(),
      firmaEstado: 'pendiente',
    };
    const registros = JSON.parse(localStorage.getItem('autoconsumos')) || [];
    localStorage.setItem('autoconsumos', JSON.stringify([...registros, registro]));
    window.dispatchEvent(new Event('autoconsumos-actualizados'));
    try {
      await setDoc(doc(db, 'autoconsumos', registro.id), registro);
    } catch (error) {
      console.error('No se pudo guardar el autoconsumo en Firebase:', error);
    }
    setAutoconsumo([]);
    setIdentificadorFisico('');
    setMostrarAutoconsumo(false);
    notify('Autoconsumo registrado. Quedará pendiente de tu firma diaria.', 'success');
  };

  const firmarResumenDiario = async () => {
    if (!aceptaFirma || !firmaDibujada) {
      notify('Confirma el resumen y dibuja tu firma antes de continuar.', 'error');
      return;
    }
    const hoyFirma = new Date().toISOString().slice(0, 10);
    const firma = {
      id: `firma-autoconsumo-${Date.now()}`,
      trabajadorId: identificadorTrabajador,
      trabajadorNombre: [trabajador?.nombre, trabajador?.apellido].filter(Boolean).join(' ') || usuario,
      fecha: hoyFirma,
      firmadaEn: new Date().toISOString(),
      local: localId,
      aceptada: true,
      firmaDigital: firmaCanvasRef.current?.toDataURL('image/png') || null,
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

    if (!esComidaRapida) {
      setCarrito((actual) => [...actual, producto]);
      return;
    }

    const ingredientesBase = producto.ingredientes || [];
    setCarrito((actual) => {
      const indiceExistente = actual.findIndex((item) => (
        item.nombre === producto.nombre
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

  const eliminarProducto = (indexProducto) => {
    setCarrito((actual) => {
      const producto = actual[indexProducto];
      if (esComidaRapida && producto.cantidad > 1) {
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

    const ventas = JSON.parse(localStorage.getItem('ventas')) || [];
    const nuevaVenta = {
      id: `${localId}-${Date.now()}`,
      cajaId: cajaActual?.id || null,
      local: localId,
      localNombre,
      usuario,
      usuarioNombre: `${nombre} ${apellido}`.trim(),
      nombreUsuario: nombre,
      apellidoUsuario: apellido,
      productos: carrito.map(({ ingredientesBase, ...producto }) => producto),
      total,
      metodoPago,
      montoPagado: metodoPago === 'Efectivo' ? montoPagado : total,
      vuelto: metodoPago === 'Efectivo' ? montoPagado - total : 0,
      fecha: new Date().toISOString(),
    };

      localStorage.setItem('ventas', JSON.stringify([...ventas, nuevaVenta]));
      window.dispatchEvent(new Event('ventas-actualizadas'));

    try {
      await setDoc(doc(db, 'ventas', nuevaVenta.id), nuevaVenta);
      setCarrito([]);
      setMontoEfectivo('');
      notify(`Venta registrada con ${metodoPago} por $${total.toLocaleString('es-CL')}.`, 'success');
    } catch (error) {
      console.error('Error al guardar venta en Firebase:', error);
      notify('Venta guardada localmente, pero no se pudo guardar en Firebase.', 'error');
    }
  };

  return (
    <>
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
            <label>Tipo de credencial<select className="field" value={tipoCredencial} onChange={(e) => setTipoCredencial(e.target.value)}><option value="virtual">Credencial virtual</option><option value="fisica">Credencial física</option></select></label>
            {tipoCredencial === 'fisica' && <input className="field" value={identificadorFisico} onChange={(e) => setIdentificadorFisico(e.target.value)} placeholder="Código de credencial física" />}
            <div className="modal-actions"><button className="btn btn-secondary" onClick={() => setMostrarAutoconsumo(false)}>Cancelar</button><button className="btn btn-primary" onClick={registrarAutoconsumo}>Registrar consumo</button></div>
          </section>
        </div>
      )}

      {mostrarFirma && (
        <div className="modal-backdrop">
          <section className="modal-card" role="dialog" aria-modal="true">
            <h2>Firma digital diaria</h2><p className="muted">Resumen de hoy: {consumosPersonalesHoy.length} autoconsumo(s) por ${totalPersonalHoy.toLocaleString('es-CL')}. Confirma que revisaste y aceptas este registro.</p>
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
          <p className="muted">{localNombre} - {nombre} {apellido}</p>
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
        <div><p className="eyebrow">Consumo personal</p><h2>Autoconsumo del trabajador</h2><p className="muted">Registra tus productos con credencial virtual o física y firma tu resumen al terminar el turno.</p></div>
        <div className="personal-consumption-actions"><button className="btn btn-secondary" onClick={() => setMostrarAutoconsumo(true)}>Registrar autoconsumo</button><button className="btn btn-primary" onClick={() => setMostrarFirma(true)}>Firmar resumen diario</button></div>
      </section>

      <section className="pos-layout">
        <div className="work-panel">
          <h2>Productos</h2>
          <div className="product-grid">
            {productos.map((producto) => (
              <button
                className="product-button"
                onClick={() => agregarProducto(producto)}
                disabled={!cajaAbierta}
                key={producto.nombre}
              >
                <span>{producto.nombre}</span>
                <strong>${producto.precio.toLocaleString('es-CL')}</strong>
              </button>
            ))}
          </div>
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
                <div className="cart-row" key={`${item.nombre}-${index}`}>
                  <div className="cart-item-detail">
                    <span className="cart-item-name">
                      {item.nombre}{item.cantidad > 1 ? ` ×${item.cantidad}` : ''}
                    </span>
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

            <button className="btn btn-primary btn-full" onClick={registrarPago} disabled={!cajaAbierta || carrito.length === 0}>
              Registrar pago
            </button>
          </div>
        </aside>
      </section>
    </>
  );
}

export default PuntoVenta;
