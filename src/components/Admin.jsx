import React, { useState, useEffect } from 'react';

const locales = [
  { id: 'general', nombre: 'General' },
  { id: 'almacen', nombre: 'Almacen' },
  { id: 'cafeteria', nombre: 'Cafeteria' },
  { id: 'comida_rapida', nombre: 'Comida rapida' },
];

const localesVentas = locales.filter((local) => local.id !== 'general');

const metodosPago = [
  { id: 'debito', nombre: 'Debito' },
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'transferencia', nombre: 'Transferencia' },
  { id: 'junaeb', nombre: 'Junaeb' },
  { id: 'pluxe', nombre: 'Pluxe' },
];

const normalizarLocal = (venta) => {
  const valor = String(venta.local || venta.modulo || venta.sucursal || '').toLowerCase();
  if (valor.includes('caf')) return 'cafeteria';
  if (valor.includes('comida') || valor.includes('rapida') || valor.includes('rapido')) return 'comida_rapida';
  return 'almacen';
};

const normalizarMetodoPago = (venta) => {
  const valor = String(venta.metodoPago || venta.metodo || venta.pago || '').toLowerCase();
  if (valor.includes('efectivo')) return 'efectivo';
  if (valor.includes('transfer')) return 'transferencia';
  if (valor.includes('junaeb')) return 'junaeb';
  if (valor.includes('pluxe')) return 'pluxe';
  return 'debito';
};

const obtenerFechaVenta = (venta) => {
  const valorFecha = venta.fecha || venta.createdAt || venta.date || venta.dia;
  const fecha = valorFecha ? new Date(valorFecha) : new Date();
  return Number.isNaN(fecha.getTime()) ? new Date() : fecha;
};

const obtenerInicioSemana = (fecha) => {
  const inicio = new Date(fecha);
  const dia = inicio.getDay() || 7;
  inicio.setDate(inicio.getDate() - dia + 1);
  inicio.setHours(0, 0, 0, 0);
  return inicio;
};

const formatearPeriodo = (fecha, periodo) => {
  if (periodo === 'semanal') {
    const inicio = obtenerInicioSemana(fecha);
    return `Sem ${inicio.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })}`;
  }

  return fecha.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' });
};

const clavePeriodo = (fecha, periodo) => {
  if (periodo === 'semanal') return obtenerInicioSemana(fecha).toISOString().slice(0, 10);
  return fecha.toISOString().slice(0, 10);
};

const obtenerMonto = (venta) => Number(venta.total || venta.monto || venta.valor || 0);

const prepararSeries = (ventas, periodo) => {
  const grupos = new Map();

  ventas.forEach((venta) => {
    const fecha = obtenerFechaVenta(venta);
    const clave = clavePeriodo(fecha, periodo);
    const actual = grupos.get(clave) || {
      clave,
      fecha,
      etiqueta: formatearPeriodo(fecha, periodo),
      almacen: 0,
      cafeteria: 0,
      comida_rapida: 0,
      total: 0,
    };
    const local = normalizarLocal(venta);
    const monto = obtenerMonto(venta);

    actual[local] += monto;
    actual.total += monto;
    grupos.set(clave, actual);
  });

  return [...grupos.values()].sort((a, b) => a.clave.localeCompare(b.clave)).slice(-8);
};

const prepararSeriesMetodosPago = (ventas, periodo) => {
  const grupos = new Map();

  ventas.forEach((venta) => {
    const fecha = obtenerFechaVenta(venta);
    const clave = clavePeriodo(fecha, periodo);
    const actual = grupos.get(clave) || {
      clave,
      fecha,
      etiqueta: formatearPeriodo(fecha, periodo),
      debito: 0,
      efectivo: 0,
      transferencia: 0,
      junaeb: 0,
      pluxe: 0,
    };
    const metodo = normalizarMetodoPago(venta);

    actual[metodo] += obtenerMonto(venta);
    grupos.set(clave, actual);
  });

  return [...grupos.values()].sort((a, b) => a.clave.localeCompare(b.clave)).slice(-8);
};

function Barras({ datos, campos }) {
  const maximo = Math.max(1, ...datos.flatMap((dato) => campos.map((campo) => dato[campo.id] || 0)));

  if (datos.length === 0) {
    return <p className="muted chart-empty">Aun no hay ventas registradas para mostrar.</p>;
  }

  return (
    <div className="bar-chart">
      {datos.map((dato) => (
        <div className="bar-group" key={dato.clave}>
          <div className="bar-stack">
            {campos.map((campo) => {
              const valor = dato[campo.id] || 0;
              const alto = Math.max(8, Math.round((valor / maximo) * 140));
              return (
                <span
                  className={`bar-fill ${campo.className}`}
                  style={{ height: `${alto}px` }}
                  title={`${campo.nombre}: $${valor.toLocaleString('es-CL')}`}
                  key={campo.id}
                />
              );
            })}
          </div>
          <small>{dato.etiqueta}</small>
        </div>
      ))}
    </div>
  );
}

function Admin({ navigate }) {
  const [ventas, setVentas] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [localActivo, setLocalActivo] = useState('general');
  const [metodoActivo, setMetodoActivo] = useState('todos');
  const [periodo, setPeriodo] = useState('diario');

  useEffect(() => {
    setVentas(JSON.parse(localStorage.getItem("ventas")) || []);
    setCajas(JSON.parse(localStorage.getItem("cajas")) || []);
  }, []);

  const ventasNormalizadas = ventas.map((venta) => ({
    ...venta,
    localNormalizado: normalizarLocal(venta),
    metodoPagoNormalizado: normalizarMetodoPago(venta),
    total: obtenerMonto(venta),
  }));
  const ventasFiltradas = localActivo === 'general'
    ? ventasNormalizadas
    : ventasNormalizadas.filter((venta) => venta.localNormalizado === localActivo);
  const datosGeneral = prepararSeries(ventasNormalizadas, periodo);
  const datosLocal = prepararSeries(ventasFiltradas, periodo);
  const datosMetodosPago = prepararSeriesMetodosPago(ventasFiltradas, periodo);
  const nombreLocalActivo = locales.find((local) => local.id === localActivo)?.nombre || 'General';
  const datosVentasActivas = localActivo === 'general' ? datosGeneral : datosLocal;
  const camposVentasActivas = localActivo === 'general'
    ? localesVentas.map((local) => ({
      id: local.id,
      nombre: local.nombre,
      className: `bar-${local.id}`,
    }))
    : [{
      id: localActivo,
      nombre: nombreLocalActivo,
      className: `bar-${localActivo}`,
    }];
  const camposMetodosActivos = metodoActivo === 'todos'
    ? metodosPago.map((metodo) => ({
      id: metodo.id,
      nombre: metodo.nombre,
      className: `bar-pay-${metodo.id}`,
    }))
    : [{
      id: metodoActivo,
      nombre: metodosPago.find((metodo) => metodo.id === metodoActivo)?.nombre || 'Metodo',
      className: `bar-pay-${metodoActivo}`,
    }];
  const totalFiltrado = ventasFiltradas.reduce((a, b) => a + b.total, 0);
  const totalMetodos = metodosPago.map((metodo) => ({
    ...metodo,
    total: ventasFiltradas
      .filter((venta) => venta.metodoPagoNormalizado === metodo.id)
      .reduce((suma, venta) => suma + venta.total, 0),
  }));
  const nombreMetodoActivo = metodoActivo === 'todos'
    ? 'Todos los metodos'
    : metodosPago.find((metodo) => metodo.id === metodoActivo)?.nombre || 'Metodo';

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
          <strong>${ventasNormalizadas.reduce((a, b) => a + b.total, 0).toLocaleString('es-CL')}</strong>
          <small>{ventas.length} ventas registradas</small>
        </div>
        <div className="stat-card">
          <span>Cajas abiertas</span>
          <strong>{cajas.length}</strong>
          <small>Movimientos disponibles</small>
        </div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-head">
          <div>
            <p className="eyebrow">Graficos de ventas</p>
            <h2>Resumen por local</h2>
            <p className="muted">Selecciona un local y cambia entre vista diaria o semanal.</p>
          </div>
          <div className="period-toggle">
            <button className={periodo === 'diario' ? 'active' : ''} onClick={() => setPeriodo('diario')}>Dia</button>
            <button className={periodo === 'semanal' ? 'active' : ''} onClick={() => setPeriodo('semanal')}>Semana</button>
          </div>
        </div>

        <div className="chart-grid">
          <article className="chart-card">
            <div className="chart-title">
              <h3>{localActivo === 'general' ? 'General de los 3 locales' : nombreLocalActivo}</h3>
              <span>${totalFiltrado.toLocaleString('es-CL')}</span>
            </div>
            <div className="local-selector in-chart">
              {locales.map((local) => (
                <button
                  className={localActivo === local.id ? 'active' : ''}
                  onClick={() => setLocalActivo(local.id)}
                  key={local.id}
                >
                  {local.nombre}
                </button>
              ))}
            </div>
            <Barras
              datos={datosVentasActivas}
              campos={camposVentasActivas}
            />
            <div className="chart-legend">
              {camposVentasActivas.map((campo) => (
                <span className={`legend-dot ${campo.className}`} key={campo.id}>{campo.nombre}</span>
              ))}
            </div>
          </article>

          <article className="chart-card">
            <div className="chart-title">
              <h3>{nombreMetodoActivo}</h3>
              <span>${totalFiltrado.toLocaleString('es-CL')}</span>
            </div>
            <div className="payment-method-selector">
              <button className={metodoActivo === 'todos' ? 'active' : ''} onClick={() => setMetodoActivo('todos')}>Todos</button>
              {metodosPago.map((metodo) => (
                <button
                  className={metodoActivo === metodo.id ? 'active' : ''}
                  onClick={() => setMetodoActivo(metodo.id)}
                  key={metodo.id}
                >
                  {metodo.nombre}
                </button>
              ))}
            </div>
            <Barras
              datos={datosMetodosPago}
              campos={camposMetodosActivos}
            />
            <div className="payment-summary compact">
              {totalMetodos.map((metodo) => (
                <div className={`payment-summary-row ${metodoActivo === metodo.id ? 'active' : ''}`} key={metodo.id}>
                  <span className={`legend-dot bar-pay-${metodo.id}`}>{metodo.nombre}</span>
                  <strong>${metodo.total.toLocaleString('es-CL')}</strong>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
export default Admin;
