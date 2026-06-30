import React, { useEffect, useState } from 'react';

function PuntoVenta({ localId, localNombre, productos, usuario, notify }) {
  const [carrito, setCarrito] = useState([]);
  const [cajaAbierta, setCajaAbierta] = useState(false);

  useEffect(() => {
    const cajas = JSON.parse(localStorage.getItem('cajas')) || [];
    setCajaAbierta(cajas.some((caja) => caja.local === localId && caja.usuario === usuario));
  }, [localId, usuario]);

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
      notify('Vacía el carrito antes de cerrar caja.', 'error');
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

  const total = carrito.reduce((suma, producto) => suma + producto.precio, 0);

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
        </aside>
      </section>
    </>
  );
}

export default PuntoVenta;
