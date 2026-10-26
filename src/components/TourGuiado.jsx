// components/TourGuiado.jsx
//
// Tour guiado manual para una pantalla (HU-50): botón "?" flotante + Joyride.
// Reutilizable: cada pantalla solo entrega su lista de pasos y marca los elementos con data-tour.
//
// Uso:
//   <TourGuiado steps={[{ target: '[data-tour="mi-seccion"]', content: 'Explicación...' }]} />
//
// variante="encabezado": en vez del botón flotante, muestra un botón "?" pequeño para poner
// dentro del encabezado de una ventana emergente. Usa zIndex alto para verse sobre la ventana.
//
// Al abrirse, se omiten los pasos cuyo elemento no esté visible en pantalla (por ejemplo,
// secciones que solo existen en la versión de escritorio o en la móvil).

import { useState } from 'react';
import { Joyride, EVENTS } from 'react-joyride';
import './TourGuiado.css';

function elementoVisible(selector) {
  const el = document.querySelector(selector);
  if (!el) return false;
  const caja = el.getBoundingClientRect();
  return caja.width > 0 && caja.height > 0;
}

function TourGuiado({ steps, variante = 'flotante', zIndex = 100 }) {
  const [activo, setActivo] = useState(false);
  const [pasosVisibles, setPasosVisibles] = useState([]);

  const abrir = () => {
    const disponibles = steps.filter((paso) => elementoVisible(paso.target));
    if (disponibles.length === 0) return;
    setPasosVisibles(disponibles);
    setActivo(true);
  };

  return (
    <>
      <Joyride
        run={activo}
        continuous
        steps={pasosVisibles}
        onEvent={(datos) => {
          if (datos.type === EVENTS.TOUR_END) setActivo(false);
        }}
        options={{
          skipBeacon: true,
          zIndex,
          showProgress: true,
          buttons: ['back', 'close', 'skip', 'primary'],
        }}
        locale={{
          back: 'Anterior',
          close: 'Cerrar',
          last: 'Finalizar',
          next: 'Siguiente',
          nextWithProgress: 'Siguiente ({current} de {total})',
          skip: 'Saltar',
        }}
      />

      <button
        type="button"
        className={variante === 'encabezado' ? 'tour-btn-encabezado' : 'tour-fab'}
        onClick={abrir}
        aria-label="Ver tutorial de esta pantalla"
        title="Ver tutorial de esta pantalla"
      >
        ?
      </button>
    </>
  );
}

export default TourGuiado;
