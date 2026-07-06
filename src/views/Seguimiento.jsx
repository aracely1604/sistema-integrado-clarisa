import React from 'react';
import '../styles/views/simple.css';

function Seguimiento({ navigate }) {
  return (
    <div className="simple-view">
      <h2>Seguimiento de Pedido</h2>
      <button onClick={() => navigate('cliente')}>Volver</button>
    </div>
  );
}

export default Seguimiento;
