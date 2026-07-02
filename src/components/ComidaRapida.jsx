import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
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
    { nombre: 'Churrasco', precio: 4200 },
    { nombre: 'Nuggets', precio: 2800 },
    { nombre: 'Empanada', precio: 1600 },
    { nombre: 'Helado', precio: 1500 },
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero comida rapida: {usuario}</p>
          <h1>Punto de Venta Comida Rápida</h1>
          <Reloj />
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="comida_rapida" localNombre="Comida Rápida" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default ComidaRapida;
