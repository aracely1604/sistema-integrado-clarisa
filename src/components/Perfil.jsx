import React, { useState } from 'react';

function Perfil({ notify }) {
  const sesion = JSON.parse(localStorage.getItem('sesion'));
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');

  if (!sesion) return null;

  const cambiarContrasena = (e) => {
    e.preventDefault();

    if (actual !== sesion.pass) {
      notify('La contrasena actual no coincide.', 'error');
      return;
    }

    if (nueva.length < 4) {
      notify('La nueva contrasena debe tener al menos 4 caracteres.', 'error');
      return;
    }

    if (nueva !== confirmar) {
      notify('La confirmacion no coincide con la nueva contrasena.', 'error');
      return;
    }

    const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
    const usuariosActualizados = usuarios.map((usuario) => {
      const mismoUsuario = usuario.user === sesion.user || usuario.rut === sesion.rut;
      return mismoUsuario ? { ...usuario, pass: nueva } : usuario;
    });
    const sesionActualizada = { ...sesion, pass: nueva };

    localStorage.setItem('usuarios', JSON.stringify(usuariosActualizados));
    localStorage.setItem('sesion', JSON.stringify(sesionActualizada));
    setActual('');
    setNueva('');
    setConfirmar('');
    setAbierto(false);
    notify('Contrasena actualizada correctamente.', 'success');
  };

  return (
    <section className="profile-panel">
      <button className="profile-summary" onClick={() => setAbierto(!abierto)}>
        <span>
          <strong>{sesion.nombre || sesion.user}</strong>
          <small>{sesion.rut || sesion.user} - {sesion.rol}</small>
        </span>
        <b>{abierto ? 'Cerrar perfil' : 'Perfil'}</b>
      </button>

      {abierto && (
        <form className="profile-form" onSubmit={cambiarContrasena}>
          <label>
            Contrasena actual
            <input className="field" type="password" value={actual} onChange={(e) => setActual(e.target.value)} />
          </label>
          <label>
            Nueva contrasena
            <input className="field" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
          </label>
          <label>
            Confirmar contrasena
            <input className="field" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit">Cambiar contrasena</button>
        </form>
      )}
    </section>
  );
}

export default Perfil;
