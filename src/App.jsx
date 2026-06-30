import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import Portal from './components/Portal';
import Admin from './components/Admin';
import Almacen from './components/Almacen';
import Delivery from './components/Delivery';
import Cafeteria from './components/Cafeteria';
import ComidaRapida from './components/ComidaRapida';
import './App.css';

function App() {
  const [view, setView] = useState(() => {
    return localStorage.getItem('currentView') || 'login';
  });
  const [toast, setToast] = useState(null);

  const navigate = (newView) => {
    setView(newView);
    localStorage.setItem('currentView', newView);
  };

  const notify = (message, type = 'info') => {
    setToast({ message, type });
    window.clearTimeout(window.__toastTimer);
    window.__toastTimer = window.setTimeout(() => setToast(null), 3200);
  };

  // Creamos el admin por defecto
  useEffect(() => {
    if (!localStorage.getItem("usuarios")) {
      localStorage.setItem("usuarios", JSON.stringify([
        {
          user: "admin",
          pass: "admin",
          nombre: "Administrador",
          apellido: "General",
          rut: "admin",
          rol: "admin",
          local: "Administrador"
        }
      ]));
    }
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
