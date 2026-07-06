import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';

function Almacen({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = obtenerProductosLocal('almacen');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero: {usuario}</p>
          <h1>Punto de Venta Almacén</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button onClick={() => navigate('admin')} className="btn btn-secondary">
            Volver al panel
          </button>
          <button onClick={() => cerrarSesion(navigate)} className="btn btn-danger">
            Cerrar sesion
          </button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="almacen" localNombre="Almacén" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default Almacen;
