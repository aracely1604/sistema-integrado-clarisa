<<<<<<< HEAD
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';

=======
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
export const rutasPorLocal = {
  almacen: 'almacen',
  cafeteria: 'cafeteria',
  comida_rapida: 'comida_rapida',
};

export const opcionesRol = [
  { value: 'admin', label: 'administrador', rol: 'admin', local: 'Administrador' },
<<<<<<< HEAD
  { value: 'cocinero', label: 'cocinero', rol: 'cocinero', local: 'comida_rapida' },
=======
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
  { value: 'cajero_almacen', label: 'cajero(almacén)', rol: 'cajero', local: 'almacen' },
  { value: 'cajero_comida_rapida', label: 'cajero(comida rápida)', rol: 'cajero', local: 'comida_rapida' },
  { value: 'cajero_cafeteria', label: 'cajero(cafetería)', rol: 'cajero', local: 'cafeteria' },
  { value: 'delivery', label: 'delivery', rol: 'delivery', local: 'delivery' },
];

export const obtenerOpcionRol = (value) => {
  return opcionesRol.find((opcion) => opcion.value === value) || opcionesRol[2];
};

export const obtenerValorRol = (usuario) => {
  if (!usuario) return 'cajero_almacen';
  if (usuario.rol === 'admin') return 'admin';
  if (usuario.rol === 'delivery') return 'delivery';
<<<<<<< HEAD
  if (usuario.rol === 'cocinero') return 'cocinero';
=======
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
  return opcionesRol.find((opcion) => opcion.rol === usuario.rol && opcion.local === usuario.local)?.value || 'cajero_almacen';
};

export const obtenerNombreRol = (usuario) => {
  return opcionesRol.find((opcion) => opcion.value === obtenerValorRol(usuario))?.label || usuario?.rol || 'Sin rol';
};

export const obtenerVistaInicial = (usuario) => {
  if (!usuario) return 'login';
  if (usuario.estado === 'pendiente') return 'login';
  if (usuario.rol === 'admin') return 'portal';
  if (usuario.rol === 'delivery') return 'delivery';
<<<<<<< HEAD
  if (usuario.rol === 'cocinero') return 'cocinero';
=======
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
  return rutasPorLocal[usuario.local] || 'almacen';
};

export const rutConFormatoValido = (rut) => {
  return /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/.test(rut.trim());
};

export const rutValido = (rut) => {
  if (!rutConFormatoValido(rut)) return false;

  const [numeroConPuntos, digitoIngresado] = rut.trim().split('-');
  const numero = numeroConPuntos.replaceAll('.', '');
  let suma = 0;
  let multiplicador = 2;

  for (let i = numero.length - 1; i >= 0; i -= 1) {
    suma += Number(numero[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  const digitoCalculado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);

  return digitoCalculado === digitoIngresado.toUpperCase();
};

export const contrasenaSegura = (valor) => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/.test(valor);
};

export const mensajeContrasenaSegura = 'La contraseña debe tener 8 caracteres, una mayúscula, una minúscula, un número y un símbolo.';

<<<<<<< HEAD
export const cerrarSesion = async (navigate) => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('No se pudo cerrar la sesión de Firebase:', error);
  }
  localStorage.removeItem('sesion');
  navigate('/login', { replace: true });
=======
export const cerrarSesion = (navigate) => {
  localStorage.removeItem('sesion');
  navigate('login');
>>>>>>> d4907a47cc4937a96fcc06b7080c8306f41561b5
};
