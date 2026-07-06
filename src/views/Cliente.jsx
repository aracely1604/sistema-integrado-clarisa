import React from 'react';
import '../styles/views/simple.css';

function Cliente({ navigate }) {
  return (
    <div className="simple-view">
      <h2>Vista Cliente (Delivery)</h2>
      <button onClick={() => navigate('login')}>Ir a Login</button>
    </div>
  );
}

export default Cliente;
