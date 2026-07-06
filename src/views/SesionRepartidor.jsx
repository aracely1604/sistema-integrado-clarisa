import React from 'react';
import '../styles/views/simple.css';

function SesionRepartidor({ navigate }) {
  return (
    <div className="simple-view">
      <h2>Registro Delivery</h2>
      <button onClick={() => navigate('login')}>Volver</button>
    </div>
  );
}

export default SesionRepartidor;
