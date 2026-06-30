import React from 'react';
import Perfil from './Perfil';
import { cerrarSesion } from '../utils/auth';

function Delivery({ navigate, notify }) {
  const sesion = JSON.parse(localStorage.getItem("sesion"));
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Delivery</p>
          <h1>Panel de repartos</h1>
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesion</button>
      </header>

      <Perfil notify={notify} />

      <section className="work-panel">
        <h2>Pedidos asignados</h2>
        <p className="muted">Aqui apareceran los pedidos pendientes de entrega.</p>
      </section>
    </main>
  );
}
export default Delivery;
