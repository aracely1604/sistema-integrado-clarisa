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

// ─── Estimación de producción según el stock actual ─────────────────────────
// Para cada ingrediente, calcula cuántas unidades de la receta alcanzan con
// el stock del producto asignado: floor(stockActual / cantidadRequerida).
// El mínimo entre todos los ingredientes es lo que realmente se puede
// preparar, y ese ingrediente es el "limitante" (el cuello de botella).
//
// Si algún ingrediente no tiene producto asignado todavía, se cuenta como
// 0 unidades posibles para ESE ingrediente (bloquea toda la receta), pero
// se marca con `sinAsignar: true` para que la UI pueda explicar por qué.
//
// Nota: asume que la unidad del producto asignado coincide con la unidad
// declarada en el ingrediente (g/ml/unidad) — no hace conversión de unidades.
export function calcularProduccionEstimada(recetaGlobal, asignacion, productosLocal) {
  const ingredientes = recetaGlobal?.ingredientes ?? [];

  if (!asignacion || ingredientes.length === 0) {
    return { cantidadPreparable: 0, ingredienteLimitante: null, detalle: [] };
  }

  const productosPorId = new Map(productosLocal.map((p) => [p.id, p]));

  const detalle = ingredientes.map((ing) => {
    const asignado = (asignacion.ingredientes ?? []).find((a) => a.idIngredienteGlobal === ing.id);
    const producto = asignado ? productosPorId.get(asignado.idProductoLocal) : null;
    const cantidadRequerida = Number(ing.cantidad) || 0;
    const stockDisponible = producto ? Number(producto.stockActual) || 0 : 0;
    const unidadesPosibles = (!producto || cantidadRequerida <= 0)
      ? 0
      : Math.floor(stockDisponible / cantidadRequerida);

    return {
      idIngrediente: ing.id,
      nombreIngrediente: ing.nombre,
      nombreProducto: producto?.nombre ?? null,
      sinAsignar: !producto,
      cantidadRequerida,
      unidadMedida: ing.unidadMedida,
      stockDisponible,
      unidadesPosibles,
    };
  });

  const ingredienteLimitante = detalle.reduce(
    (min, item) => (item.unidadesPosibles < min.unidadesPosibles ? item : min),
    detalle[0]
  );

  return {
    cantidadPreparable: ingredienteLimitante.unidadesPosibles,
    ingredienteLimitante,
    detalle,
  };
}
// ─── Resumen de las recetas de un local (para el dashboard) ─────────────────
// recetasConEstado: [{ receta, asignacion }] — todas las recetas globales, con su
// asignación en ESTE local (o null si el local no la tiene asignada).
// productosLocal: productos del local con su stock (misma forma que usa
// calcularProduccionEstimada).
//
// Devuelve:
//  - total / activas / inactivas / sinAsignar: conteos (total = recetas asignadas a este local)
//  - preparables: cuántas recetas ACTIVAS se pueden preparar hoy (al menos 1 unidad)
//  - recetas: cada receta asignada con cuántas unidades se pueden preparar y su ingrediente
//    limitante (más urgentes primero: activas, menos unidades)
//  - ingredienteClave: el ingrediente que más recetas del local necesitan (el "más importante":
//    si falta, frena más producción). Es null si ningún ingrediente se repite en 2+ recetas.
//  - ranking: los 5 ingredientes más usados, con en cuántas recetas aparecen
export function resumirRecetasLocal(recetasConEstado, productosLocal) {
  const asignadas = (recetasConEstado ?? []).filter((r) => r.asignacion);

  const recetas = asignadas.map(({ receta, asignacion }) => {
    const estimacion = calcularProduccionEstimada(receta, asignacion, productosLocal ?? []);
    const lim = estimacion.ingredienteLimitante;
    return {
      id: receta.id,
      nombre: receta.nombre,
      activa: Boolean(asignacion.activo),
      preparables: estimacion.cantidadPreparable,
      limitante: lim
        ? { nombreIngrediente: lim.nombreIngrediente, nombreProducto: lim.nombreProducto, sinAsignar: lim.sinAsignar }
        : null,
    };
  }).sort((a, b) =>
    (Number(b.activa) - Number(a.activa))
    || (a.preparables - b.preparables)
    || a.nombre.localeCompare(b.nombre, 'es'));

  // En cuántas recetas aparece cada ingrediente (una vez por receta, sin importar la cantidad)
  const conteo = new Map();
  asignadas.forEach(({ receta }) => {
    const vistos = new Set();
    (receta.ingredientes ?? []).forEach((ing) => {
      const clave = normalizar(ing.nombre);
      if (!clave || vistos.has(clave)) return;
      vistos.add(clave);
      const actual = conteo.get(clave) ?? { nombre: String(ing.nombre).trim(), recetas: 0 };
      actual.recetas += 1;
      conteo.set(clave, actual);
    });
  });
  const ranking = [...conteo.values()]
    .sort((a, b) => (b.recetas - a.recetas) || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, 5);

  const activas = recetas.filter((r) => r.activa).length;
  return {
    total: asignadas.length,
    activas,
    inactivas: asignadas.length - activas,
    sinAsignar: (recetasConEstado ?? []).length - asignadas.length,
    preparables: recetas.filter((r) => r.activa && r.preparables > 0).length,
    recetas,
    ingredienteClave: ranking[0] && ranking[0].recetas >= 2
      ? { nombre: ranking[0].nombre, recetas: ranking[0].recetas, de: asignadas.length }
      : null,
    ranking,
  };
}