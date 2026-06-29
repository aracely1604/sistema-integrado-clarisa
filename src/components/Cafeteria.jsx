import React, { useState } from 'react';
import Perfil from './Perfil';
import { cerrarSesion } from '../utils/auth';

function Cafeteria({ navigate, notify }) {
  const [carrito, setCarrito] = useState([]);
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }
  const usuario = sesion.user || "cajero";

  const agregar = (nombre, precio) => {
    setCarrito([...carrito, { nombre, precio }]);
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero cafeteria: {usuario}</p>
          <h1>Cafeteria</h1>
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
      </header>

      <Perfil notify={notify} />

      <section className="pos-layout">
        <div className="work-panel">
          <h2>Productos</h2>
          <button className="btn btn-primary" onClick={() => agregar('Cafe', 1500)}>Agregar cafe ($1500)</button>
        </div>
        <aside className="work-panel">
          <h2>Carrito</h2>
          <p className="muted">{carrito.length} productos agregados.</p>
        </aside>
      </section>
    </main>
  );
}
export default Cafeteria;
