import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PersonalModal from '../screens/PersonalScreen';
import LocalesModal from '../screens/LocalesScreen';
import { logoutEmpleado } from '../controllers/AuthControl';
import { useAuth } from '../controllers/AuthContext';
import '../css/Portal.css';


function Portal() {
  const navigate = useNavigate();
  const [mostrarPersonal, setMostrarPersonal] = useState(false);
  const [mostrarLocales, setMostrarLocales] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const { usuario } = useAuth();

  // TODO: reemplazar por datos reales desde useAuth() (AuthContext)
  const nombreUsuario = usuario?.nombre || "prueba";
  const nombreRol = usuario?.rol || "prueba";

  const nombresLocales = {
    almacen: 'Almacén',
    cafeteria: 'Cafetería',
    comidaRapida: 'ComidaRapida',
  };

  const tituloModuloVentas = () => {
    const rol = (nombreRol || '').toLowerCase();

    if (rol === 'admin' || rol === 'administrador') {
      return nombreRol;
    }

    if (rol === 'cajero') {
      const localAsignado = usuario.localAsignado || {};
      const localKey = Object.keys(nombresLocales).find((key) => localAsignado[key]);
      return localKey ? nombresLocales[localKey] : 'Panel admin';
    }

    return 'Admin';
  };

  const irModuloVentas = () => {
    const rol = (nombreRol || '').toLowerCase();

    if (rol === 'admin' || rol === 'administrador') {
      navigate('/admin');
      return;
    }

    if (rol === 'cajero') {
      const localAsignado = usuario.localAsignado || {};

      if (localAsignado.almacen) {
        navigate('/almacen');
      } else if (localAsignado.cafeteria) {
        navigate('/cafeteria');
      } else if (localAsignado['comidaRapida']) {
        navigate('/delivery');
      } else {
        console.warn('El cajero no tiene un local asignado.');
      }
      return;
    }

    console.warn(`Rol no reconocido para navegación: ${nombreRol}`);
  };

  const irModuloInventario = () => {
    navigate('/alertas'); // Coincide con la <Route path="/alertas" element={<AlertasScreen />} /> de App.jsx
  };

  const handleSalir = async () => {
    if (saliendo) return; // evita doble click mientras se procesa
    setSaliendo(true);
    try {
      await logoutEmpleado();
    } catch (err) {
      console.error('Error al cerrar sesión:', err);
      // Aunque falle el registro de salida/estado en la BD, igual sacamos al usuario
    } finally {
      setSaliendo(false);
      navigate('/login');
    }
  };

  return (
    <main className="portal-page">
      <section className="portal-shell">
        <div className="portal-header">
          <div>
            <p className="eyebrow">Panel principal</p>
            <h1>Sistema Integrado</h1>
            <p className="muted">
              Bienvenido/a, <b>{nombreUsuario}</b> ({nombreRol})
            </p>
          </div>
          <button className="btn btn-danger" onClick={handleSalir} disabled={saliendo}>
            {saliendo ? 'Saliendo...' : 'Salir'}
          </button>
        </div>

        <div className="action-grid">
          <button onClick={irModuloVentas} className="module-card module-green">
            <span className="module-icon">Caja</span>
            <strong>{tituloModuloVentas()}</strong>
            <small>Ver resumen de ventas y control general.</small>
          </button>

          <button onClick={irModuloInventario} className="module-card module-blue">
            <span className="module-icon">Stock</span>
            <strong>Inventario</strong>
            <small>Consulta y control de productos.</small>
          </button>

          <button onClick={() => setMostrarPersonal(true)} className="module-card module-orange">
            <span className="module-icon">User</span>
            <strong>Crear usuarios</strong>
            <small>Alta rápida para admin, cajero o delivery.</small>
          </button>

          <button onClick={() => setMostrarLocales(true)} className="module-card module-purple">
            <span className="module-icon">Turno</span>
            <strong>Horarios de locales</strong>
            <small>Define entrada y salida de cafetería, almacén y comida rápida.</small>
          </button>
        </div>
      </section>

      {/* Modal de gestión de usuario (mismo componente que en PersonalScreen) */}
      <PersonalModal
        visible={mostrarPersonal}
        onClose={() => setMostrarPersonal(false)}
      />

      {/* Modal para configurar el horario fijo de cada local */}
      <LocalesModal
        visible={mostrarLocales}
        onClose={() => setMostrarLocales(false)}
      />
    </main>
  );
}

export default Portal;