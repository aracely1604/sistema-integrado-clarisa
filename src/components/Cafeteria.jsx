import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import { cerrarSesion } from '../utils/auth';

function Cafeteria({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = [
    { nombre: 'Cafe', precio: 1500 },
    { nombre: 'Te', precio: 1200 },
    { nombre: 'Sandwich', precio: 2500 },
    { nombre: 'Queque', precio: 1800 },
  ];

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

      <PuntoVenta localId="cafeteria" localNombre="Cafeteria" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default Cafeteria;
