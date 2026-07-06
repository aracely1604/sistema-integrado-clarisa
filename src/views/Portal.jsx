import React, { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
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

  useEffect(() => {
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
  }, []);

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
      aprobadoPor: sesion.user,
    };

    try {
      await setDoc(doc(db, 'usuarios', solicitud.uid), usuarioAprobado);
      await updateDoc(doc(db, 'solicitudesUsuarios', solicitud.id), {
        estado: 'aceptada',
        rolAsignado: opcionRol.label,
        aprobadaEn: aprobadoEn,
        aprobadaPor: sesion.user,
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
        rechazadaPor: sesion.user,
      });
      await marcarNotificacionLeida(solicitud.uid);
      notify('Solicitud rechazada. El otro equipo verá el cambio al instante.', 'success');
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
                <p className="muted">Revisa los datos, asigna un rol y acepta o rechaza cada cuenta.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setMostrarSolicitudes(false)}>X</button>
            </div>

            <div className="request-list">
              {solicitudes.length === 0 ? (
                <p className="muted request-empty">No hay solicitudes pendientes.</p>
              ) : (
                solicitudes.map((solicitud) => (
                  <article className="request-row" key={solicitud.id}>
                    <div className="request-top">
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

                    <label className="request-role">
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
                        Rechazar
                      </button>
                      <button className="btn btn-primary" onClick={() => aceptarSolicitud(solicitud)}>
                        Aceptar
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => notify('Las solicitudes se actualizan en tiempo real.', 'info')}>Actualizar</button>
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarSolicitudes(false)}>Cerrar</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default Portal;
