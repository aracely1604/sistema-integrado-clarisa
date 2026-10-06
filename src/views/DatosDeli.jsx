import React from 'react';
import '../styles/views/simple.css';

function DatosDeli({ navigate }) {
  return (
    <div className="simple-view">
      <h2>Datos Repartidor</h2>
      <button onClick={() => navigate('delivery')}>Volver</button>
    </div>
  );
}

export default DatosDeli;
