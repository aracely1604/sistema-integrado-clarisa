export const productosPorLocal = {
  almacen: [
    { nombre: 'Arroz 1 kg', precio: 1800 },
    { nombre: 'Bebida lata', precio: 1200 },
    { nombre: 'Pan', precio: 800 },
    { nombre: 'Leche', precio: 1400 },
    { nombre: 'Azúcar 1 kg', precio: 1600 },
    { nombre: 'Fideos', precio: 1100 },
    { nombre: 'Aceite 900 ml', precio: 2800 },
    { nombre: 'Huevos docena', precio: 3200 },
  ],
  cafeteria: [
    { nombre: 'Café', precio: 1500 },
    { nombre: 'Té', precio: 1200 },
    { nombre: 'Sándwich', precio: 2500 },
    { nombre: 'Queque', precio: 1800 },
    { nombre: 'Capuccino', precio: 2200 },
    { nombre: 'Jugo natural', precio: 2000 },
    { nombre: 'Muffin', precio: 1700 },
    { nombre: 'Ensalada', precio: 2900 },
  ],
  comida_rapida: [
    { nombre: 'Completo', precio: 2200 },
    { nombre: 'Hamburguesa', precio: 3500 },
    { nombre: 'Papas fritas', precio: 2000 },
    { nombre: 'Bebida', precio: 1200 },
    { nombre: 'Churrasco', precio: 4200 },
    { nombre: 'Nuggets', precio: 2800 },
    { nombre: 'Empanada', precio: 1600 },
    { nombre: 'Helado', precio: 1500 },
  ],
};

export const metodosPagoPorLocal = {
  default: ['Débito', 'Efectivo', 'Transferencia'],
  cafeteria: ['Débito', 'Efectivo', 'Transferencia', 'Junaeb', 'Pluxe'],
};

export const obtenerProductosLocal = (localId) => {
  return productosPorLocal[localId] || [];
};

export const obtenerMetodosPagoLocal = (localId) => {
  return metodosPagoPorLocal[localId] || metodosPagoPorLocal.default;
};
