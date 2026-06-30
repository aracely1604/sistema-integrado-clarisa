import React from 'react';

function DatosDeli({ navigate }) {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Datos Repartidor</h2>
      <button onClick={() => navigate('delivery')}>Volver</button>
    </div>
  );
}
export default DatosDeli;