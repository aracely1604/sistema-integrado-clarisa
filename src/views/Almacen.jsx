import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';

import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function Almacen({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth(); //cambiar y usar: const { usuario } = useAuth();
  // ejemplo de uso:
  // usuario.nombre = juan(muestra el nombre del que inicio sesion)
  // usuario.rol = cajero(muestra el rol)
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  const usuario = sesion.nombre || "cajero"; //ideal no usar esto, limitas a una sola la informacion del usuario} 
  const productos = obtenerProductosLocal('almacen');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Cajero: {usuario}</p> 
          <h1>Punto de Venta Almacén</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button onClick={() => navigate('/portal')} className="btn btn-secondary">
            Volver al panel
          </button>
          <button onClick={() => cerrarSesion(navigate)} className="btn btn-danger">
            Cerrar sesión
          </button>
        </div>
      </header>

      <Perfil notify={notify} />

      <PuntoVenta localId="almacen" localNombre="Almacén" productos={productos} usuario={usuario} notify={notify} />
    </main>
  );
}

export default Almacen;
