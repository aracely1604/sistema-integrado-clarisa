import React, { useState } from 'react';
import Perfil from './Perfil';
import { cerrarSesion } from '../utils/auth';

function Almacen({ navigate, notify }) {
  // Variables de estado (reemplazan a tus let globales)
  const [carrito, setCarrito] = useState([]);
  
  // Tu sesión local
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }
  const usuario = sesion.user || "cajero";

  // Función de prueba (reemplaza a tus function() de Javascript)
  const agregarAlCarrito = () => {
      setCarrito([...carrito, { nombre: 'Producto de prueba', precio: 1000 }]);
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero: {usuario}</p>
          <h1>Punto de Venta</h1>
        </div>
        <button onClick={() => cerrarSesion(navigate)} className="btn btn-danger">
          Cerrar sesion
        </button>
      </header>

      <Perfil notify={notify} />

      <section className="pos-layout">
        <div className="work-panel">
          <h2>Productos</h2>
          <button onClick={agregarAlCarrito} className="btn btn-primary">Agregar producto de prueba</button>
        </div>
        <aside className="work-panel">
          <h2>Carrito</h2>
          <div className="cart-list">
            {carrito.length === 0 ? (
              <p className="muted">Aun no hay productos agregados.</p>
            ) : (
              carrito.map((item, index) => (
                <div className="cart-row" key={`${item.nombre}-${index}`}>
                  <span>{item.nombre}</span>
                  <strong>${item.precio.toLocaleString('es-CL')}</strong>
                </div>
              ))
            )}
          </div>
        </aside>
      </section>

    </main>
  );
}

export default Almacen;
