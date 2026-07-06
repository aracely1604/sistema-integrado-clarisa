import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { obtenerVistaInicial } from '../models/authModel';
import { auth, db } from '../firebase';
import '../styles/views/login.css';

function Login({ navigate, notify }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const iniciarSesion = (usuario) => {
    localStorage.setItem('sesion', JSON.stringify(usuario));
    notify('Bienvenido/a ' + (usuario.nombre || usuario.user), 'success');
    navigate(obtenerVistaInicial(usuario));
  };

  const buscarUsuarioFirestore = async (email, clave) => {
    const usuariosRef = collection(db, 'usuarios');
    const consulta = query(usuariosRef, where('user', '==', email), limit(5));
    const resultado = await getDocs(consulta);
    const encontrado = resultado.docs.map((documento) => documento.data()).find((usuario) => usuario.pass === clave);
    return encontrado || null;
  };

  const handleLogin = async () => {
    const email = user.trim().toLowerCase();
    const p = pass.trim();

    if (!email || !p) {
      notify('Por favor, ingresa tu correo y contrasena.', 'error');
      return;
    }

    try {
      const credenciales = await signInWithEmailAndPassword(auth, email, p);
      const uid = credenciales.user.uid;
      const docSnap = await getDoc(doc(db, 'usuarios', uid));

      if (docSnap.exists()) {
        iniciarSesion(docSnap.data());
        return;
      }

      const usuarioPorCorreo = await buscarUsuarioFirestore(email, p);
      if (usuarioPorCorreo) {
        iniciarSesion(usuarioPorCorreo);
        return;
      }

      notify('Usuario autenticado, pero no tiene datos en Firestore.', 'error');
    } catch (error) {
      try {
        const usuarioFirebase = await buscarUsuarioFirestore(email, p);
        if (usuarioFirebase) {
          iniciarSesion(usuarioFirebase);
          return;
        }
      } catch (errorFirestore) {
        console.error(errorFirestore);
      }

      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      const ok = usuarios.find((x) => x.user === email && x.pass === p);

      if (ok) {
        iniciarSesion(ok);
      } else {
        console.error(error);
        notify('Correo o contrasena incorrectos', 'error');
      }
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark">SV</div>
        <p className="eyebrow">Sistema de venta e inventario</p>
        <h1>Iniciar sesion</h1>
        <p className="muted">Ingresa con tu correo para entrar directo a tu modulo.</p>

        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Correo electronico"
          className="field"
        />
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Contrasena"
          className="field"
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
        />
        <button onClick={handleLogin} className="btn btn-primary btn-full">
          Entrar
        </button>
        <p className="hint">Admin inicial: usuario admin / contraseña admin</p>
      </section>
    </main>
  );
}

export default Login;
