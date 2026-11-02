// controllers/ProductoExternoControl.js
//
// Busca un código de barras en Open Food Facts (base pública y gratuita, sin
// clave) para sugerir nombre y categoría al registrar un producto nuevo.
// Cubre sobre todo alimentos y bebidas envasados; para el resto normalmente
// no habrá resultado y los datos se ingresan a mano.

import { validarNombreCategoria, formatearNombreCategoria } from './CategoriaControl';

const URL_BASE = 'https://world.openfoodfacts.org/api/v2/product';
const CAMPOS = 'product_name,product_name_es,generic_name_es,brands,quantity,categories,categories_tags,image_front_url,image_url';
const HOST_IMAGENES = 'https://images.openfoodfacts.org/';
const TIMEOUT_MS = 5000;

// ── Código de barras ────────────────────────────────────────────────────────
function digitoVerificadorEan13(doce) {
  let suma = 0;
  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

// Si el lector entrega 12 dígitos (sin el verificador del EAN-13), se prueba
// también con el dígito calculado. Solo se usa para la consulta: el código
// que se guarda es el que el usuario escaneó/escribió.
function candidatos(codigo) {
  if (/^\d{12}$/.test(codigo)) return [codigo, codigo + digitoVerificadorEan13(codigo)];
  return [codigo];
}

// ── Categoría: etiquetas de Open Food Facts → categorías de la app ─────────
// El orden importa: gana la primera regla que coincida.
const REGLAS_CATEGORIA = [
  ['Congelados',              /frozen|ice-cream|ice-creams/],
  ['Café e infusiones',       /coffee|\bteas?\b|tea-bags|infusion|herbal-tea|mate/],
  ['Bebidas',                 /beverage|drink|soda|waters?\b|juice|nectar|beer|wine|spirit|liquor|energy/],
  ['Lácteos',                 /dairies|dairy|milk|cheese|yogurt|yoghurt|butter|cream/],
  ['Carnes y embutidos',      /meat|sausage|ham\b|charcuterie|poultry|bacon|cold-cuts/],
  ['Panadería y pastelería',  /bread|bakery|pastr|viennoiserie|tortilla/],
  ['Snacks y confites',       /snack|biscuit|cookie|cracker|chocolate|candy|candies|confectioner|chips|crisps|sweet/],
  ['Condimentos y salsas',    /sauce|condiment|spice|seasoning|ketchup|mayonnaise|mustard|vinegar|dressing/],
  ['Abarrotes',               /groceries|cereal|pasta|rice|legume|flour|sugar|oil|canned|noodle|spread|jam/],
];

function sugerirCategoria(tags) {
  const texto = (Array.isArray(tags) ? tags : []).join(' ').toLowerCase();
  if (!texto) return null;
  const regla = REGLAS_CATEGORIA.find(([, patron]) => patron.test(texto));
  return regla ? regla[0] : null;
}

// Nombres de categoría tal como los trae Open Food Facts (válidos para el sistema:
// solo letras y espacios, sin números). Sirven para proponer una categoría nueva.
function categoriasExternas(p) {
  let items = String(p.categories ?? '').split(',');
  if (!items.some((x) => x.trim())) {
    items = (Array.isArray(p.categories_tags) ? p.categories_tags : []).map((t) => t.replace(/-/g, ' '));
  }
  const vistos = new Set();
  const resultado = [];
  for (const crudo of items) {
    const nombre = formatearNombreCategoria(crudo.replace(/^[a-z]{2,3}:/i, ''));
    if (!nombre || validarNombreCategoria(nombre)) continue;
    const clave = nombre.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    resultado.push(nombre);
  }
  return resultado;
}

// Open Food Facts lista primero las categorías más generales ("Alimentos y bebidas de
// origen vegetal…"); se prefiere la primera corta (hasta 3 palabras).
export function elegirCategoriaExterna(lista = []) {
  return lista.find((n) => n.split(' ').length <= 3 && n.length <= 25) ?? lista[0] ?? '';
}

// ── Nombre: "producto + marca + cantidad" (ej. "Galletas Tritón 126 g") ─────
function aTitulo(texto) {
  if (texto !== texto.toUpperCase()) return texto;           // ya viene con minúsculas
  return texto.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, l) => sp + l.toUpperCase());
}

function armarNombre(p) {
  const base = (p.product_name_es || p.product_name || p.generic_name_es || '').trim();
  if (!base) return '';
  const partes = [aTitulo(base)];
  const marca = String(p.brands ?? '').split(',')[0].trim();
  if (marca && !base.toLowerCase().includes(marca.toLowerCase())) partes.push(aTitulo(marca));
  const cantidad = String(p.quantity ?? '').trim();
  if (cantidad && !base.toLowerCase().includes(cantidad.toLowerCase())) partes.push(cantidad);
  return partes.join(' ');
}

// ── Consulta ────────────────────────────────────────────────────────────────
async function consultar(codigo) {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${URL_BASE}/${codigo}.json?fields=${CAMPOS}`, { signal: control.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json?.status === 1 ? json.product : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @returns {Promise<{ datos: null | { nombre: string, categoria: string|null,
 *   categoriasExternas: string[], imagenUrl: string,
 *   unidadMedida: string, fuente: string }, fallo: boolean }>}
 *   datos = null  → no se encontró nada. fallo = true → no se pudo consultar (red/tiempo).
 *   `nombre` viene '' y `categoria` null cuando ese dato específico no se encontró.
 */
export async function buscarProductoExterno(codigoBarra) {
  const codigo = String(codigoBarra ?? '').trim();
  if (!/^\d{8,14}$/.test(codigo)) return { datos: null, fallo: false };

  let fallo = false;
  for (const candidato of candidatos(codigo)) {
    try {
      const producto = await consultar(candidato);
      if (!producto) continue;
      const nombre = armarNombre(producto);
      const categoria = sugerirCategoria(producto.categories_tags);
      const externas = categoriasExternas(producto);
      if (!nombre && !categoria && externas.length === 0) continue;
      const imagenUrl = producto.image_front_url || producto.image_url || '';
      // Open Food Facts describe productos envasados (cantidad fija), que en el
      // inventario se manejan por unidad. Kilos/litros (granel) se eligen a mano.
      return {
        datos: { nombre, categoria, categoriasExternas: externas, imagenUrl, unidadMedida: 'unidad', fuente: 'Open Food Facts' },
        fallo: false,
      };
    } catch {
      fallo = true;
    }
  }
  return { datos: null, fallo };
}

// Descarga la foto frontal y la devuelve como File (para usarla con el mismo flujo de
// imágenes del formulario). Devuelve null si no se puede (red, tiempo, o el navegador
// bloquea la descarga por CORS): en ese caso la imagen se elige a mano.
export async function descargarImagenExterna(url) {
  if (!url || !url.startsWith(HOST_IMAGENES)) return null;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), TIMEOUT_MS * 2);
  try {
    const res = await fetch(url, { signal: control.signal });
    if (!res.ok) return null;
    const blob = await res.blob();
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[blob.type];
    if (!extension) return null;
    return new File([blob], `producto-off.${extension}`, { type: blob.type });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}