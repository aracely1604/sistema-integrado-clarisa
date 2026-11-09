// Conversión de unidades: vive en un solo lugar y se re-exporta acá para no romper los imports existentes.
// ⚠️ Ajusta la ruta si este archivo no está dos niveles bajo src (igual que '../../models/RecetaLocalModel').
export {
  unidadBaseDesdeUnidadMedida,
  convertirACantidadBase,
  convertirBaseAIngreso,
  convertirValorUnitarioABase,
  convertirValorUnitarioAIngreso,
} from '../../models/UnidadesMedidaModel';

// ─── Datos de ejemplo ────────────────────────────────────────────────────────


export const PRODUCTOS_INICIALES = [
  {
    id: '1',
    nombre: 'Arroz Premium',
    codigo: '7891234560012',
    categoria: 'Abarrotes',
    proveedor: 'Distribuidora Norte',
    precio: 890,      // $ por kg (1000g)
    stock: 142000,    // gramos
    minimo: 30000,
    unidad: 'g',
    activo: true,
    ultima: '28 abr 2025',
    imagen: 'https://picsum.photos/seed/arroz-premium/300/300',
  },
  {
    id: '2',
    nombre: 'Aceite Vegetal',
    codigo: '7802800100036',
    categoria: 'Abarrotes',
    proveedor: 'Alimarket SpA',
    precio: 2450,
    stock: 18,
    minimo: 20,
    unidad: 'uds',
    activo: true,
    ultima: '25 abr 2025',
    imagen: 'https://picsum.photos/seed/aceite-vegetal/300/300',
  },
  {
    id: '3',
    nombre: 'Leche Entera 1L',
    codigo: '7802800200018',
    categoria: 'Lácteos',
    proveedor: 'Colún',
    precio: 990,
    stock: 0,
    minimo: 40,
    unidad: 'uds',
    activo: true,
    ultima: '29 abr 2025',
    imagen: 'https://picsum.photos/seed/leche-entera/300/300',
  },
  {
    id: '4',
    nombre: 'Detergente',
    codigo: '4005808224067',
    categoria: 'Limpieza',
    proveedor: 'Procter & Gamble',
    precio: 3800,
    stock: 55,
    minimo: 15,
    unidad: 'uds',
    activo: false,
    ultima: '20 abr 2025',
    imagen: 'https://picsum.photos/seed/detergente/300/300',
  },
  {
    id: '5',
    nombre: 'Queso Gauda',
    codigo: '7802800050014',
    categoria: 'Lácteos',
    proveedor: 'Soprole',
    precio: 12000,    // $ por kg (1000g)
    stock: 8500,      // gramos
    minimo: 2000,
    unidad: 'g',
    activo: true,
    ultima: '27 abr 2025',
    imagen: 'https://picsum.photos/seed/queso-gauda/300/300',
  },
];

export const HISTORIALES = {
  '1': [
    { tipo: 'Ingreso de mercadería', fecha: '28 abr 2025', qty: '+50000', pos: true },
    { tipo: 'Ingreso de mercadería', fecha: '01 abr 2025', qty: '+100000', pos: true },
  ],
  '2': [
    { tipo: 'Ingreso de mercadería', fecha: '25 abr 2025', qty: '+30', pos: true },
    { tipo: 'Devolución de cliente', fecha: '10 abr 2025', qty: '+2', pos: true },
  ],
  '3': [
    { tipo: 'Ingreso de mercadería', fecha: '29 abr 2025', qty: '+80', pos: true },
    { tipo: 'Devolución de cliente', fecha: '18 abr 2025', qty: '+5', pos: true },
  ],
  '4': [{ tipo: 'Ingreso de mercadería', fecha: '20 abr 2025', qty: '+40', pos: true }],
  '5': [
    { tipo: 'Ingreso de mercadería', fecha: '27 abr 2025', qty: '+10000', pos: true },
    { tipo: 'Devolución de cliente', fecha: '05 abr 2025', qty: '+500', pos: true },
  ],
};

// Pensadas para cubrir los 3 tipos de locales (comida rápida, cafetería y almacén)
export const CATEGORIAS = [
  'Abarrotes',
  'Lácteos',
  'Bebidas',
  'Congelados',
  'Panadería y pastelería',
  'Carnes y embutidos',
  'Snacks y confites',
  'Café e infusiones',
  'Condimentos y salsas',
  'Desechables y envases',
  'Limpieza',
  'Otros',
];
export const TIPOS_MOVIMIENTO = ['Ingreso de mercadería', 'Devolución de cliente'];
// Categorías que NO requieren fecha de vencimiento
export const CATEGORIAS_SIN_VENC = ['Limpieza', 'Desechables y envases', 'Otros'];

// Unidad de medida por la que se puede llegar a vender el producto
export const UNIDADES_MEDIDA = [
  { value: 'unidad',      label: 'Unidad' },
  { value: 'litros',      label: 'Litros' },
  { value: 'kilogramos',  label: 'Kilogramos' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getStockStatus(stock, minimo) {
  if (stock === 0) return 'out';
  if (stock <= minimo) return 'low';
  return 'ok';
}

function formatNumeroConvertido(valor) {
  return Number(valor).toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

// Muestra siempre en la unidad "de compra" (kg / L), nunca en la unidad
// base interna (g / ml) — así se lea 142 kg y no 142000 g.
export function formatStock(stock, unidadBase) {
  const num = Number(stock) || 0;
  if (unidadBase === 'g') return formatNumeroConvertido(num / 1000) + ' kg';
  if (unidadBase === 'ml') return formatNumeroConvertido(num / 1000) + ' lt';
  return num.toLocaleString('es-CL') + ' uds';
}

export function formatPrecio(precio, unidadBase) {
  const base = '$' + Number(precio).toLocaleString('es-CL');
  if (unidadBase === 'g') return base + ' / kg';
  if (unidadBase === 'ml') return base + ' / lt';
  return base;
}

// Texto de la unidad "de compra", para etiquetas de formulario dinámicas
// (ej. "Cantidad (kg)", "Stock mínimo (lt)").
export function etiquetaUnidadIngreso(unidadBase) {
  if (unidadBase === 'g') return 'kg';
  if (unidadBase === 'ml') return 'lt';
  return 'uds';
}

export function requiereFechaVenc(categoria) {
  return !CATEGORIAS_SIN_VENC.includes(categoria);
}

export function formatQtyHistorial(qty, unidad) {
  const sign = qty[0];
  const num = parseInt(qty.slice(1));
  if (unidad === 'g') {
    if (num >= 1000) return sign + (num / 1000).toFixed(2).replace(/\.?0+$/, '') + ' kg';
    return sign + num + ' g';
  }
  return qty + ' uds.';
}