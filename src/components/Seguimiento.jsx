import React from 'react';

function Seguimiento({ navigate }) {
  return (
    <div style={{ padding: '20px' }}>
      <h2>📦 Seguimiento de Pedido</h2>
      <button onClick={() => navigate('cliente')}>Volver</button>
    </div>
  );
}
export default Seguimiento;