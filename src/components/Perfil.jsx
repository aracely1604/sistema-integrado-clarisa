import React, { useState } from 'react';
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';

function Perfil({ notify }) {
  const sesion = JSON.parse(localStorage.getItem('sesion'));
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');

  if (!sesion) return null;

  const buscarDocumentoUsuario = async () => {
    const posiblesIds = [sesion.rut, sesion.uid].filter(Boolean);

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

  const actualizarContrasenaAuth = async () => {
    if (!sesion.user || !sesion.user.includes('@')) return;

    let usuarioAuth = auth.currentUser;

    if (!usuarioAuth || usuarioAuth.email !== sesion.user) {
      const credenciales = await signInWithEmailAndPassword(auth, sesion.user, actual);
      usuarioAuth = credenciales.user;
    } else {
      const credencial = EmailAuthProvider.credential(sesion.user, actual);
      await reauthenticateWithCredential(usuarioAuth, credencial);
    }

    await updatePassword(usuarioAuth, nueva);
  };

  const cambiarContrasena = async (e) => {
    e.preventDefault();

    if (actual !== sesion.pass) {
      notify('La contrasena actual no coincide.', 'error');
      return;
    }

    if (nueva.length < 6) {
      notify('La nueva contrasena debe tener al menos 6 caracteres.', 'error');
      return;
    }

    if (nueva !== confirmar) {
      notify('La confirmacion no coincide con la nueva contrasena.', 'error');
      return;
    }

    try {
      try {
        await actualizarContrasenaAuth();
      } catch (errorAuth) {
        const puedeContinuarSoloFirestore = ['auth/operation-not-allowed', 'auth/user-not-found', 'auth/invalid-credential'].includes(errorAuth.code);
        if (!puedeContinuarSoloFirestore) throw errorAuth;
      }

      const referenciaUsuario = await buscarDocumentoUsuario();
      if (!referenciaUsuario) {
        notify('No se encontro el usuario en Firebase.', 'error');
        return;
      }

      await updateDoc(referenciaUsuario, { pass: nueva });

      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      const usuariosActualizados = usuarios.map((usuario) => {
        const mismoUsuario = usuario.user === sesion.user || usuario.rut === sesion.rut || usuario.uid === sesion.uid;
        return mismoUsuario ? { ...usuario, pass: nueva } : usuario;
      });
      const sesionActualizada = { ...sesion, pass: nueva };

      localStorage.setItem('usuarios', JSON.stringify(usuariosActualizados));
      localStorage.setItem('sesion', JSON.stringify(sesionActualizada));
      setActual('');
      setNueva('');
      setConfirmar('');
      setAbierto(false);
      notify('Contrasena actualizada correctamente en Firebase.', 'success');
    } catch (error) {
      console.error('Error al cambiar contrasena:', error);
      notify('No se pudo actualizar la contrasena en Firebase.', 'error');
    }
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
