import React, { useState } from 'react';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import { contrasenaSegura, mensajeContrasenaSegura, obtenerVistaInicial, rutConFormatoValido, rutValido } from '../models/authModel';
import { auth, db } from '../firebase';
import '../styles/views/login.css';

function Login({ navigate, notify }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [modoRegistro, setModoRegistro] = useState(false);
  const [registro, setRegistro] = useState({
    nombre: '',
    apellido: '',
    rut: '',
    correo: '',
    contrasena: '',
    telefono: '',
  });

  const iniciarSesion = (usuario) => {
    if (usuario.estado === 'pendiente') {
      notify('Tu cuenta está pendiente de aprobación por el administrador.', 'info');
      return;
    }

    localStorage.setItem('sesion', JSON.stringify(usuario));
    notify('Bienvenido/a ' + (usuario.nombre || usuario.user), 'success');
    navigate(obtenerVistaInicial(usuario));
  };

  const buscarUsuarioFirestore = async (email) => {
    const usuariosRef = collection(db, 'usuarios');
    const consulta = query(usuariosRef, where('user', '==', email), limit(1));
    const resultado = await getDocs(consulta);
    return resultado.empty ? null : resultado.docs[0].data();
  };

  const handleLogin = async () => {
    const email = user.trim().toLowerCase();
    const p = pass.trim();

    if (!email || !p) {
      notify('Por favor, ingresa tu correo y contraseña.', 'error');
      return;
    }

    try {
      const credenciales = await signInWithEmailAndPassword(auth, email, p);
      const uid = credenciales.user.uid;
      const docSnap = await getDoc(doc(db, 'usuarios', uid));

      if (docSnap.exists()) {
        iniciarSesion({ uid, ...docSnap.data() });
        return;
      }

      const usuarioPorCorreo = await buscarUsuarioFirestore(email);
      if (usuarioPorCorreo) {
        iniciarSesion(usuarioPorCorreo);
        return;
      }

      notify('Tu cuenta existe en Auth, pero aún no fue aprobada por el administrador.', 'info');
    } catch (error) {
      console.error(error);
      notify('Correo o contraseña incorrectos, o cuenta aún no aprobada.', 'error');
    }
  };

  const restablecerContrasena = async () => {
    const email = user.trim().toLowerCase();

    if (!email) {
      notify('Ingresa tu correo electrónico para restablecer la contraseña.', 'error');
      return;
    }

    try {
      await sendPasswordResetEmail(auth, email);
      notify('Te enviamos un correo para restablecer la contraseña.', 'success');
    } catch (error) {
      console.error('Error al enviar restablecimiento de contraseña:', error);
      if (error.code === 'auth/invalid-email') notify('El correo no es válido.', 'error');
      else notify('No se pudo enviar el correo de restablecimiento.', 'error');
    }
  };

  const actualizarRegistro = (campo, valor) => {
    setRegistro({ ...registro, [campo]: valor });
  };

  const crearCuenta = async (e) => {
    e.preventDefault();
    const nombre = registro.nombre.trim();
    const apellido = registro.apellido.trim();
    const rut = registro.rut.trim();
    const correo = registro.correo.trim().toLowerCase();
    const contrasena = registro.contrasena.trim();
    const telefono = registro.telefono.trim();

    if (!nombre || !apellido || !rut || !correo || !contrasena || !telefono) {
      notify('Completa todos los campos para crear la cuenta.', 'error');
      return;
    }

    if (!rutConFormatoValido(rut) || !rutValido(rut)) {
      notify('Ingresa un RUT válido con formato 12.345.678-9.', 'error');
      return;
    }

    if (!contrasenaSegura(contrasena)) {
      notify(mensajeContrasenaSegura, 'error');
      return;
    }

    try {
      const credenciales = await createUserWithEmailAndPassword(auth, correo, contrasena);
      const uid = credenciales.user.uid;
      const solicitud = {
        uid,
        user: correo,
        nombre,
        apellido,
        rut,
        telefono,
        rol: 'pendiente',
        local: 'pendiente',
        estado: 'pendiente',
        creadaEn: new Date().toISOString(),
      };

      await setDoc(doc(db, 'solicitudesUsuarios', uid), solicitud);
      await setDoc(doc(db, 'notificacionesAdmin', `usuario-${uid}`), {
        tipo: 'solicitud_usuario',
        mensaje: `${nombre} ${apellido} solicitó crear una cuenta.`,
        uid,
        leida: false,
        creadaEn: new Date().toISOString(),
      });

      setRegistro({ nombre: '', apellido: '', rut: '', correo: '', contrasena: '', telefono: '' });
      setModoRegistro(false);
      notify('Cuenta solicitada. El administrador debe aprobarla y asignar el rol.', 'success');
    } catch (error) {
      console.error('Error al crear solicitud:', error);
      if (error.code === 'auth/email-already-in-use') notify('El correo ya está registrado.', 'error');
      else if (error.code === 'auth/invalid-email') notify('El correo no es válido.', 'error');
      else if (error.code === 'permission-denied') notify('Firebase no permite guardar la solicitud. Revisa las reglas.', 'error');
      else notify('No se pudo crear la cuenta.', 'error');
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark">SV</div>
        <p className="eyebrow">Sistema de venta e inventario</p>
        <h1>{modoRegistro ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
        <p className="muted">
          {modoRegistro ? 'Tu solicitud quedará pendiente hasta que el administrador la acepte.' : 'Ingresa con tu correo para entrar directo a tu módulo.'}
        </p>

        {modoRegistro ? (
          <form onSubmit={crearCuenta} className="auth-register-form">
            <input className="field" value={registro.nombre} onChange={(e) => actualizarRegistro('nombre', e.target.value)} placeholder="Nombres" />
            <input className="field" value={registro.apellido} onChange={(e) => actualizarRegistro('apellido', e.target.value)} placeholder="Apellidos" />
            <input className="field" value={registro.rut} onChange={(e) => actualizarRegistro('rut', e.target.value)} placeholder="RUT 12.345.678-9" />
            <input className="field" type="email" value={registro.correo} onChange={(e) => actualizarRegistro('correo', e.target.value)} placeholder="Correo electrónico" />
            <input className="field" type="password" value={registro.contrasena} onChange={(e) => actualizarRegistro('contrasena', e.target.value)} placeholder="Contraseña" />
            <input className="field" value={registro.telefono} onChange={(e) => actualizarRegistro('telefono', e.target.value)} placeholder="Número de teléfono" />
            <p className="hint">{mensajeContrasenaSegura}</p>
            <button type="submit" className="btn btn-primary btn-full">Solicitar cuenta</button>
          </form>
        ) : (
          <>
            <input
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="Correo electrónico"
              className="field"
            />
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder="Contraseña"
              className="field"
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button onClick={handleLogin} className="btn btn-primary btn-full">
              Entrar
            </button>
            <button type="button" onClick={restablecerContrasena} className="link-button auth-reset">
              Restablecer contraseña
            </button>
          </>
        )}

        <button type="button" className="btn btn-secondary btn-full" onClick={() => setModoRegistro(!modoRegistro)}>
          {modoRegistro ? 'Volver al inicio de sesión' : 'Crear cuenta'}
        </button>
      </section>
    </main>
  );
}

export default Login;
