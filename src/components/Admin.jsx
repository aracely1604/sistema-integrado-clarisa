import React, { useState, useEffect } from 'react';

function Admin({ navigate }) {
  const [ventas, setVentas] = useState([]);
  const [cajas, setCajas] = useState([]);

  useEffect(() => {
    setVentas(JSON.parse(localStorage.getItem("ventas")) || []);
    setCajas(JSON.parse(localStorage.getItem("cajas")) || []);
  }, []);

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Administrador</p>
          <h1>Panel de control</h1>
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('portal')}>Volver al portal</button>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <span>Ventas totales</span>
          <strong>${ventas.reduce((a, b) => a + b.total, 0).toLocaleString('es-CL')}</strong>
          <small>{ventas.length} ventas registradas</small>
        </div>
        <div className="stat-card">
          <span>Cajas abiertas</span>
          <strong>{cajas.length}</strong>
          <small>Movimientos disponibles</small>
        </div>
      </section>
    </main>
  );
}
export default Admin;
