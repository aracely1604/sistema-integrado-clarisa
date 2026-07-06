import React, { useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { obtenerNombreRol, obtenerOpcionRol, obtenerValorRol, opcionesRol } from '../models/authModel';
import '../styles/views/profile.css';

function Perfil({ notify }) {
  const sesion = JSON.parse(localStorage.getItem('sesion'));
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState(() => ({
    nombre: sesion?.nombre || '',
    apellido: sesion?.apellido || '',
    rut: sesion?.rut || '',
    user: sesion?.user || '',
    telefono: sesion?.telefono || '',
    rol: obtenerValorRol(sesion),
    patente: sesion?.patente || '',
    colorAuto: sesion?.colorAuto || '',
    marcaAuto: sesion?.marcaAuto || '',
  }));

  if (!sesion) return null;

  const esAdmin = sesion.rol === 'admin';
  const esDelivery = sesion.rol === 'delivery';

  const buscarDocumentoUsuario = async () => {
    const posiblesIds = [sesion.uid, sesion.rut].filter(Boolean);

    for (const id of posiblesIds) {
      const referencia = doc(db, 'usuarios', id);
      const resultado = await getDoc(referencia);
      if (resultado.exists()) return referencia;
    }

    const filtros = [
      ['rut', sesion.rut],
      ['uid', sesion.uid],
      ['user', sesion.user],
    ].filter(([, valor]) => Boolean(valor));

    for (const [campo, valor] of filtros) {
      const consulta = query(collection(db, 'usuarios'), where(campo, '==', valor), limit(1));
      const resultado = await getDocs(consulta);
      if (!resultado.empty) return resultado.docs[0].ref;
    }

    return null;
  };

  const actualizarCampo = (campo, valor) => {
    setForm({ ...form, [campo]: valor });
  };

  const guardarPerfil = async (e) => {
    e.preventDefault();
    const opcionRol = obtenerOpcionRol(form.rol);
    const datosActualizados = {
      ...sesion,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      rut: form.rut.trim(),
      user: form.user.trim().toLowerCase(),
      telefono: form.telefono.trim(),
      ...(esAdmin ? { rol: opcionRol.rol, local: opcionRol.local } : {}),
      ...(esDelivery ? {
        patente: form.patente.trim().toUpperCase(),
        colorAuto: form.colorAuto.trim(),
        marcaAuto: form.marcaAuto.trim(),
      } : {}),
    };

    if (!datosActualizados.nombre || !datosActualizados.apellido || !datosActualizados.rut || !datosActualizados.user) {
      notify('Completa nombres, apellidos, RUT y correo electrónico.', 'error');
      return;
    }

    try {
      const referenciaUsuario = await buscarDocumentoUsuario();
      if (!referenciaUsuario) {
        notify('No se encontro el usuario en Firebase.', 'error');
        return;
      }

      await updateDoc(referenciaUsuario, datosActualizados);

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
      notify('No se pudo actualizar el perfil en Firebase.', 'error');
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
