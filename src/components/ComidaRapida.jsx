import React from 'react';
import Perfil from './Perfil';
import { cerrarSesion } from '../utils/auth';

function ComidaRapida({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }
  const usuario = sesion.user || "cajero";

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

      <section className="work-panel">
        <h2>Ventas de comida rapida</h2>
        <p className="muted">Aqui puedes continuar agregando el modulo de productos y pedidos.</p>
      </section>
    </main>
  );
}
export default ComidaRapida;
