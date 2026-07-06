import React, { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { cerrarSesion, obtenerOpcionRol, obtenerVistaInicial, opcionesRol } from '../models/authModel';
import '../styles/views/portal.css';

function Portal({ navigate, notify }) {
  const [mostrarSolicitudes, setMostrarSolicitudes] = useState(false);
  const [solicitudes, setSolicitudes] = useState([]);
  const [rolesSeleccionados, setRolesSeleccionados] = useState({});
  const sesion = JSON.parse(localStorage.getItem('sesion'));

  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  if (sesion.rol !== 'admin') {
    setTimeout(() => navigate(obtenerVistaInicial(sesion)), 0);
    return null;
  }

  const cargarSolicitudes = async () => {
    try {
      const resultado = await getDocs(collection(db, 'solicitudesUsuarios'));
      const pendientes = resultado.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
      setSolicitudes(pendientes);
      setRolesSeleccionados((actuales) => {
        const siguientes = { ...actuales };
        pendientes.forEach((solicitud) => {
          if (!siguientes[solicitud.id]) siguientes[solicitud.id] = 'cajero_almacen';
        });
        return siguientes;
      });
    } catch (error) {
      console.error('No se pudieron cargar solicitudes:', error);
      notify('No se pudieron cargar las solicitudes de Firebase.', 'error');
    }
  };

  useEffect(() => {
    cargarSolicitudes();
  }, []);

  const enviarCorreoSolicitud = async (solicitud, estado, rolAsignado = '') => {
    const asunto = estado === 'aceptada' ? 'Tu cuenta fue aceptada' : 'Tu cuenta fue rechazada';
    const mensaje =
      estado === 'aceptada'
        ? `Hola ${solicitud.nombre}, tu cuenta fue aceptada. Ya puedes iniciar sesión con el rol ${rolAsignado}.`
        : `Hola ${solicitud.nombre}, tu solicitud de creación de cuenta fue rechazada.`;

    try {
      await setDoc(doc(collection(db, 'mail')), {
        to: [solicitud.user],
        message: {
          subject: asunto,
          text: mensaje,
          html: `<p>${mensaje}</p>`,
        },
        creadaEn: new Date().toISOString(),
        tipo: `cuenta_${estado}`,
      });
      return true;
    } catch (error) {
      console.error('No se pudo preparar el correo:', error);
      return false;
    }
  };

  const marcarNotificacionLeida = async (uid) => {
    try {
      await updateDoc(doc(db, 'notificacionesAdmin', `usuario-${uid}`), { leida: true });
    } catch (error) {
      console.error('No se pudo marcar la notificación como leída:', error);
    }
  };

  const aceptarSolicitud = async (solicitud) => {
    const opcionRol = obtenerOpcionRol(rolesSeleccionados[solicitud.id]);
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
      creadoEn: solicitud.creadaEn || new Date().toISOString(),
      aprobadoEn: new Date().toISOString(),
      aprobadoPor: sesion.user,
    };

    try {
      await setDoc(doc(db, 'usuarios', solicitud.uid), usuarioAprobado);
      const correoPreparado = await enviarCorreoSolicitud(solicitud, 'aceptada', opcionRol.label);
      await deleteDoc(doc(db, 'solicitudesUsuarios', solicitud.id));
      await marcarNotificacionLeida(solicitud.uid);

      const usuariosLocales = JSON.parse(localStorage.getItem('usuarios')) || [];
      const usuariosSinDuplicado = usuariosLocales.filter((usuario) => usuario.uid !== solicitud.uid && usuario.user !== solicitud.user);
      localStorage.setItem('usuarios', JSON.stringify([...usuariosSinDuplicado, usuarioAprobado]));

      setSolicitudes(solicitudes.filter((item) => item.id !== solicitud.id));
      notify(correoPreparado ? 'Solicitud aceptada y correo preparado.' : 'Solicitud aceptada. No se pudo preparar el correo.', correoPreparado ? 'success' : 'info');
    } catch (error) {
      console.error('No se pudo aprobar solicitud:', error);
      notify('No se pudo aprobar la solicitud en Firebase.', 'error');
    }
  };

  const denegarSolicitud = async (solicitud) => {
    try {
      const correoPreparado = await enviarCorreoSolicitud(solicitud, 'rechazada');
      await setDoc(doc(db, 'solicitudesRechazadas', solicitud.id), {
        ...solicitud,
        estado: 'rechazada',
        rechazadaEn: new Date().toISOString(),
        rechazadaPor: sesion.user,
      });
      await deleteDoc(doc(db, 'solicitudesUsuarios', solicitud.id));
      await marcarNotificacionLeida(solicitud.uid);

      setSolicitudes(solicitudes.filter((item) => item.id !== solicitud.id));
      notify(correoPreparado ? 'Solicitud rechazada y correo preparado.' : 'Solicitud rechazada. No se pudo preparar el correo.', correoPreparado ? 'success' : 'info');
    } catch (error) {
      console.error('No se pudo rechazar solicitud:', error);
      notify('No se pudo rechazar la solicitud en Firebase.', 'error');
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
              Bienvenido/a, <b>{sesion.nombre || sesion.user}</b> (administrador)
            </p>
          </div>
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>
            Salir
          </button>
        </div>

        <div className="action-grid">
          <button onClick={() => navigate('admin')} className="module-card module-green">
            <span className="module-icon">Caja</span>
            <strong>Panel admin</strong>
            <small>Ver resumen de ventas y control general.</small>
          </button>

          <button onClick={() => notify('Derivando al Módulo de Inventario (Equipo N 4).', 'info')} className="module-card module-blue">
            <span className="module-icon">Stock</span>
            <strong>Inventario</strong>
            <small>Consulta y control de productos.</small>
          </button>

          <button onClick={() => setMostrarSolicitudes(true)} className="module-card module-orange">
            <span className="module-icon">User</span>
            <strong>Solicitudes</strong>
            <small>{solicitudes.length} cuenta(s) esperando aprobación.</small>
          </button>
        </div>
      </section>

      {mostrarSolicitudes && (
        <div className="modal-backdrop">
          <section className="modal-card modal-card-large request-modal">
            <div className="modal-head request-modal-head">
              <div>
                <p className="eyebrow">Nuevas cuentas</p>
                <h2>Aprobar solicitudes</h2>
                <p className="muted">Revisa los datos, asigna un rol y acepta o deniega cada cuenta.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setMostrarSolicitudes(false)}>X</button>
            </div>

            <div className="request-list">
              {solicitudes.length === 0 ? (
                <p className="muted request-empty">No hay solicitudes pendientes.</p>
              ) : (
                solicitudes.map((solicitud) => (
                  <article className="request-row" key={solicitud.id}>
                    <div className="request-person">
                      <span className="request-avatar">
                        {(solicitud.nombre || 'U').slice(0, 1)}{(solicitud.apellido || '').slice(0, 1)}
                      </span>
                      <div className="request-data">
                        <strong>{solicitud.nombre} {solicitud.apellido}</strong>
                        <span>{solicitud.rut}</span>
                        <small>{solicitud.user}</small>
                        <small>Teléfono: {solicitud.telefono || '-'}</small>
                      </div>
                    </div>

                    <div className="request-controls">
                      <label>
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
                      <div className="request-actions">
                        <button className="btn btn-danger" onClick={() => denegarSolicitud(solicitud)}>
                          Denegar
                        </button>
                        <button className="btn btn-primary" onClick={() => aceptarSolicitud(solicitud)}>
                          Aceptar
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={cargarSolicitudes}>Actualizar</button>
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarSolicitudes(false)}>Cerrar</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Portal;
