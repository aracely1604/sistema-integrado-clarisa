// screens/inventario/useRecetasLocal.js
//
// Recetas de un local EN VIVO, ya resumidas para el dashboard: cuántas hay, cuántas
// unidades de cada una se pueden preparar con el stock actual (y qué ingrediente limita)
// y cuál es el ingrediente que más recetas necesitan.
//
// Usa la misma cuenta que "Producción estimada" de GestionRecetasForms
// (calcularProduccionEstimada), así los números coinciden en ambas pantallas.
// `productosLocal` es la lista que entrega useInventarioAlertas (stock en vivo).

import { useEffect, useMemo, useState } from 'react';
import { suscribirRecetasConEstadoLocal } from '../../controllers/RecetaLocalControl';
import { resumirRecetasLocal } from '../../models/RecetaLocalModel';

const SIN_RECETAS = [];
const SIN_PRODUCTOS = [];

export function useRecetasLocal(local, productosLocal = SIN_PRODUCTOS) {
  // Se guarda junto al local al que pertenece: al cambiar de local se ignora lo anterior.
  const [estado, setEstado] = useState({ local: null, lista: SIN_RECETAS });

  useEffect(() => {
    const unsubscribe = suscribirRecetasConEstadoLocal(local, (lista) => setEstado({ local, lista }));
    return () => unsubscribe?.();
  }, [local]);

  const cargando = estado.local !== local;
  const lista = cargando ? SIN_RECETAS : estado.lista;

  const resumen = useMemo(() => resumirRecetasLocal(lista, productosLocal), [lista, productosLocal]);

  return { resumen, cargando };
}