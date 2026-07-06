import React, { useState, useEffect } from 'react';
import Login from './views/Login';
import Portal from './views/Portal';
import Admin from './views/Admin';
import Almacen from './views/Almacen';
import Delivery from './views/Delivery';
import Cafeteria from './views/Cafeteria';
import ComidaRapida from './views/ComidaRapida';
import { asegurarAdminInicial, crearToast, guardarVistaActual, obtenerVistaGuardada } from './controllers/appController';
import './styles/App.css';

function App() {
  const [view, setView] = useState(obtenerVistaGuardada);
  const [toast, setToast] = useState(null);

  const navigate = (newView) => {
    setView(newView);
    guardarVistaActual(newView);
  };

  const notify = (message, type = 'info') => {
    setToast(crearToast(message, type));
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    asegurarAdminInicial();
  }, []);

  const renderView = () => {
    switch (view) {
      case 'login': return <Login navigate={navigate} notify={notify} />;
      case 'portal': return <Portal navigate={navigate} notify={notify} />;
      case 'admin': return <Admin navigate={navigate} />;
      case 'almacen': return <Almacen navigate={navigate} notify={notify} />;
      case 'delivery': return <Delivery navigate={navigate} notify={notify} />;
      case 'cafeteria': return <Cafeteria navigate={navigate} notify={notify} />;
      case 'comida_rapida': return <ComidaRapida navigate={navigate} notify={notify} />;
      default: return <Login navigate={navigate} notify={notify} />;
    }
  };

  return (
    <div className="app-container">
      {renderView()}
      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <span className="toast-icon">{toast.type === 'success' ? 'OK' : toast.type === 'error' ? '!' : 'i'}</span>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
