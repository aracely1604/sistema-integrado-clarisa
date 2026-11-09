// models/VentaModel.js
//
// Lógica PURA (sin Firestore ni React) de lo que se vende en caja y de cómo cada línea
// consume stock. La usan VentaControl (para descontar y guardar) y PuntoVenta (para validar
// el carrito antes de cobrar).
//
// Una línea del carrito puede ser:
//   · Producto unitario  → descuenta `cantidad` unidades.
//   · Producto a granel  → descuenta `cantidadBase` (g / ml).
//   · Receta             → descuenta CADA ingrediente asignado en este local
//                          (cantidad del ingrediente × unidades vendidas), salvo los que
//                          el cliente pidió quitar.
//
// Todo el stock está en unidad base (g / ml / uds), igual que la cantidad de los ingredientes.

import { cantidadIngredienteEnBase } from './RecetaLocalModel';

// Cuánto stock descuenta una línea de PRODUCTO, en la unidad en que se guarda el stock.
export const cantidadADescontar = (linea) => (
  linea.esGranel ? Number(linea.cantidadBase) || 0 : (Number(linea.cantidad) || 1)
);

// ─── Recetas vendibles ──────────────────────────────────────────────────────

/**
 * Convierte { receta (global), asignacion (de este local) } en una receta lista para la caja.
 * Devuelve null si el local no la tiene asignada o no está activa.
 * `idProducto` queda en '' si a ese ingrediente todavía no se le asignó un producto.
 */
export function resolverRecetaVenta({ receta, asignacion }) {
  if (!receta || !asignacion || asignacion.activo !== true) return null;

  return {
    id: receta.id,
    nombre: receta.nombre,
    precio: Number(asignacion.precioVenta) || 0,
    imagenUrl: receta.imagenUrl || '',   // espacio reservado para la foto (Storage)
    ingredientes: (receta.ingredientes ?? []).map((ing) => ({
      id: ing.id,
      nombre: ing.nombre,
      cantidad: ing.cantidad,
      unidadMedida: ing.unidadMedida,
      cantidadBase: cantidadIngredienteEnBase(ing.cantidad, ing.unidadMedida),
      idProducto: (asignacion.ingredientes ?? [])
        .find((a) => a.idIngredienteGlobal === ing.id)?.idProductoLocal || '',
    })),
  };
}

/**
 * ¿La receta se puede vender? Está "configurada" si TODOS sus ingredientes tienen un producto
 * asignado que existe (y está activo) en el local. `preparables` = cuántas unidades alcanzan
 * con el stock actual (el ingrediente que menos rinde manda).
 *
 * @param {object} receta  salida de resolverRecetaVenta
 * @param {object[]} productos  productos del local con { id, stockActual }
 */
export function estadoReceta(receta, productos) {
  const porId = new Map((productos ?? []).map((p) => [p.id, p]));
  const ingredientes = receta?.ingredientes ?? [];

  const sinConfigurar = ingredientes
    .filter((ing) => !ing.idProducto || !porId.has(ing.idProducto))
    .map((ing) => ing.nombre);

  if (ingredientes.length === 0 || sinConfigurar.length > 0) {
    return { configurada: false, sinConfigurar, preparables: 0 };
  }

  const preparables = Math.min(...ingredientes.map((ing) => (
    ing.cantidadBase > 0
      ? Math.floor((Number(porId.get(ing.idProducto).stockActual) || 0) / ing.cantidadBase)
      : 0
  )));

  return { configurada: true, sinConfigurar: [], preparables };
}

/**
 * Línea de carrito para UNA unidad de una receta, con todos los ingredientes incluidos.
 * - `ingredientes`: nombres de los ingredientes que se incluyen (el cajero puede quitar alguno).
 * - `ingredientesBase`: todos los nombres, para mostrar qué se quitó.
 * - `ingredientesReceta`: lo necesario para descontar stock (producto asignado y cantidad base).
 */
export function crearLineaReceta(receta, productos) {
  const porId = new Map((productos ?? []).map((p) => [p.id, p]));
  const nombres = receta.ingredientes.map((ing) => ing.nombre);
  return {
    id: receta.id,
    nombre: receta.nombre,
    precio: receta.precio,
    cantidad: 1,
    esReceta: true,
    ingredientes: [...nombres],
    ingredientesBase: nombres,
    ingredientesReceta: receta.ingredientes.map((ing) => ({
      nombre: ing.nombre,
      idProducto: ing.idProducto,
      nombreProducto: porId.get(ing.idProducto)?.nombre ?? ing.nombre,
      cantidadBase: ing.cantidadBase,
    })),
  };
}

/**
 * Quita un ingrediente de la línea `indice` del carrito y devuelve el carrito nuevo.
 * Si la línea tiene VARIAS unidades, el cambio es solo para UNA: se le resta una a la línea
 * original y esa unidad pasa a una línea propia sin el ingrediente. Las demás unidades
 * conservan el ingrediente.
 * Si ya existe otra línea de la misma receta con exactamente los ingredientes resultantes,
 * la unidad se suma a esa línea en vez de crear una duplicada.
 */
export function quitarIngredienteDelCarrito(carrito, indice, ingrediente) {
  const linea = carrito[indice];
  if (!linea) return carrito;
  const quedan = (linea.ingredientes || []).filter((nombre) => nombre !== ingrediente);

  if (linea.esReceta) {
    const firma = quedan.join('|');
    const unidades = Number(linea.cantidad) || 1;
    const destino = carrito.findIndex((item, i) => (
      i !== indice && item.esReceta && item.id === linea.id && item.ingredientes.join('|') === firma
    ));
    const sumarAlDestino = (item, i) => (i === destino ? { ...item, cantidad: item.cantidad + 1 } : item);

    if (unidades > 1) {
      const restante = carrito.map((item, i) => (
        i === indice ? { ...item, cantidad: item.cantidad - 1 } : sumarAlDestino(item, i)
      ));
      if (destino !== -1) return restante;
      return [
        ...restante.slice(0, indice + 1),
        { ...linea, cantidad: 1, ingredientes: quedan },
        ...restante.slice(indice + 1),
      ];
    }

    // Una sola unidad: si ya hay una línea igual, se junta con ella.
    if (destino !== -1) return carrito.map(sumarAlDestino).filter((_, i) => i !== indice);
  }

  return carrito.map((item, i) => (i === indice ? { ...item, ingredientes: quedan } : item));
}

// ─── Consumo de stock ───────────────────────────────────────────────────────

/**
 * Lo que descuenta una línea, en unidad base: [{ idProducto, nombre, cantidad }].
 * Una receta descuenta cada ingrediente incluido (los quitados no se descuentan).
 */
export function consumosDeLinea(linea) {
  if (linea.esReceta) {
    const unidades = Number(linea.cantidad) || 1;
    const incluidos = linea.ingredientes || [];
    return (linea.ingredientesReceta || [])
      .filter((ing) => incluidos.includes(ing.nombre))
      .map((ing) => ({
        idProducto: ing.idProducto,
        nombre: ing.nombreProducto || ing.nombre,
        cantidad: (Number(ing.cantidadBase) || 0) * unidades,
      }));
  }
  return [{ idProducto: linea.id, nombre: linea.nombre, cantidad: cantidadADescontar(linea) }];
}

/**
 * Suma lo que consumen TODAS las líneas, por producto: un mismo producto usado por varias
 * líneas (o por varias recetas) se descuenta una sola vez, con el total.
 * @returns {Map<string, {nombre: string, pedido: number}>}
 */
export function consumoTotalPorProducto(lineas) {
  const requeridos = new Map();
  for (const linea of lineas ?? []) {
    for (const c of consumosDeLinea(linea)) {
      if (!c.idProducto) throw new Error(`El producto "${c.nombre}" no tiene id.`);
      const previo = requeridos.get(c.idProducto);
      requeridos.set(c.idProducto, { nombre: c.nombre, pedido: (previo?.pedido ?? 0) + c.cantidad });
    }
  }
  return requeridos;
}

/**
 * Compara el consumo total del carrito con el stock de los productos (en vivo).
 * Devuelve los que no alcanzan: [{ id, nombre, disponible, pedido }].
 */
export function faltantesDeStock(lineas, productos) {
  const porId = new Map((productos ?? []).map((p) => [p.id, p]));
  return [...consumoTotalPorProducto(lineas)]
    .map(([id, { nombre, pedido }]) => ({
      id, nombre, pedido, disponible: Number(porId.get(id)?.stockActual) || 0,
    }))
    .filter((f) => f.disponible < f.pedido);
}

// ─── Lo que se guarda en `ventas` ───────────────────────────────────────────

/**
 * Forma en que se guarda cada línea en `ventas`: solo lo esencial, sin stock.
 * Para granel `cantidad` va en kg / lt y `precio` es por kg / lt.
 * Para recetas, `id` es el id de la receta y, solo si el cliente pidió quitar algo,
 * se agrega `sinIngredientes` (para saber qué NO se descontó).
 */
export function lineaParaGuardar(linea) {
  const guardada = {
    id:       linea.id,
    nombre:   linea.nombre,
    precio:   Number(linea.precio) || 0,
    cantidad: Number(linea.cantidad) || 1,
  };
  if (linea.esReceta) {
    const incluidos = linea.ingredientes || [];
    const sin = (linea.ingredientesReceta || [])
      .map((ing) => ing.nombre)
      .filter((nombre) => !incluidos.includes(nombre));
    if (sin.length > 0) guardada.sinIngredientes = sin;
  }
  return guardada;
}