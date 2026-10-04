import React, { useState } from 'react';
import { actualizarMiPerfil } from '../controllers/EmpleadoControl';
import { useAuth } from '../controllers/AuthContext';
import '../styles/views/profile.css';

function Perfil({ notify }) {
  const { usuario: sesion } = useAuth();
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState({ telefono: sesion?.telefono || '', email: sesion?.email || '' });
  if (!sesion) return null;

  const abrirEdicion = () => {
    setForm({ telefono: sesion.telefono || '', email: sesion.email || '' });
    setAbierto(true);
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    if (!form.email.trim()) return notify('Ingresa tu correo electrónico.', 'error');
    try {
      const datosActualizados = await actualizarMiPerfil(sesion, {
        email: form.email.trim().toLowerCase(),
        telefono: form.telefono.trim(),
      });
      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      localStorage.setItem('usuarios', JSON.stringify(usuarios.map((usuario) => (
        usuario.uid === sesion.uid || usuario.rut === sesion.rut ? { ...usuario, ...datosActualizados } : usuario
      ))));
      localStorage.setItem('sesion', JSON.stringify({ ...sesion, ...datosActualizados }));
      window.dispatchEvent(new Event('sesion-actualizada'));
      setAbierto(false);
      notify('Perfil actualizado.', 'success');
    } catch (error) {
      console.error('Error al actualizar perfil:', error);
      notify('No se pudo actualizar el perfil.', 'error');
    }
  };

  return (
    <section className="profile-panel">
      <div className="profile-summary">
        <span><strong>{sesion.nombre || sesion.user} {sesion.apellido || ''}</strong><small>{sesion.email || sesion.user}</small></span>
        <button className="btn btn-secondary" type="button" onClick={abrirEdicion}>Editar perfil</button>
      </div>
      {abierto && <div className="profile-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setAbierto(false); }}>
        <form className="profile-modal" onSubmit={guardarPerfil} role="dialog" aria-modal="true" aria-labelledby="editar-perfil-titulo">
          <div className="modal-head"><h2 id="editar-perfil-titulo">Editar perfil</h2><button className="icon-btn" type="button" aria-label="Cerrar" onClick={() => setAbierto(false)}>×</button></div>
          <label>Correo electrónico<input className="field" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
          <label>Teléfono<input className="field" type="tel" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
          <div className="modal-actions"><button className="btn btn-secondary" type="button" onClick={() => setAbierto(false)}>Cancelar</button><button className="btn btn-primary" type="submit">Guardar cambios</button></div>
        </form>
      </div>}
    </section>
  );
}

export default Perfil;
