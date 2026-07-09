import React, { useState } from 'react';
import { obtenerNombreRol, obtenerOpcionRol, obtenerValorRol, opcionesRol } from '../models/authModel';
import '../styles/views/profile.css';

import { actualizarMiPerfil } from '../controllers/EmpleadoControl';
import { useAuth } from '../controllers/AuthContext';
import { useNavigate } from 'react-router-dom';

function Perfil({ notify }) {
  const navigate = useNavigate();
  const { usuario: sesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(() => ({
    nombre: sesion?.nombre || '',
    apellido: sesion?.apellido || '',
    rut: sesion?.rut || '',
    user: sesion?.email || '',
    telefono: sesion?.telefono || '',
    rol: obtenerValorRol(sesion),
    patente: sesion?.patente || '',
    colorAuto: sesion?.colorAuto || '',
    marcaAuto: sesion?.marcaAuto || '',
  }));

  if (!sesion) return null;

  const esAdmin = sesion.rol === 'admin';
  const esDelivery = sesion.rol === 'delivery';

  const actualizarCampo = (campo, valor) => {
    setForm({ ...form, [campo]: valor });
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    const opcionRol = obtenerOpcionRol(form.rol);

    // A diferencia de la versión anterior, acá NO se hace `...sesion`: solo
    // se envían los campos editables del formulario. Así se evita arrastrar
    // campos ajenos que pueda tener el objeto de sesión en memoria (como
    // `horarioLocal`, que es una instancia de LocalModel y Firestore rechaza
    // por no ser un tipo de dato plano). EmpleadoModel, dentro de
    // actualizarMiPerfil, se encarga de normalizar y completar el resto.
    const datosFormulario = {
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      rut: form.rut.trim(),
      email: form.user.trim().toLowerCase(),
      telefono: form.telefono.trim(),
      ...(esAdmin ? { rol: opcionRol.rol, local: opcionRol.local } : {}),
      ...(esDelivery ? {
        patente: form.patente.trim().toUpperCase(),
        colorAuto: form.colorAuto.trim(),
        marcaAuto: form.marcaAuto.trim(),
      } : {}),
    };

    if (!datosFormulario.nombre || !datosFormulario.apellido || !datosFormulario.rut || !datosFormulario.email) {
      notify('Completa nombres, apellidos, RUT y correo electrónico.', 'error');
      return;
    }

    try {
      const datosActualizados = await actualizarMiPerfil(sesion, datosFormulario);

      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      const usuariosActualizados = usuarios.map((usuario) => {
        const mismoUsuario = usuario.user === sesion.user || usuario.rut === sesion.rut || usuario.uid === sesion.uid;
        return mismoUsuario ? datosActualizados : usuario;
      });

      localStorage.setItem('usuarios', JSON.stringify(usuariosActualizados));
      localStorage.setItem('sesion', JSON.stringify(datosActualizados));
      window.dispatchEvent(new Event('sesion-actualizada'));
      setAbierto(false);
      notify('Perfil actualizado en Firebase.', 'success');
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      if (error.message === 'USUARIO_NO_ENCONTRADO') {
        notify('No se encontro el usuario en Firebase.', 'error');
      } else {
        notify('No se pudo actualizar el perfil en Firebase.', 'error');
      }
    }
  };

  return (
    <section className="profile-panel">
      <button className="profile-summary" onClick={() => setAbierto(!abierto)}>
        <span>
          <strong>{sesion.nombre || sesion.user} {sesion.apellido || ''}</strong>
          <small>{sesion.rut || sesion.user} - {obtenerNombreRol(sesion)}</small>
        </span>
        <b>{abierto ? 'Cerrar perfil' : 'Editar perfil'}</b>
      </button>

      {abierto && (
        <form className="profile-form profile-form-wide" onSubmit={guardarPerfil}>
          <label>
            Nombres
            <input className="field" value={form.nombre} onChange={(e) => actualizarCampo('nombre', e.target.value)} />
          </label>
          <label>
            Apellidos
            <input className="field" value={form.apellido} onChange={(e) => actualizarCampo('apellido', e.target.value)} />
          </label>
          <label>
            RUT
            <input className="field" value={form.rut} onChange={(e) => actualizarCampo('rut', e.target.value)} />
          </label>
          <label>
            Correo electrónico
            <input className="field" type="email" value={form.user} onChange={(e) => actualizarCampo('user', e.target.value)} />
          </label>
          <label>
            Teléfono
            <input className="field" value={form.telefono} onChange={(e) => actualizarCampo('telefono', e.target.value)} />
          </label>
          <label>
            Rol
            {esAdmin ? (
              <select className="field" value={form.rol} onChange={(e) => actualizarCampo('rol', e.target.value)}>
                {opcionesRol.map((opcion) => (
                  <option value={opcion.value} key={opcion.value}>{opcion.label}</option>
                ))}
              </select>
            ) : (
              <input className="field" value={obtenerNombreRol(sesion)} disabled />
            )}
          </label>

          {esDelivery && (
            <>
              <label>
                Patente
                <input className="field" value={form.patente} onChange={(e) => actualizarCampo('patente', e.target.value)} />
              </label>
              <label>
                Color del auto
                <input className="field" value={form.colorAuto} onChange={(e) => actualizarCampo('colorAuto', e.target.value)} />
              </label>
              <label>
                Marca del auto
                <input className="field" value={form.marcaAuto} onChange={(e) => actualizarCampo('marcaAuto', e.target.value)} />
              </label>
            </>
          )}

          <button className="btn btn-primary" type="submit">Guardar perfil</button>
        </form>
      )}
    </section>
  );
}

export default Perfil;