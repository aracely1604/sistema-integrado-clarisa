import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
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
            return;
          }
        } catch (error) {
          console.error('No se pudieron cargar cajas abiertas desde Firebase:', error);
        }
      }

      setCajaActual(cajaEncontrada || null);
      setCajaAbierta(Boolean(cajaEncontrada));
    };

    sincronizarCaja();
    const intervalo = setInterval(sincronizarCaja, 2500);
    window.addEventListener('cajas-actualizadas', sincronizarCaja);

    return () => {
      clearInterval(intervalo);
      window.removeEventListener('cajas-actualizadas', sincronizarCaja);
    };
  }, [localId, usuario]);

  const total = carrito.reduce((suma, producto) => suma + producto.precio, 0);
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
      return;
    }

    const nuevaCaja = {
      id: `${localId}-${usuario}-${Date.now()}`,
      local: localId,
      localNombre,
      usuario,
      nombre,
      apellido,
      estado: 'abierta',
      abiertaDesde: new Date().toISOString(),
    };

    guardarCajas([...cajas, nuevaCaja]);
    setCajaActual(nuevaCaja);
    setCajaAbierta(true);

    try {
      await setDoc(doc(db, 'cajas', nuevaCaja.id), nuevaCaja);
      notify(`Caja de ${localNombre} abierta por ${nombre} ${apellido}.`, 'success');
    } catch (error) {
      console.error('Error al guardar apertura de caja en Firebase:', error);
      notify('Caja abierta localmente, pero no se pudo guardar en Firebase.', 'error');
    }
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

    setCarrito([...carrito, producto]);
  };

  const eliminarProducto = (indexProducto) => {
    setCarrito(carrito.filter((_, index) => index !== indexProducto));
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
      productos: carrito,
      total,
      metodoPago,
      montoPagado: metodoPago === 'Efectivo' ? montoPagado : total,
      vuelto: metodoPago === 'Efectivo' ? montoPagado - total : 0,
      fecha: new Date().toISOString(),
    };

    localStorage.setItem('ventas', JSON.stringify([...ventas, nuevaVenta]));

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
      <section className="cash-panel">
        <div>
          <p className="eyebrow">Caja</p>
          <h2>{cajaAbierta ? 'Caja abierta' : 'Caja cerrada'}</h2>
          <p className="muted">{localNombre} - {nombre} {apellido}</p>
          
        </div>
        <button className={cajaAbierta ? 'btn btn-danger' : 'btn btn-primary'} onClick={cajaAbierta ? cerrarCaja : abrirCaja}>
          {cajaAbierta ? 'Cerrar caja' : 'Abrir caja'}
        </button>
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
            <span>{carrito.length} productos</span>
          </div>

          <div className="cart-list">
            {carrito.length === 0 ? (
              <p className="muted">Aún no hay productos agregados.</p>
            ) : (
              carrito.map((item, index) => (
                <div className="cart-row" key={`${item.nombre}-${index}`}>
                  <span>{item.nombre}</span>
                  <strong>${item.precio.toLocaleString('es-CL')}</strong>
                  <button className="btn btn-danger btn-small" onClick={() => eliminarProducto(index)}>
                    Eliminar
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
