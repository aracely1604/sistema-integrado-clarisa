import React, { useState } from 'react';
import { cerrarSesion, obtenerOpcionRol, obtenerVistaInicial, opcionesRol, rutConFormatoValido, rutValido } from '../utils/auth';

function Portal({ navigate, notify }) {
  const [mostrarCrear, setMostrarCrear] = useState(false);
  const [form, setForm] = useState({
    nombre: '',
    apellido: '',
    rut: '',
    rol: 'cajero_almacen',
  });
  let sesion = JSON.parse(localStorage.getItem("sesion"));
  
  if (!sesion) {
    setTimeout(() => navigate('login'), 0);
    return null;
  }

  if (sesion.rol !== 'admin') {
    setTimeout(() => navigate(obtenerVistaInicial(sesion)), 0);
    return null;
  }

  let nombreRol = 'Administrador';

  const irModuloVentas = () => {
    navigate('admin');
  };

  const actualizarCampo = (campo, valor) => {
    setForm({ ...form, [campo]: valor });
  };

  const crearUsuario = (e) => {
    e.preventDefault();
    const nombre = form.nombre.trim();
    const apellido = form.apellido.trim();
    const rut = form.rut.trim();

    if (!nombre || !apellido || !rut) {
      notify('Completa nombre, apellido y RUT para crear el usuario.', 'error');
      return;
    }

    if (!rutConFormatoValido(rut)) {
      notify('El RUT debe tener puntos y guion. Ejemplo: 12.345.678-9', 'error');
      return;
    }

    if (!rutValido(rut)) {
      notify('El RUT no es valido: revisa el digito verificador.', 'error');
      return;
    }

    const usuarios = JSON.parse(localStorage.getItem("usuarios")) || [];
    if (usuarios.some((usuario) => usuario.rut === rut || usuario.user === rut)) {
      notify('Ya existe un usuario con ese RUT.', 'error');
      return;
    }

    const opcionRol = obtenerOpcionRol(form.rol);
    const nuevoUsuario = {
      user: rut,
      pass: rut,
      nombre,
      apellido,
      rut,
      rol: opcionRol.rol,
      local: opcionRol.local,
    };

    localStorage.setItem("usuarios", JSON.stringify([...usuarios, nuevoUsuario]));
    setForm({ nombre: '', apellido: '', rut: '', rol: 'cajero_almacen' });
    setMostrarCrear(false);
    notify(`Usuario creado. Puede ingresar con RUT ${rut}.`, 'success');
  };

  return (
    <main className="portal-page">
      <section className="portal-shell">
        <div className="portal-header">
          <div>
            <p className="eyebrow">Panel principal</p>
            <h1>Sistema Integrado</h1>
            <p className="muted">
              Bienvenido/a, <b>{sesion.nombre || sesion.user}</b> ({nombreRol})
            </p>
          </div>
          <button className="btn btn-danger" onClick={() => cerrarSesion(navigate)}>
            Salir
          </button>
        </div>

        <div className="action-grid">
          <button onClick={irModuloVentas} className="module-card module-green">
            <span className="module-icon">Caja</span>
            <strong>Panel admin</strong>
            <small>Ver resumen de ventas y control general.</small>
          </button>
          
          <button onClick={() => notify("Derivando al Modulo de Inventario (Equipo N 4).", 'info')} className="module-card module-blue">
            <span className="module-icon">Stock</span>
            <strong>Inventario</strong>
            <small>Consulta y control de productos.</small>
          </button>

          <button onClick={() => setMostrarCrear(true)} className="module-card module-orange">
            <span className="module-icon">User</span>
            <strong>Crear usuarios</strong>
            <small>Alta rapida para admin, cajero o delivery.</small>
          </button>
        </div>
      </section>

      {mostrarCrear && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={crearUsuario}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Nuevo usuario</p>
                <h2>Crear acceso</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setMostrarCrear(false)}>X</button>
            </div>

            <div className="form-grid">
              <label>
                Nombre
                <input className="field" value={form.nombre} onChange={(e) => actualizarCampo('nombre', e.target.value)} />
              </label>
              <label>
                Apellido
                <input className="field" value={form.apellido} onChange={(e) => actualizarCampo('apellido', e.target.value)} />
              </label>
              <label>
                RUT
                <input className="field" value={form.rut} onChange={(e) => actualizarCampo('rut', e.target.value)} />
              </label>
              <label>
                Rol
                <select className="field" value={form.rol} onChange={(e) => actualizarCampo('rol', e.target.value)}>
                  {opcionesRol.map((opcion) => (
                    <option value={opcion.value} key={opcion.value}>{opcion.label}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setMostrarCrear(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary">Crear usuario</button>
            </div>
            <p className="hint">El RUT debe tener formato 12.345.678-9. La contrasena inicial queda igual al RUT.</p>
          </form>
        </div>
      )}
    </main>
  );
}

export default Portal;
