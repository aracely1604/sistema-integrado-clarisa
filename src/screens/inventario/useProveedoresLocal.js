// screens/inventario/useProveedoresLocal.js
//
// Proveedores ACTIVOS asignados a un local, EN VIVO desde Firestore (reemplaza la lista de ejemplo
// PROVEEDORES_INIT de inventarioData.js). Une, por cada asignación de locales/{local}/proveedores,
// los datos del proveedor global (nombre, empresa, teléfono) con los días de visita de este local.
//
// Cada elemento es un ProveedorModel: { id, nombre, empresa, telefono, dias: number[] (0 = domingo),
// locales: [local], activo, initials }. Se ignoran los proveedores desactivados: no deben aparecer
// como visitas esperadas ni como sugerencia de compra.

import { useEffect, useMemo, useState } from 'react';
import { suscribirProveedoresPorLocal } from '../../controllers/ProveedorControl';

const SIN_PROVEEDORES = [];

export function useProveedoresLocal(local) {
  // Se guarda junto al local al que pertenece: al cambiar de local, lo del anterior se ignora al
  // instante (no se pinta la agenda de un local con los proveedores de otro mientras llegan los nuevos).
  const [estado, setEstado] = useState({ local: null, lista: SIN_PROVEEDORES });

  useEffect(() => {
    if (!local) return undefined;
    const unsubscribe = suscribirProveedoresPorLocal(local, (lista) => setEstado({ local, lista }));
    return () => unsubscribe?.();
  }, [local]);

  const lista = estado.local === local ? estado.lista : SIN_PROVEEDORES;
  return useMemo(() => lista.filter((p) => p.activo !== false), [lista]);
}