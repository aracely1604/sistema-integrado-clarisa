import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import { cerrarSesion } from '../utils/auth';

function Almacen({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = [
    { nombre: 'Producto de prueba', precio: 1000 },
    { nombre: 'Bebida lata', precio: 1200 },
    { nombre: 'Pan', precio: 800 },
    { nombre: 'Leche', precio: 1400 },
  ];

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

      <PuntoVenta localId="almacen" localNombre="Almacen" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default Almacen;
