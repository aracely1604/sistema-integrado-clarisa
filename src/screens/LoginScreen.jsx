import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginUsuario, restablecerContrasena as restablecerContrasenaControl } from '../controllers/loginControl';
import '../styles/views/login.css';

function Login() {
  const navigate = useNavigate();
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [toast, setToast] = useState(null);

  // Toast local para esta pantalla. El primer App.jsx (con React Router y
  // AuthProvider) no trae un sistema global de notificaciones, así que
  // Login maneja el suyo propio.
  const notify = (message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(window.__loginToastTimer);
    window.__loginToastTimer = window.setTimeout(() => setToast(null), 3200);
  };

  const handleLogin = async () => {
    try {
      const empleado = await loginUsuario(user, pass);
      notify('Bienvenido/a ' + empleado.nombre, 'success');
      // Si el rol es "delivery", redirigimos manualmente a /delivery.
      // Para el resto de roles no se navega manualmente: AuthContext
      // detecta la sesión vía onAuthStateChanged y AppRoutes redirige a /portal.
      if (empleado.rol === 'delivery') {
        navigate('/delivery');
      }
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const restablecerContrasena = async () => {
    try {
      await restablecerContrasenaControl(user);
      notify('Te enviamos un correo para restablecer la contraseña.', 'success');
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const accederAPortalSinLogin = () => {
    navigate('/portal');
  };

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand-mark">SV</div>
        <p className="eyebrow">Sistema de venta e inventario</p>
        <h1>Iniciar sesión</h1>
        <p className="muted">Ingresa con tu correo para entrar directo a tu módulo.</p>

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
        <button type="button" onClick={restablecerContrasena} className="link-button auth-reset">
          ¿Olvidaste tu contraseña?
        </button>
        <button onClick={handleLogin} className="btn btn-primary btn-full">
          Entrar
        </button>

        <button type="button" className="btn btn-secondary btn-full" onClick={accederAPortalSinLogin}>
          Acceso a portal sin login (prueba)
        </button>

        {toast && (
          <div className={`toast toast-${toast.type}`} role="status">
            {toast.message}
          </div>
        )}
      </section>
    </main>
  );
}

export default Login;