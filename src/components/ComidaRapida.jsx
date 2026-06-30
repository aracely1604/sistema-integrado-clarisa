import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import { cerrarSesion } from '../utils/auth';

function ComidaRapida({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = [
    { nombre: 'Completo', precio: 2200 },
    { nombre: 'Hamburguesa', precio: 3500 },
    { nombre: 'Papas fritas', precio: 2000 },
    { nombre: 'Bebida', precio: 1200 },
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero comida rapida: {usuario}</p>
          <h1>Comida rapida</h1>
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="comida_rapida" localNombre="Comida rapida" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default ComidaRapida;
