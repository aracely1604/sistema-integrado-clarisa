// models/UnidadesMedidaModel.js
//
// ÚNICO lugar donde se convierten unidades entre la forma en que la persona compra / ingresa
// (kg, lt) y la unidad BASE en la que se guarda todo el stock (g, ml, uds).
// Lo usan productos (gestionProductosData re-exporta estas funciones) y recetas
// (RecetaLocalModel, HistorialRecetaControl): así no existen dos conversores que puedan
// diferir.

// Mapea la unidad de medida del catálogo global a la unidad BASE en la que
// se almacena internamente el stock de cada local: kilogramos -> gramos,
// litros -> mililitros, unidad -> unidades (sin conversión).
// Acepta tanto 'kilogramos'/'litros' (nombre completo, como se definió en
// UNIDADES_MEDIDA) como 'g'/'ml' directamente (como quedó guardado en la
// base real) — así funciona sin importar cuál de las dos formas tenga el
// documento en Firestore.
export function unidadBaseDesdeUnidadMedida(unidadMedida) {
  if (unidadMedida === 'kilogramos' || unidadMedida === 'g') return 'g';
  if (unidadMedida === 'litros' || unidadMedida === 'ml') return 'ml';
  return 'uds';
}

// El usuario SIEMPRE ingresa cantidades en la unidad "de compra" (kg/L) —
// así se reabastece en la vida real — pero internamente todo se guarda en
// la unidad base (g/ml). Esta función hace esa conversión antes de guardar.
export function convertirACantidadBase(cantidadIngresada, unidadBase) {
  const num = Number(cantidadIngresada) || 0;
  if (unidadBase === 'g' || unidadBase === 'ml') return Math.round(num * 1000);
  return Math.round(num);
}

// La inversa: toma una cantidad guardada en unidad base (g/ml) y la
// convierte de vuelta a la unidad "de compra" (kg/L), para precargar un
// campo editable (ej. abrir "Editar producto" y mostrar el stock mínimo en kg).
export function convertirBaseAIngreso(cantidadBase, unidadBase) {
  const num = Number(cantidadBase) || 0;
  if (unidadBase === 'g' || unidadBase === 'ml') {
    return Math.round((num / 1000) * 100) / 100; // 2 decimales
  }
  return num;
}

// El "costo unitario" que ingresa el usuario es siempre $/kg o $/L (cómo
// compra). Como cantidad se guarda en unidad base (g/ml), el costo unitario
// también se convierte a base ($/g ó $/ml) ANTES de guardar — así
// valorTotal = valorUnitarioBase * cantidadBase sigue dando el monto correcto.
export function convertirValorUnitarioABase(valorPorUnidadIngreso, unidadBase) {
  const num = Number(valorPorUnidadIngreso) || 0;
  if (unidadBase === 'g' || unidadBase === 'ml') return num / 1000;
  return num;
}

// La inversa: para MOSTRAR el costo unitario guardado (ej. en el historial)
// de vuelta en $/kg o $/L, que es como la persona lo ingresó.
export function convertirValorUnitarioAIngreso(valorPorUnidadBase, unidadBase) {
  const num = Number(valorPorUnidadBase) || 0;
  if (unidadBase === 'g' || unidadBase === 'ml') return num * 1000;
  return num;
}