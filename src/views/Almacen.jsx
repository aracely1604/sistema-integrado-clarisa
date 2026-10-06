import React from 'react';
import Perfil from './Perfil';
import PuntoVenta from './PuntoVenta';
import Reloj from './Reloj';
import { cerrarSesion } from '../models/authModel';
import { obtenerProductosLocal } from '../models/productModel';

import { useAuth } from '../controllers/AuthContext';
import { useLocation, useNavigate } from 'react-router-dom';

function Almacen({ notify }) {
  const navigate = useNavigate();
  const location = useLocation();
  const rutaVolver = location.state?.volverA || '/portal';
  const { usuario: sesion } = useAuth(); //cambiar y usar: const { usuario } = useAuth();
  // ejemplo de uso:
  // usuario.nombre = juan(muestra el nombre del que inicio sesion)
  // usuario.rol = cajero(muestra el rol)
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

<<<<<<< HEAD
  const usuario = sesion.nombre || sesion.user || sesion.email || 'cajero';
=======
  const usuario = sesion.nombre || "cajero"; //ideal no usar esto, limitas a una sola la informacion del usuario} 
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
  const productos = obtenerProductosLocal('almacen');

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
<<<<<<< HEAD
          <p className="eyebrow">Cajero almacén: {usuario}</p>
=======
          <p className="eyebrow">Cajero: {usuario}</p> 
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
          <h1>Punto de Venta Almacén</h1>
          <Reloj />
        </div>
        <div className="admin-actions">
          <button onClick={() => navigate(rutaVolver)} className="btn btn-secondary">
            {rutaVolver === '/admin' ? 'Volver a administración' : 'Volver al panel'}
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
