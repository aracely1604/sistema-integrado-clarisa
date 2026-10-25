import { useEffect, useRef } from 'react';

/**
 * Escucha lectores que se comportan como teclado y terminan cada lectura
 * con Enter (CR/LF). El buffer se limpia después de cada lectura y también
 * tras una pausa, para que una lectura incompleta no contamine la siguiente.
 *
 * Uso: <BarcodeScanner onScan={(codigo) => console.log(codigo)} />
 */
export default function BarcodeScanner({ onScan, timeoutMs = 100, enabled = true }) {
  const onScanRef = useRef(onScan);

  // Mantiene actualizada la función sin reinstalar el listener del teclado.
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return undefined;

    let buffer = '';
    let resetTimer;

    const limpiarBuffer = () => {
      buffer = '';
      clearTimeout(resetTimer);
    };

    const manejarTecla = (event) => {
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;

      // Enter es el sufijo habitual; también se aceptan CR y LF explícitos.
      if (event.key === 'Enter' || event.key === '\r' || event.key === '\n') {
        const codigo = buffer.trim();
        limpiarBuffer();
        if (codigo) onScanRef.current?.(codigo);
        return;
      }

      if (event.key === 'Backspace') {
        buffer = buffer.slice(0, -1);
      } else if (event.key.length === 1) {
        buffer += event.key;
      } else {
        return;
      }

      clearTimeout(resetTimer);
      resetTimer = setTimeout(limpiarBuffer, timeoutMs);
    };

    window.addEventListener('keydown', manejarTecla);
    return () => {
      window.removeEventListener('keydown', manejarTecla);
      limpiarBuffer();
    };
  }, [enabled, timeoutMs]);

  // No captura el foco: permite seguir usando los formularios normalmente.
  return null;
}
