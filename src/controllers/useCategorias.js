// controllers/useCategorias.js
import { useEffect, useState } from 'react';
import { suscribirCategorias } from './CategoriaControl';

// Lista de categorías en tiempo real, leída de Firestore (configuracion/categorias).
// `base` = CATEGORIAS: solo siembra la BD la primera vez o sirve de respaldo si falla.
// Parte vacía y se llena con el primer dato de la BD (no se muestra la lista base antes).
export function useCategorias(base = []) {
  const [categorias, setCategorias] = useState([]);

  useEffect(() => {
    const cancelar = suscribirCategorias(setCategorias, base);
    return () => cancelar?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return categorias;
}