// ─── Model: Receta Global ─────────────────────────────────────────────────
// Define la forma de los datos de una receta global y sus ingredientes,
// junto con validaciones puras de estructura (sin Firestore, sin React).
//
// Una receta global es la plantilla única de ingredientes/cantidades que
// usará todo el sistema. NO almacena precio, estado ni productos de local:
// eso se define después, por cada local, en otra colección/entidad.

// ─── Unidades de medida permitidas ──────────────────────────────────────────
export const UNIDADES_MEDIDA_RECETA = [
  { value: 'unidad', label: 'unidad' },
  { value: 'g',      label: 'g' },
  { value: 'ml',     label: 'ml' },
];

const UNIDADES_MEDIDA_VALIDAS = UNIDADES_MEDIDA_RECETA.map(u => u.value);

// ─── Forma base de los datos (referencia / defaults del formulario) ────────
export const RECETA_FORM_INIT = {
  nombre: '',
  ingredientes: [],
};

export function crearIngredienteVacio() {
  return {
    id: generarIdIngrediente(),
    nombre: '',
    cantidad: '',
    unidadMedida: 'unidad',
    equivalencia: '',
  };
}

// ─── Generación de ids ──────────────────────────────────────────────────────
// Usados por el Controller al preparar los datos antes de guardar.
export function generarIdIngrediente() {
  return (crypto?.randomUUID?.() ?? `ing_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
}

// ─── Normalización (para comparar duplicados ignorando mayúsculas/espacios) ─
export function normalizarTexto(valor) {
  return (valor ?? '').trim().toLowerCase();
}

// ─── Validación de un ingrediente individual ────────────────────────────────
// Devuelve un objeto de errores (vacío si el ingrediente es válido).
export function validarIngrediente(ingrediente) {
  const errores = {};

  if (!normalizarTexto(ingrediente.nombre)) {
    errores.nombre = 'El nombre del ingrediente es obligatorio';
  }

  const cantidad = Number(ingrediente.cantidad);
  if (ingrediente.cantidad === '' || ingrediente.cantidad === null || ingrediente.cantidad === undefined) {
    errores.cantidad = 'La cantidad es obligatoria';
  } else if (Number.isNaN(cantidad) || cantidad <= 0) {
    errores.cantidad = 'La cantidad debe ser mayor que cero';
  }

  if (!UNIDADES_MEDIDA_VALIDAS.includes(ingrediente.unidadMedida)) {
    errores.unidadMedida = 'Selecciona una unidad de medida válida';
  }

  if (!normalizarTexto(ingrediente.equivalencia)) {
    errores.equivalencia = 'La equivalencia es obligatoria';
  }

  return errores;
}

// ─── Validación completa de la receta ───────────────────────────────────────
// recetasExistentes: lista de recetas ya guardadas (para chequear nombre repetido).
// idRecetaActual: si se está editando, se excluye a sí misma de la comparación.
export function validarReceta(receta, recetasExistentes = [], idRecetaActual = null) {
  const errores = {};
  const erroresIngredientes = [];

  if (!normalizarTexto(receta.nombre)) {
    errores.nombre = 'El nombre de la receta es obligatorio';
  } else {
    const nombreNormalizado = normalizarTexto(receta.nombre);
    const existeDuplicado = recetasExistentes.some(r =>
      r.id !== idRecetaActual && normalizarTexto(r.nombre) === nombreNormalizado
    );
    if (existeDuplicado) {
      errores.nombre = 'Ya existe una receta con este nombre';
    }
  }

  const ingredientes = receta.ingredientes ?? [];

  if (ingredientes.length === 0) {
    errores.ingredientes = 'Debe existir al menos un ingrediente';
  }

  ingredientes.forEach((ingrediente, index) => {
    const erroresIng = validarIngrediente(ingrediente);
    if (Object.keys(erroresIng).length > 0) {
      erroresIngredientes[index] = erroresIng;
    }
  });

  const nombresVistos = new Set();
  ingredientes.forEach((ingrediente, index) => {
    const nombreNormalizado = normalizarTexto(ingrediente.nombre);
    if (!nombreNormalizado) return;
    if (nombresVistos.has(nombreNormalizado)) {
      erroresIngredientes[index] = {
        ...erroresIngredientes[index],
        nombre: 'Ingrediente repetido en esta receta',
      };
    }
    nombresVistos.add(nombreNormalizado);
  });

  if (erroresIngredientes.some(e => e && Object.keys(e).length > 0)) {
    errores.ingredientesDetalle = erroresIngredientes;
  }

  return errores;
}

export function esRecetaValida(errores) {
  return Object.keys(errores).length === 0;
}