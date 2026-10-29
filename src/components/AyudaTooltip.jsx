// components/AyudaTooltip.jsx
//
// HU-50: ayuda contextual en pantallas y campos.
// Ícono "?" reutilizable: al hacer clic muestra una explicación breve sin
// que el usuario pierda los datos que ya escribió ni salga de la pantalla.
//
// Uso junto a una etiqueta de campo:
//   <label>
//     RUT <AyudaTooltip texto="Formato: 12345678-9, con guion y dígito verificador." />
//   </label>

import { useState, useRef, useEffect } from 'react';
import './AyudaTooltip.css';

function AyudaTooltip({ texto }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    function alHacerClicFuera(evento) {
      if (contenedorRef.current && !contenedorRef.current.contains(evento.target)) {
        setAbierto(false);
      }
    }
    document.addEventListener('mousedown', alHacerClicFuera);
    return () => document.removeEventListener('mousedown', alHacerClicFuera);
  }, []);

  return (
    <span className="ayuda-contenedor" ref={contenedorRef}>
      <button
        type="button"
        className="ayuda-icono"
        aria-label="Mostrar ayuda"
        aria-expanded={abierto}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto((v) => !v);
        }}
      >
        ?
      </button>

      {abierto && (
        <span className="ayuda-popover" role="tooltip">
          {texto}
        </span>
      )}
    </span>
  );
}

export default AyudaTooltip;
