// ─── Model: Asignación de receta global a un local ─────────────────────────
// Cada local, para cada receta global, define ÚNICAMENTE:
//   - qué producto de su propio inventario representa cada ingrediente,
//   - el precio de venta,
//   - si está activa o no en ese local.
// Cantidades y unidades de medida NUNCA se duplican acá: son fijas y viven
// solo en la receta global (recetas/{idReceta}), que es la fuente de verdad
// para el descuento de inventario al vender.

// ─── Forma base para el formulario, a partir de una receta global ─────────
export function crearAsignacionVacia(recetaGlobal) {
  return {
    idRecetaGlobal: recetaGlobal.id,
    precioVenta: '',
    activo: false,
    ingredientes: (recetaGlobal.ingredientes ?? []).map(ing => ({
      idIngredienteGlobal: ing.id,
      idProductoLocal: '',
    })),
  };
}

// Clona una asignación ya existente (para editar) en la forma que espera el formulario.
export function clonarAsignacionParaEditar(asignacion, recetaGlobal) {
  const ingredientesExistentes = new Map(
    (asignacion.ingredientes ?? []).map(i => [i.idIngredienteGlobal, i.idProductoLocal])
  );
  return {
    idRecetaGlobal: recetaGlobal.id,
    precioVenta: String(asignacion.precioVenta ?? ''),
    activo: Boolean(asignacion.activo),
    ingredientes: (recetaGlobal.ingredientes ?? []).map(ing => ({
      idIngredienteGlobal: ing.id,
      idProductoLocal: ingredientesExistentes.get(ing.id) ?? '',
    })),
  };
}

// ─── Validación ──────────────────────────────────────────────────────────
export function validarAsignacion(asignacion) {
  const errores = {};

  const precio = Number(asignacion.precioVenta);
  if (asignacion.precioVenta === '' || asignacion.precioVenta === null || asignacion.precioVenta === undefined) {
    errores.precioVenta = 'El precio de venta es obligatorio';
  } else if (Number.isNaN(precio) || precio <= 0) {
    errores.precioVenta = 'El precio debe ser mayor que cero';
  }

  const ingredientes = asignacion.ingredientes ?? [];
  const erroresIngredientes = [];
  ingredientes.forEach((ing, index) => {
    if (!ing.idProductoLocal) {
      erroresIngredientes[index] = 'Selecciona un producto del inventario para este ingrediente';
    }
  });
  if (erroresIngredientes.some(Boolean)) {
    errores.ingredientesDetalle = erroresIngredientes;
  }

  return errores;
}

export function esAsignacionValida(errores) {
  return Object.keys(errores).length === 0;
}

// ─── Normalización para comparar nombres (minúsculas, sin tildes) ──────────
function normalizar(texto) {
  return (texto ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

// ─── Filtrado de productos por ingrediente ──────────────────────────────
// A diferencia de un simple "ordenar", esto FILTRA: el dropdown de un
// ingrediente como "papas" solo debe mostrar productos del local cuyo
// nombre se relacione con "papas" (ej. "Papas fritas 1kg", "Papas rejilla").
// Coincide si el nombre del producto contiene el término completo del
// ingrediente, o si comparten alguna palabra de 3+ letras.
export function filtrarProductosPorIngrediente(productos, nombreIngrediente) {
  const termino = normalizar(nombreIngrediente);
  if (!termino) return productos;

  const palabrasTermino = termino.split(/\s+/).filter((p) => p.length >= 3);

  return productos.filter((p) => {
    const nombreProducto = normalizar(p.nombre);
    if (nombreProducto.includes(termino)) return true;
    return palabrasTermino.some((palabra) => nombreProducto.includes(palabra));
  });
}

// ─── Productos disponibles para el dropdown de UN ingrediente ──────────────
// Combina el filtro por nombre con la exclusión de productos que ya fueron
// elegidos para OTRO ingrediente de la misma receta (para no poder asignar,
// ej., el mismo producto "Papas fritas 1kg" a dos ingredientes distintos).
// Si el filtro por nombre no encuentra nada, cae de vuelta a mostrar todos
// los productos no-ya-usados, para no dejar al usuario sin opciones.
export function productosDisponiblesParaIngrediente(productos, ingrediente, asignacion) {
  const idsUsadosEnOtros = new Set(
    (asignacion.ingredientes ?? [])
      .filter((a) => a.idIngredienteGlobal !== ingrediente.id && a.idProductoLocal)
      .map((a) => a.idProductoLocal)
  );

  const noUsados = productos.filter((p) => !idsUsadosEnOtros.has(p.id));
  const filtradosPorNombre = filtrarProductosPorIngrediente(noUsados, ingrediente.nombre);

  return filtradosPorNombre.length > 0 ? filtradosPorNombre : noUsados;
}