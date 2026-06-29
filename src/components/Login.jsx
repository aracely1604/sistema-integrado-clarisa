import React, { useState } from 'react';
import { obtenerVistaInicial } from '../utils/auth';

function Login({ navigate, notify }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  const handleLogin = () => {
    let u = user.trim();
    let p = pass.trim();

    let usuarios = JSON.parse(localStorage.getItem("usuarios")) || [];
    let ok = usuarios.find(x => x.user === u && x.pass === p);

    if (ok) {
      localStorage.setItem("sesion", JSON.stringify(ok));
      notify(`Bienvenido/a ${ok.nombre || ok.user}`, 'success');
      navigate(obtenerVistaInicial(ok));
    } else {
      notify("Usuario o contraseña incorrectos", 'error');
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark">SV</div>
        <p className="eyebrow">Sistema de venta e inventario</p>
        <h1>Iniciar sesion</h1>
        <p className="muted">Ingresa con tu usuario o RUT para entrar directo a tu modulo.</p>

        <input 
          value={user} 
          onChange={(e) => setUser(e.target.value)} 
          placeholder="Usuario o RUT"
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
