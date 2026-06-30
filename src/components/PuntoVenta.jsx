import React, { useEffect, useState } from 'react';

const metodosBase = ['Debito', 'Efectivo', 'Transferencia'];

function PuntoVenta({ localId, localNombre, productos, usuario, notify, metodosPago = metodosBase }) {
  const [carrito, setCarrito] = useState([]);
  const [cajaAbierta, setCajaAbierta] = useState(false);
  const [metodoPago, setMetodoPago] = useState(metodosPago[0] || '');
  const [montoEfectivo, setMontoEfectivo] = useState('');

  useEffect(() => {
    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    setCajaAbierta(cajas.some((caja) => caja.local === localId && caja.usuario === usuario));
  }, [localId, usuario]);

  const total = carrito.reduce((suma, producto) => suma + producto.precio, 0);
  const montoPagado = Number(montoEfectivo);
  const vuelto = metodoPago === 'Efectivo' && montoPagado >= total ? montoPagado - total : 0;

  const guardarCajas = (cajas) => {
    localStorage.setItem('cajas', JSON.stringify(cajas));
  };

  const abrirCaja = () => {
    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    const existeCaja = cajas.some((caja) => caja.local === localId && caja.usuario === usuario);

    if (existeCaja) {
      setCajaAbierta(true);
      notify('La caja ya esta abierta.', 'info');
      return;
    }

    const nuevaCaja = {
      id: `${localId}-${usuario}-${Date.now()}`,
      local: localId,
      localNombre,
      usuario,
      abiertaDesde: new Date().toISOString(),
    };

    guardarCajas([...cajas, nuevaCaja]);
    setCajaAbierta(true);
    notify(`Caja de ${localNombre} abierta.`, 'success');
  };

  const cerrarCaja = () => {
    if (carrito.length > 0) {
      notify('Vacia el carrito antes de cerrar caja.', 'error');
      return;
    }

    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    const cajasActualizadas = cajas.filter((caja) => !(caja.local === localId && caja.usuario === usuario));
    guardarCajas(cajasActualizadas);
    setCajaAbierta(false);
    notify(`Caja de ${localNombre} cerrada.`, 'success');
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

  const registrarPago = () => {
    if (!cajaAbierta) {
      notify('Debes abrir caja antes de registrar el pago.', 'error');
      return;
    }

    if (carrito.length === 0) {
      notify('Agrega productos al carrito antes de pagar.', 'error');
      return;
    }

    if (!metodoPago) {
      notify('Selecciona un metodo de pago.', 'error');
      return;
    }

    if (metodoPago === 'Efectivo' && (!montoPagado || montoPagado < total)) {
      notify('Ingresa un monto en efectivo igual o mayor al total.', 'error');
      return;
    }

    const ventas = JSON.parse(localStorage.getItem('ventas')) || [];
    const nuevaVenta = {
      id: `${localId}-${Date.now()}`,
      local: localId,
      localNombre,
      usuario,
      productos: carrito,
      total,
      metodoPago,
      montoPagado: metodoPago === 'Efectivo' ? montoPagado : total,
      vuelto: metodoPago === 'Efectivo' ? montoPagado - total : 0,
      fecha: new Date().toISOString(),
    };

    localStorage.setItem('ventas', JSON.stringify([...ventas, nuevaVenta]));
    setCarrito([]);
    setMontoEfectivo('');
    notify(`Venta registrada con ${metodoPago} por $${total.toLocaleString('es-CL')}.`, 'success');
  };

  return (
    <>
      <section className="cash-panel">
        <div>
          <p className="eyebrow">Caja</p>
          <h2>{cajaAbierta ? 'Caja abierta' : 'Caja cerrada'}</h2>
          <p className="muted">{localNombre} - {usuario}</p>
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
              <p className="muted">Aun no hay productos agregados.</p>
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
            <label htmlFor={`metodo-pago-${localId}`}>Metodo de pago</label>
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
