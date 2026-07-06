import React, { useEffect, useState } from 'react';
import Perfil from './Perfil';
import { cerrarSesion } from '../models/authModel';
import '../styles/views/delivery.css';

function Delivery({ navigate, notify }) {
  const [sesionActual, setSesionActual] = useState(() => JSON.parse(localStorage.getItem("sesion")));
  const sesion = sesionActual;

  useEffect(() => {
    const actualizarSesion = () => setSesionActual(JSON.parse(localStorage.getItem("sesion")));
    window.addEventListener('sesion-actualizada', actualizarSesion);
    return () => window.removeEventListener('sesion-actualizada', actualizarSesion);
  }, []);
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }
  const datosAutoCompletos = Boolean(sesion.patente && sesion.colorAuto && sesion.marcaAuto);

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">delivery</p>
          <h1>Panel de repartos</h1>
        </div>
        <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button>
      </header>

      <Perfil notify={notify} />

      <section className="work-panel">
        <h2>{datosAutoCompletos ? 'Pedidos asignados' : 'Completa los datos del vehiculo'}</h2>
        <p className="muted">
          {datosAutoCompletos
            ? 'Aqui apareceran los pedidos pendientes de entrega.'
            : 'Ingresa patente, color del auto y marca en Editar perfil para comenzar.'}
        </p>
      </section>
    </main>
  );
}
export default Delivery;
