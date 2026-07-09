import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';

import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function ComidaRapida({ notify }) {
  const navigate = useNavigate();
    const { usuario: sesion } = useAuth();

  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.nombre || "cajero";
  const productos = obtenerProductosLocal('comida_rapida');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero comida rápida: {usuario}</p>
          <h1>Punto de Venta Comida Rápida</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/portal')}>Volver al panel</button>
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="comida_rapida" localNombre="Comida Rápida" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default ComidaRapida;
