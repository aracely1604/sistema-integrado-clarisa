import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerMetodosPagoLocal, obtenerProductosLocal } from '../models/productModel';

function Cafeteria({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = obtenerProductosLocal('cafeteria');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero cafeteria: {usuario}</p>
          <h1>Punto de Venta Cafetería</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button className="btn btn-secondary" onClick={() => navigate('admin')}>Volver al panel</button>
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta
        localId="cafeteria"
        localNombre="Cafetería"
        productos={productos}
        usuario={usuario}
        notify={notify}
        metodosPago={obtenerMetodosPagoLocal('cafeteria')}
      />
    </main>
  );
}

export default Cafeteria;
