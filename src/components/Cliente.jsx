import React from 'react';

function Cliente({ navigate }) {
  return (
    <div style={{ padding: '20px' }}>
      <h2>🍕 Vista Cliente (Delivery)</h2>
      <button onClick={() => navigate('login')}>Ir a Login</button>
    </div>
  );
}
export default Cliente;