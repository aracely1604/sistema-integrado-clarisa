export const DEFAULT_VIEW = 'login';

export const DEFAULT_ADMIN = {
  user: 'admin',
  pass: 'admin',
  nombre: 'Administrador',
  apellido: 'General',
  rut: 'admin',
  rol: 'admin',
  local: 'Administrador',
};

export const obtenerVistaGuardada = () => {
  return localStorage.getItem('currentView') || DEFAULT_VIEW;
};

export const guardarVistaActual = (view) => {
  localStorage.setItem('currentView', view);
};

export const asegurarAdminInicial = () => {
  if (!localStorage.getItem('usuarios')) {
    localStorage.setItem('usuarios', JSON.stringify([DEFAULT_ADMIN]));
  }
};

export const crearToast = (message, type = 'info') => {
  return { message, type };
};
