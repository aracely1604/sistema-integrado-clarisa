// models/VencimientoConfig.js
//
// Umbrales de vencimiento (UN solo lugar). Los leen el controlador (para bloquear
// movimientos) y las pantallas (a través de screens/inventario/inventarioHelpers.js,
// que los reexporta).
//
//  - DIAS_VENCIMIENTO_MAX: hasta cuántos días antes un producto cuenta como "por vencer".
//    Más allá de esto ni se muestra en las alertas ni afecta a la reposición.
//  - DIAS_CRITICO: desde aquí hacia abajo la oferta se activa automáticamente.
export const DIAS_VENCIMIENTO_MAX = 30;
export const DIAS_CRITICO = 10;