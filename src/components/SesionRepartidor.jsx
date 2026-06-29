import React from 'react';

function SesionRepartidor({ navigate }) {
  return (
    <div style={{ padding: '20px' }}>
      <h2>Registro Delivery</h2>
      <button onClick={() => navigate('login')}>Volver</button>
    </div>
  );
}
export default SesionRepartidor;