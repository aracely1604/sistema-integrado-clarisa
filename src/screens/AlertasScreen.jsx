import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../controllers/AuthContext';

import {
  PROVEEDORES_INIT, RECETAS_DATA_INIT, PRODUCTOS_DATA_INIT, INVENTARIO_RECIENTE_INIT,
} from './inventario/inventarioData';
import DesktopLayout from './inventario/DesktopLayout';
import MobileLayout from './inventario/MobileLayout';
import TourGuiado from '../components/TourGuiado';

const DESKTOP_BREAKPOINT = 768;

// Tour guiado de Inventario (HU-50). Los pasos cuyo elemento no exista en la versión
// de escritorio o móvil activa se omiten automáticamente.
const PASOS_TOUR_INVENTARIO = [
  // ── Escritorio ──
  { target: '[data-tour="inv-modo"]', content: 'Cambia entre el modo Ventas y el modo Inventario del sistema.' },
  { target: '[data-tour="inv-local"]', content: 'Elige el local con el que quieres trabajar. Al abrirlo se despliegan sus accesos: Inventario, Recetas, Proveedores y Reporte.' },
  { target: '[data-tour="inv-alertas"]', content: 'Alertas del local activo: productos con stock crítico y productos por vencer.' },
  { target: '[data-tour="inv-metricas"]', content: 'Resumen del local: cantidad de productos, con stock bajo y por vencer. Presiónalo para ver el detalle.' },
  { target: '[data-tour="inv-recetas"]', content: 'Total de recetas del local, cuántas están activas y cuántas inactivas. Presiónalo para revisarlas.' },
  { target: '[data-tour="inv-proveedores"]', content: 'Total de proveedores y cuántos visitan hoy. Presiónalo para ver las próximas visitas.' },
  { target: '[data-tour="inv-agenda"]', content: 'Agenda semanal con los días de visita de los proveedores. Presiona un día para ver más información.' },
  { target: '[data-tour="inv-stock-critico"]', content: 'Productos agotados o bajo el stock mínimo. Presiona uno para ver su detalle y la recomendación de reposición.' },
  { target: '[data-tour="inv-por-vencer"]', content: 'Productos próximos a vencer, con los días que les quedan y su lote. Presiona uno para ver el detalle.' },
  { target: '[data-tour="inv-ingresados"]', content: 'Productos que ingresaron hoy al inventario de este local.' },
  { target: '[data-tour="inv-acciones"]', content: 'Accesos rápidos según tu rol: registrar productos, gestionar recetas y proveedores, activar el modo oscuro y cerrar sesión.' },
  // ── Móvil ──
  { target: '[data-tour="inv-m-menu"]', content: 'Abre el menú lateral: tu cuenta, modo oscuro, gestión de productos, recetas y proveedores, y cerrar sesión.' },
  { target: '[data-tour="inv-m-locales"]', content: 'Cambia de local con estas pestañas.' },
  { target: '[data-tour="inv-m-metricas"]', content: 'Resumen rápido del local. Presiona una tarjeta para ver su detalle.' },
  { target: '[data-tour="inv-m-tabs"]', content: 'Cambia entre las secciones del inventario: Inventario, Recetas y Proveedores.' },
];

// Hook simple para saber el ancho de la ventana (equivalente a useWindowDimensions de RN)
function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export default function AlertasScreen() {
  const width = useWindowWidth();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  // localActivo y setLocalActivo vienen del contexto; se inicializan
  // automáticamente con el primer local asignado al usuario al hacer login.
  const { localActivo: activeLocal, setLocalActivo: setActiveLocal } = useAuth();
  const [modo,           setModo]           = useState('inventario');
  const [activeTab,      setActiveTab]      = useState('inventario');
  const [modalStock,     setModalStock]     = useState(null);
  const [modalVenc,      setModalVenc]      = useState(null);
  const [modalProv,      setModalProv]      = useState(null);
  const [modalNuevoProv, setModalNuevoProv] = useState(false);
  const [proveedores,    setProveedores]    = useState(PROVEEDORES_INIT);
  const [recetasData,    setRecetasData]    = useState(RECETAS_DATA_INIT);
  const [productosData,  setProductosData]  = useState(PRODUCTOS_DATA_INIT);
  const [inventarioReciente] = useState(INVENTARIO_RECIENTE_INIT);
  const [visitanHoyVisible,        setVisitanHoyVisible]        = useState(false);
  const [visitanHoyDismissedToday, setVisitanHoyDismissedToday] = useState(false);

  const handleGuardarProveedor = useCallback((nuevo) => {
    setProveedores(prev => [...prev, nuevo]);
  }, []);

  const state = {
    activeLocal, modo, activeTab, proveedores,
    modalStock, modalVenc, modalProv, modalNuevoProv,
    recetasData, productosData, inventarioReciente,
    visitanHoyVisible, visitanHoyDismissedToday,
  };
  const actions = {
    setActiveLocal, setModo, setActiveTab,
    setModalStock, setModalVenc, setModalProv, setModalNuevoProv,
    handleGuardarProveedor, setRecetasData, setProductosData,
    setVisitanHoyVisible, setVisitanHoyDismissedToday,
  };

  return (
    <>
      {isDesktop
        ? <DesktopLayout state={state} actions={actions} />
        : <MobileLayout state={state} actions={actions} />}
      <TourGuiado steps={PASOS_TOUR_INVENTARIO} />
    </>
  );
}
