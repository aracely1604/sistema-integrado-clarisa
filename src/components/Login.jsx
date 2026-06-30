import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { obtenerVistaInicial } from '../utils/auth';
import { auth, db } from '../firebase';

function Login({ navigate, notify }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const handleLogin = async () => {
    const email = user.trim();
    const p = pass.trim();

    if (!email || !p) {
      notify('Por favor, ingresa tu correo y contrasena.', 'error');
      return;
    }

    try {
      const credenciales = await signInWithEmailAndPassword(auth, email, p);
      const uid = credenciales.user.uid;
      const docRef = doc(db, 'usuarios', uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const datosUsuario = docSnap.data();
        localStorage.setItem('sesion', JSON.stringify(datosUsuario));
        notify('Bienvenido/a ' + (datosUsuario.nombre || datosUsuario.user), 'success');
        navigate(obtenerVistaInicial(datosUsuario));
      } else {
        notify('Usuario autenticado, pero no tiene datos en Firestore.', 'error');
      }
    } catch (error) {
      const usuarios = JSON.parse(localStorage.getItem('usuarios')) || [];
      const ok = usuarios.find((x) => x.user === email && x.pass === p);

      if (ok) {
        localStorage.setItem('sesion', JSON.stringify(ok));
        notify('Bienvenido/a ' + (ok.nombre || ok.user), 'success');
        navigate(obtenerVistaInicial(ok));
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
        <p className="hint">Admin inicial: usuario admin / contrasena admin</p>
      </section>
    </main>
  );
}

export default Login;
