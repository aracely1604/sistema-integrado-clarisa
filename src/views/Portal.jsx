import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../firebase';
import { useAuth } from '../controllers/AuthContext';
import { cerrarSesion, obtenerOpcionRol, obtenerVistaInicial, opcionesRol } from '../models/authModel';
import PersonalModal from '../screens/PersonalScreen';
import LocalesModal from '../screens/LocalesScreen';
import '../styles/views/portal.css';
import { Joyride, EVENTS, STATUS } from 'react-joyride';
import TourGuiado from '../components/TourGuiado';

// Tour de la ventana "Aprobar solicitudes" (HU-50). Los pasos cuyo elemento no exista se omiten
// (por ejemplo, si no hay solicitudes pendientes solo se explican la lista y los botones).
const PASOS_TOUR_SOLICITUDES = [
  { target: '[data-tour="sol-lista"]', content: 'Aquí aparecen las cuentas nuevas que esperan aprobación. Si no hay ninguna, verás el aviso "No hay solicitudes pendientes".' },
  { target: '[data-tour="sol-datos"]', content: 'Revisa los datos de quien se registró: nombre, RUT, correo y teléfono.' },
  { target: '[data-tour="sol-rol"]', content: 'Elige el rol que tendrá esta persona (por ejemplo, cajero de un local o delivery). El rol define a qué podrá acceder.' },
  { target: '[data-tour="sol-acciones"]', content: '"Aceptar" activa la cuenta con el rol elegido y "No aceptar" rechaza la solicitud.' },
  { target: '[data-tour="sol-botones"]', content: 'Las solicitudes se actualizan solas en tiempo real. "Cerrar" te devuelve al panel principal.' },
];

function Portal({ navigate, notify }) {
  const [mostrarSolicitudes, setMostrarSolicitudes] = useState(false);
  const [mostrarUsuarios, setMostrarUsuarios] = useState(false);
  const [mostrarTurnos, setMostrarTurnos] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [rolesSeleccionados, setRolesSeleccionados] = useState({});
  const { usuario } = useAuth();
  const [sesionGuardada] = useState(() => JSON.parse(localStorage.getItem('sesion') || 'null'));
  // Tutorial guiado (HU-49): se abre solo la primera vez y se puede reactivar con el botón "Ver tutorial".
  const [tutorialManual, setTutorialManual] = useState(false);
  const [tutorialCerrado, setTutorialCerrado] = useState(false);
  const [tutorialClave, setTutorialClave] = useState(0); // cambia en cada reactivación para reiniciar desde el paso 1
  // Firebase es la fuente principal; localStorage permite completar la
  // transición inmediatamente después de iniciar sesión.
  const sesion = usuario || sesionGuardada;

  // Activación automática: se abre solo si ya cargó el usuario real de Firestore y aún no tiene
  // registrado el tutorial como visto. "Ver tutorial" lo abre de forma manual en cualquier momento.
  const abrirTutorialSolo = Boolean(usuario?.uid) && !usuario?.onboarding?.completado && !tutorialCerrado;
  const tutorialActivo = tutorialManual || abrirTutorialSolo;

  const guardarEstadoTutorial = async (estado) => {
    if (!usuario?.uid) return;
    try {
      await updateDoc(doc(db, 'usuarios', usuario.uid), {
        onboarding: { completado: true, estado, fecha: new Date().toISOString() },
      });
    } catch (error) {
      console.error('No se pudo guardar el estado del tutorial:', error);
    }
  };

  const manejarEventoTutorial = (datos) => {
    if (datos.type !== EVENTS.TOUR_END) return;
    setTutorialManual(false);
    setTutorialCerrado(true);
    guardarEstadoTutorial(datos.status === STATUS.SKIPPED ? 'omitido' : 'completado');
  };

  const reactivarTutorial = () => {
    setTutorialClave((clave) => clave + 1);
    setTutorialManual(true);
  };

  useEffect(() => {
    if (!sesion) {
      navigate('login');
      return;
    }

    if (sesion.rol !== 'admin' && sesion.rol !== 'cajero') navigate(obtenerVistaInicial(sesion));
  }, [sesion, navigate]);

  useEffect(() => {
    if (!sesion || sesion.rol !== 'admin') return undefined;

    const consulta = query(collection(db, 'solicitudesUsuarios'), where('estado', '==', 'pendiente'));
    const cancelarEscucha = onSnapshot(
      consulta,
      (resultado) => {
        const pendientes = resultado.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        setSolicitudes(pendientes);
        setRolesSeleccionados((actuales) => {
          const siguientes = { ...actuales };
          pendientes.forEach((solicitud) => {
            if (!siguientes[solicitud.id]) siguientes[solicitud.id] = 'cajero_almacen';
          });
          return siguientes;
        });
      },
      (error) => {
        console.error('No se pudieron escuchar solicitudes:', error);
        notify('No se pudieron escuchar las solicitudes de Firebase.', 'error');
      },
    );

    return () => cancelarEscucha();
  }, [sesion, notify]);

  const marcarNotificacionLeida = async (uid) => {
    try {
      await updateDoc(doc(db, 'notificacionesAdmin', `usuario-${uid}`), { leida: true });
    } catch (error) {
      console.error('No se pudo marcar la notificación como leída:', error);
    }
  };

  const aceptarSolicitud = async (solicitud) => {
    const opcionRol = obtenerOpcionRol(rolesSeleccionados[solicitud.id]);
    const aprobadoEn = new Date().toISOString();
    const usuarioAprobado = {
      uid: solicitud.uid,
      user: solicitud.user,
      nombre: solicitud.nombre,
      apellido: solicitud.apellido,
      rut: solicitud.rut,
      telefono: solicitud.telefono || '',
      rol: opcionRol.rol,
      local: opcionRol.local,
      estado: 'activo',
      creadoEn: solicitud.creadaEn || aprobadoEn,
      aprobadoEn,
      aprobadoPor: sesion.user || sesion.email || 'administrador',
    };

    try {
      await setDoc(doc(db, 'usuarios', solicitud.uid), usuarioAprobado);
      await updateDoc(doc(db, 'solicitudesUsuarios', solicitud.id), {
        estado: 'aceptada',
        rolAsignado: opcionRol.label,
        rolAsignadoValue: rolesSeleccionados[solicitud.id] || opcionRol.value,
        aprobadaEn: aprobadoEn,
        aprobadaPor: sesion.user || sesion.email || 'administrador',
      });
      await marcarNotificacionLeida(solicitud.uid);

      const usuariosLocales = JSON.parse(localStorage.getItem('usuarios')) || [];
      const usuariosSinDuplicado = usuariosLocales.filter((usuario) => usuario.uid !== solicitud.uid && usuario.user !== solicitud.user);
      localStorage.setItem('usuarios', JSON.stringify([...usuariosSinDuplicado, usuarioAprobado]));

      notify('Solicitud aceptada. El otro equipo verá el cambio al instante.', 'success');
    } catch (error) {
      console.error('No se pudo aprobar solicitud:', error);
      notify('No se pudo aprobar la solicitud en Firebase.', 'error');
    }
  };

  const denegarSolicitud = async (solicitud) => {
    try {
      await updateDoc(doc(db, 'solicitudesUsuarios', solicitud.id), {
        estado: 'rechazada',
        rechazadaEn: new Date().toISOString(),
        rechazadaPor: sesion.user || sesion.email || 'administrador',
      });
      await marcarNotificacionLeida(solicitud.uid);
      notify('Solicitud rechazada. El otro equipo verá el cambio al instante.', 'success');
    } catch (error) {
      console.error('No se pudo rechazar solicitud:', error);
      notify('No se pudo rechazar la solicitud en Firebase.', 'error');
    }
  };

  if (!sesion || !['admin', 'cajero'].includes(sesion.rol)) return null;
  const esCajero = sesion.rol === 'cajero';
  const rutaCaja = ({ almacen: 'almacen', cafeteria: 'cafeteria', comida_rapida: 'comidaRapida' })[sesion.local] || 'almacen';

  return (
    <main className="portal-page">
      <Joyride
        key={tutorialClave}
        run={tutorialActivo}
        continuous
        onEvent={manejarEventoTutorial}
        options={{
          skipBeacon: true,
          showProgress: true,
          buttons: ['back', 'close', 'skip', 'primary'],
        }}
        locale={{
          back: 'Anterior',
          close: 'Cerrar',
          last: 'Finalizar',
          next: 'Siguiente',
          nextWithProgress: 'Siguiente ({current} de {total})',
          skip: 'Saltar',
        }}
        steps={[
          {
            target: '[data-tour="ventas"]',
            content: 'Aquí revisas el resumen de ventas y el control general de tu local.',
          },
          {
            target: '[data-tour="inventario"]',
            content: 'Desde aquí consultas y controlas el stock disponible de productos.',
          },
          {
            target: '[data-tour="solicitudes"]',
            content: 'Aquí revisas y apruebas o rechazas las cuentas nuevas que esperan acceso al sistema.',
          },
          {
            target: '[data-tour="usuarios"]',
            content: 'Consulta, edita y administra los usuarios registrados en el sistema.',
          },
          {
            target: '[data-tour="horarios"]',
            content: 'Configura los turnos de cafetería, almacén, comida rápida y delivery.',
          },
        ]}
      />
      <section className="portal-shell">
        <div className="portal-header">
          <div>
            <p className="eyebrow">Panel principal</p>
            <h1>Sistema Integrado</h1>
            <p className="muted">
              Bienvenido/a, <b>{sesion.nombre || sesion.user || sesion.email}</b> ({esCajero ? `cajero · ${sesion.local || 'almacén'}` : 'administrador'})
            </p>
          </div>
          <button
            className="btn btn-danger"
            onClick={async () => {
              await signOut(auth);
              cerrarSesion(navigate);
            }}
          >
            Salir
          </button>
        </div>

        <div className="action-grid">
          {esCajero ? <>
            <button onClick={() => navigate(rutaCaja)} className="module-card module-green"><span className="module-icon">Caja</span><strong>Mi caja</strong><small>Ingresar a la caja de {sesion.local || 'almacén'} asignada a tu cuenta.</small></button>
            <button data-tour="inventario" onClick={() => navigate('alertas')} className="module-card module-blue"><span className="module-icon">Stock</span><strong>Inventario</strong><small>Consultar el inventario.</small></button>
            <button onClick={() => navigate('perfil')} className="module-card module-users"><span className="module-icon">Perfil</span><strong>Mi perfil</strong><small>Ver tus datos e historial y editar tu teléfono.</small></button>
          </> : <>
          <button data-tour="ventas" onClick={() => navigate('admin')} className="module-card module-green">
            <span className="module-icon">Caja</span>
            <strong>Panel admin</strong>
            <small>Ver resumen de ventas y control general.</small>
          </button>

          <button data-tour="inventario" onClick={() => navigate('alertas')} className="module-card module-blue">
            <span className="module-icon">Stock</span>
            <strong>Inventario</strong>
            <small>Consulta y control de productos.</small>
          </button>

          <button data-tour="solicitudes" onClick={() => setMostrarSolicitudes(true)} className="module-card module-orange">
            <span className="module-icon">User</span>
            <strong>Solicitudes</strong>
            <small>{solicitudes.length} cuenta(s) esperando aprobación.</small>
          </button>

          <button data-tour="usuarios" onClick={() => setMostrarUsuarios(true)} className="module-card module-users">
            <span className="module-icon">Users</span>
            <strong>Ver usuarios</strong>
            <small>Consulta, edita y administra los usuarios registrados.</small>
          </button>

          <button data-tour="horarios" onClick={() => setMostrarTurnos(true)} className="module-card module-green">
            <span className="module-icon">Turno</span>
            <strong>Horarios de locales</strong>
            <small>Configura los turnos de cafetería, almacén, comida rápida y delivery.</small>
          </button>
          <button onClick={() => navigate('perfil')} className="module-card module-users">
            <span className="module-icon">Perfil</span>
            <strong>Mi perfil</strong>
            <small>Consulta tu información e historial y edita tu teléfono.</small>
          </button>
          </>}
        </div>
      </section>

      <button
        type="button"
        className="tutorial-fab"
        onClick={reactivarTutorial}
        aria-label="Ver tutorial"
        title="Ver tutorial"
      >
        ?
      </button>

      {mostrarSolicitudes && (
        <div className="modal-backdrop">
          <section className="modal-card modal-card-large request-modal">
            <div className="modal-head request-modal-head">
              <div>
                <p className="eyebrow">Nuevas cuentas</p>
                <h2>Aprobar solicitudes</h2>
                <p className="muted">Revisa los datos, asigna un rol y acepta o rechaza cada cuenta.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TourGuiado variante="encabezado" zIndex={3000} steps={PASOS_TOUR_SOLICITUDES} />
                <button type="button" className="icon-btn" onClick={() => setMostrarSolicitudes(false)}>X</button>
              </div>
            </div>

            <div data-tour="sol-lista" className="request-list">
              {solicitudes.length === 0 ? (
                <p className="muted request-empty">No hay solicitudes pendientes.</p>
              ) : (
                solicitudes.map((solicitud) => (
                  <article className="request-row" key={solicitud.id}>
                    <div data-tour="sol-datos" className="request-top">
                      <span className="request-avatar">
                        {(solicitud.nombre || 'U').slice(0, 1)}{(solicitud.apellido || '').slice(0, 1)}
                      </span>
                      <div className="request-data">
                        <strong>{solicitud.nombre} {solicitud.apellido}</strong>
                        <span>RUT: {solicitud.rut}</span>
                        <span>Correo: {solicitud.user}</span>
                        <span>Teléfono: {solicitud.telefono || '-'}</span>
                      </div>
                    </div>

                    <label data-tour="sol-rol" className="request-role">
                      Rol
                      <select
                        className="field"
                        value={rolesSeleccionados[solicitud.id] || 'cajero_almacen'}
                        onChange={(e) => setRolesSeleccionados({ ...rolesSeleccionados, [solicitud.id]: e.target.value })}
                      >
                        {opcionesRol.map((opcion) => (
                          <option value={opcion.value} key={opcion.value}>{opcion.label}</option>
                        ))}
                      </select>
                    </label>

                    <div data-tour="sol-acciones" className="request-actions">
                      <button className="btn btn-danger" onClick={() => denegarSolicitud(solicitud)}>
                        No aceptar
                      </button>
                      <button className="btn btn-primary" onClick={() => aceptarSolicitud(solicitud)}>
                        Aceptar
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div data-tour="sol-botones" className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => notify('Las solicitudes se actualizan en tiempo real.', 'info')}>Actualizar</button>
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarSolicitudes(false)}>Cerrar</button>
            </div>
          </section>
        </div>
      )}

      <PersonalModal
        visible={mostrarUsuarios}
        onClose={() => setMostrarUsuarios(false)}
      />

      <LocalesModal
        visible={mostrarTurnos}
        onClose={() => setMostrarTurnos(false)}
      />
    </main>
  );
}

export default Portal;
