import React, { useState } from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';
import MonitorPedidosWeb from './MonitorPedidosWeb';

import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function ComidaRapida({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth();
  
  const [mostrarMonitor, setMostrarMonitor] = useState(false);

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
        <div className="admin-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => setMostrarMonitor(true)}>Ver Pedidos Online</button>

          <button className="btn btn-secondary" onClick={() => navigate('/admin')}>Volver a administración</button>

          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="comida_rapida" localNombre="Comida Rápida" productos={productos} usuario={usuario} notify={notify} />

      {mostrarMonitor && (
          <div className="modal-backdrop online-monitor-backdrop">
            <div className="modal-card online-monitor-modal">
              <MonitorPedidosWeb setMostrarMonitor={setMostrarMonitor} notify={notify} />
            </div>
          </div>
      )}
    </main>
  );
}


export default ComidaRapida;
