import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
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
    { nombre: 'Capuccino', precio: 2200 },
    { nombre: 'Jugo natural', precio: 2000 },
    { nombre: 'Muffin', precio: 1700 },
    { nombre: 'Ensalada', precio: 2900 },
  ];

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero cafeteria: {usuario}</p>
          <h1>Punto de Venta Cafetería</h1>
          <Reloj />
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta
        localId="cafeteria"
        localNombre="Cafetería"
        productos={productos}
        usuario={usuario}
        notify={notify}
        metodosPago={['Debito', 'Efectivo', 'Transferencia', 'Junaeb', 'Pluxe']}
      />
    </main>
  );
}

export default Cafeteria;
