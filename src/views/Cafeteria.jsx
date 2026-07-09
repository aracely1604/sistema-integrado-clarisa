import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerMetodosPagoLocal, obtenerProductosLocal } from '../models/productModel';

import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function Cafeteria({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth();
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.user || "cajero";
  const productos = obtenerProductosLocal('cafeteria');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero cafetería: {usuario}</p>
          <h1>Punto de Venta Cafetería</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/portal')}>Volver al panel</button>
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta
        localId="cafeteria"
        localNombre="Cafetería"
        productos={productos}
        usuario={usuario}
        notify={notify}
        metodosPago={obtenerMetodosPagoLocal('cafeteria')}
      />
    </main>
  );
}

export default Cafeteria;
