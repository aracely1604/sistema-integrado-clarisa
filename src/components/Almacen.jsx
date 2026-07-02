import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../utils/auth';

function Almacen({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = [
    { nombre: 'Arroz 1 kg', precio: 1800 },
    { nombre: 'Bebida lata', precio: 1200 },
    { nombre: 'Pan', precio: 800 },
    { nombre: 'Leche', precio: 1400 },
    { nombre: 'Azucar 1 kg', precio: 1600 },
    { nombre: 'Fideos', precio: 1100 },
    { nombre: 'Aceite 900 ml', precio: 2800 },
    { nombre: 'Huevos docena', precio: 3200 },
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero: {usuario}</p>
          <h1>Punto de Venta Almacén</h1>
          <Reloj />
        </div>
        <button onClick={() => cerrarSesion(navigate)} className="btn btn-danger">
          Cerrar sesion
        </button>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="almacen" localNombre="Almacén" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default Almacen;
