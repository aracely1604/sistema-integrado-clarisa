import React, { useState } from 'react'; // 1. Agregamos useState
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';
import MonitorPedidosWeb from './MonitorPedidosWeb'; // 2. Importamos el nuevo componente

import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function ComidaRapida({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth();
  
  // 3. Declaramos el estado para abrir/cerrar el monitor
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
          {/* 4. Agregamos el botón junto a los otros botones de arriba */}
          <button className="btn btn-primary" onClick={() => setMostrarMonitor(true)}>Ver Pedidos Online</button>
<<<<<<< HEAD
          <button className="btn btn-secondary" onClick={() => navigate('/admin')}>Volver a administración</button>
=======
          <button className="btn btn-secondary" onClick={() => navigate('/portal')}>Volver al panel</button>
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>Cerrar sesión</button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="comida_rapida" localNombre="Comida Rápida" productos={productos} usuario={usuario} notify={notify} />

      {/* 5. Agregamos el modal al final de la página (antes de cerrar el main) */}
      {mostrarMonitor && (
<<<<<<< HEAD
        <div className="modal-backdrop online-monitor-backdrop">
          <div className="modal-card online-monitor-modal">
            <MonitorPedidosWeb setMostrarMonitor={setMostrarMonitor} notify={notify} />
=======
        <div className="modal-monitor-fondo" style={estilosModalFondo}>
          <div className="modal-monitor-contenido" style={estilosModalContenido}>
            {/* Debes agregar setMostrarMonitor={setMostrarMonitor} */}
            <MonitorPedidosWeb setMostrarMonitor={setMostrarMonitor} />
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
          </div>
        </div>
      )}
    </main>
  );
}
<<<<<<< HEAD
=======
// Estilos rápidos en línea (puedes moverlos a tu archivo CSS después)
const estilosModalFondo = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 9999
};

const estilosModalContenido = {
  backgroundColor: '#fff',
  padding: '20px',
  borderRadius: '8px',
  width: '80%',
  maxWidth: '900px',
  maxHeight: '90vh',
  overflowY: 'auto',
  color: '#000'
};

>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
export default ComidaRapida;
