import React, { useState, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';

import Login from './screens/LoginScreen';
import Portal from './screens/Portal';
import Admin from './views/Admin';
import Almacen from './views/Almacen';
import Delivery from './views/Delivery';
import Cafeteria from './views/Cafeteria';
import ComidaRapida from './views/ComidaRapida';
import Perfil from './views/Perfil'

import AlertasScreen from './screens/AlertasScreen'

import { AuthProvider, useAuth } from './controllers/AuthContext';
import { asegurarAdminInicial, crearToast } from './controllers/appController';

import './styles/App.css';

function AppRoutes({ notify }) {
  const { usuario, cargando } = useAuth();

  if (cargando) {
    return (
      <div className="app-loading">
        <span className="app-spinner" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <Routes>
      {!usuario ? (
        <>
          <Route path="/login" element={<Login notify={notify} />} />
          <Route path="/portal" element={<Portal notify={notify} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </>
      ) : (
        <>
          <Route path="/alertas" element={<AlertasScreen notify={notify} />} />

          <Route path="/portal" element={<Portal notify={notify} />} />
          <Route path="/admin" element={<Admin notify={notify} />} />
          <Route path="/almacen" element={<Almacen notify={notify} />} />
          <Route path="/delivery" element={<Delivery notify={notify} />} />
          <Route path="/cafeteria" element={<Cafeteria notify={notify} />} />
          <Route path="/comidaRapida" element={<ComidaRapida notify={notify} />} />
          <Route path="/perfil" element={<Perfil notify={notify} />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </>
      )}
    </Routes>
  );
}

function App() {
  const [toast, setToast] = useState(null);

  const notify = (message, type = 'info') => {
    setToast(crearToast(message, type));
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    asegurarAdminInicial();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <div className="app-container">
            <AppRoutes notify={notify} />
            {toast && (
              <div className={`toast toast-${toast.type}`} role="status">
                <span className="toast-icon">
                  {toast.type === 'success' ? 'OK' : toast.type === 'error' ? '!' : 'i'}
                </span>
                <span>{toast.message}</span>
              </div>
            )}
          </div>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;