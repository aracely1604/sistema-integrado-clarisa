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
// de escritorio o móvil activa se omiten automáticamente (los del móvil usan el prefijo
// inv-m- y, además, solo aparecen los de la pestaña que esté abierta).
const PASOS_TOUR_INVENTARIO = [
  // ── Escritorio ──
  { target: '[data-tour="inv-local"]', content: 'Elige el local con el que quieres trabajar. Al abrirlo se despliegan sus accesos: Inventario, Recetas, Proveedores y Reporte.' },
  { target: '[data-tour="inv-alertas"]', content: 'Estado del local: cuántas cosas piden acción (productos vencidos o con stock crítico), cuántos avisos hay (stock bajo o por vencer) o si todo está en orden. Pasa el mouse para ver el desglose.' },
  { target: '[data-tour="inv-metricas"]', content: 'Métricas del local: productos con stock bajo, valor en riesgo (stock vencido o por vencer, a precio de venta) y ofertas activas. Presiónalo para ver el detalle.' },
  { target: '[data-tour="inv-recetas"]', content: 'Recetas del local: cuántas hay, cuántas se pueden preparar hoy y el ingrediente más usado. Presiónalo para ver cuántas unidades se pueden preparar de cada una y qué ingrediente las limita.' },
  { target: '[data-tour="inv-proveedores"]', content: 'Total de proveedores y cuántos visitan hoy. Presiónalo para ver las próximas visitas.' },
  { target: '[data-tour="inv-agenda"]', content: 'Agenda semanal con los días de visita de los proveedores. Presiona un día para ver más información.' },
  { target: '[data-tour="inv-stock-critico"]', content: 'Stock a reponer: arriba lo que está en nivel crítico y abajo el stock bajo. Presiona una alerta para ver su detalle y las recomendaciones. Si el producto está vencido, no se puede reponer hasta eliminar su stock.' },
  { target: '[data-tour="inv-por-vencer"]', content: 'Control de vencimientos: arriba los productos vencidos y abajo los que están por vencer. Presiona uno para activar su oferta o eliminar el stock vencido. Cuando faltan 10 días o menos, la oferta se activa sola.' },
  { target: '[data-tour="inv-ingresados"]', content: 'Productos que ingresaron hoy al inventario de este local.' },
  { target: '[data-tour="inv-acciones"]', content: 'Accesos rápidos según tu rol: registrar productos, gestionar recetas y proveedores, activar el modo oscuro y cerrar sesión.' },
  // ── Móvil ──
  { target: '[data-tour="inv-m-menu"]', content: 'Abre el menú lateral: el reporte del local, registrar productos, gestionar recetas y proveedores, el modo oscuro y cerrar sesión. El menú no se cierra al presionar una opción: toca el fondo para cerrarlo.' },
  { target: '[data-tour="inv-m-estado"]', content: 'Estado del local: cuántas cosas piden acción (productos vencidos o con stock crítico), cuántos avisos hay (stock bajo o por vencer) o si todo está en orden.' },
  { target: '[data-tour="inv-m-locales"]', content: 'Cambia de local con estas pestañas.' },
  { target: '[data-tour="inv-m-metricas"]', content: 'Resumen rápido del local: stock bajo, valor en riesgo, ofertas activas y recetas (según tu rol). Presiona una tarjeta para ver su detalle.' },
  { target: '[data-tour="inv-m-tabs"]', content: 'Cambia entre las secciones del inventario: Inventario, Recetas y Proveedores.' },
  { target: '[data-tour="inv-m-gestion"]', content: 'Entra a la gestión completa de esta sección: los productos, las recetas o los proveedores del local.' },
  { target: '[data-tour="inv-m-stock"]', content: 'Stock a reponer: lo crítico arriba y el stock bajo abajo. Presiona una alerta para ver su detalle y las recomendaciones. Si el producto está vencido, la reposición no está disponible hasta eliminar su stock.' },
  { target: '[data-tour="inv-m-vencimientos"]', content: 'Control de vencimientos: arriba los vencidos y abajo los por vencer. Presiona uno para activar su oferta o eliminar el stock vencido. Cuando faltan 10 días o menos, la oferta se activa sola.' },
  { target: '[data-tour="inv-m-ingresados"]', content: 'Productos que ingresaron hoy al inventario de este local.' },
  { target: '[data-tour="inv-m-recetas"]', content: 'Recetas del local: cuántas hay, cuántas se pueden preparar hoy y el ingrediente más usado. Presiona una tarjeta o una receta para ver cuántas unidades se pueden preparar y qué ingrediente la limita.' },
  { target: '[data-tour="inv-m-agenda"]', content: 'Agenda semanal con los días de visita de los proveedores. Presiona un día para ver más información.' },
  { target: '[data-tour="inv-m-visitas"]', content: 'Proveedores que visitan hoy y próximas visitas del local. Presiona uno para ver su información.' },
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
    activeLocal, activeTab, proveedores,
    modalStock, modalVenc, modalProv, modalNuevoProv,
    recetasData, productosData, inventarioReciente,
    visitanHoyVisible, visitanHoyDismissedToday,
  };
  const actions = {
    setActiveLocal, setActiveTab,
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