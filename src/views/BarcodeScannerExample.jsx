import { useState } from 'react';
import BarcodeScanner from '../components/BarcodeScanner';

/** Vista mínima de referencia para integrar el lector en cualquier pantalla. */
export default function BarcodeScannerExample() {
  const [ultimoCodigo, setUltimoCodigo] = useState('');

  const manejarCodigoEscaneado = (codigo) => {
    setUltimoCodigo(codigo);
    // Aquí se puede buscar el producto o llamar a la lógica de la vista.780295000232
    
  };

  return (
    <section>
      <BarcodeScanner onScan={manejarCodigoEscaneado} />
      <p>Escanea un código de barras. Último código: {ultimoCodigo || '—'}</p>
    </section>
  );
}
