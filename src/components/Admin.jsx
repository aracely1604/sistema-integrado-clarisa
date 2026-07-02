import React, { useState, useEffect } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import jsPDF from "jspdf";
const locales = [
  { id: 'general', nombre: 'General' },
  { id: 'almacen', nombre: 'Almacén' },
  { id: 'cafeteria', nombre: 'Cafetería' },
  { id: 'comida_rapida', nombre: 'Comida Rápida' },
];


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

const formatearFechaHora = (valor) => {
  const fecha = valor ? new Date(valor) : new Date();
  return fecha.toLocaleString('es-CL', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
};

const unirPorId = (localesGuardados, remotos) => {
  const mapa = new Map();
  localesGuardados.forEach((item) => mapa.set(item.id, item));
  remotos.forEach((item) => mapa.set(item.id, item));
  return [...mapa.values()];
};

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
  const [metodoActivo, setMetodoActivo] = useState('todos');
  const [periodo, setPeriodo] = useState('diario');
  const [ahora, setAhora] = useState(new Date());
  const [mostrarLocales, setMostrarLocales] = useState(false);
  const [reportePeriodo, setReportePeriodo] = useState("diario");
  const [reporteLocal, setReporteLocal] = useState("almacen");
  const [localActivo, setLocalActivo] = useState('general');

  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    const cargarDatos = async () => {
      const ventasLocales = JSON.parse(localStorage.getItem("ventas")) || [];
      const cajasLocales = JSON.parse(localStorage.getItem("cajas")) || [];

      setVentas(ventasLocales);
      setCajas(cajasLocales);

      try {
        const ventasFirebase = await getDocs(collection(db, 'ventas'));
        const ventasRemotas = ventasFirebase.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        const ventasUnidas = unirPorId(ventasLocales, ventasRemotas);
        setVentas(ventasUnidas);
        localStorage.setItem('ventas', JSON.stringify(ventasUnidas));
      } catch (error) {
        console.error('No se pudieron cargar ventas de Firebase:', error);
      }

      try {
        const cajasFirebase = await getDocs(query(collection(db, 'cajas'), where('estado', '==', 'abierta')));
        const cajasRemotas = cajasFirebase.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
        const cajasUnidas = unirPorId(cajasLocales, cajasRemotas).filter((caja) => caja.estado !== 'cerrada');
        setCajas(cajasUnidas);
        localStorage.setItem('cajas', JSON.stringify(cajasUnidas));
      } catch (error) {
        console.error('No se pudieron cargar cajas de Firebase:', error);
      }
    };

    cargarDatos();
  }, []);

  const cerrarCajaAdmin = async (caja) => {
    const cerradaEn = new Date().toISOString();
    const cajasActualizadas = cajas.filter((item) => item.id !== caja.id);

    setCajas(cajasActualizadas);
    localStorage.setItem('cajas', JSON.stringify(cajasActualizadas));

    try {
      await updateDoc(doc(db, 'cajas', caja.id), {
        estado: 'cerrada',
        cerradaEn,
        cerradaPor: 'admin',
      });
    } catch (error) {
      console.error('No se pudo cerrar la caja en Firebase:', error);
    }
  };

  const ventasNormalizadas = ventas.map((venta) => ({
    ...venta,
    localNormalizado: normalizarLocal(venta),
    metodoPagoNormalizado: normalizarMetodoPago(venta),
    total: obtenerMonto(venta),
  }));
  const ventasFiltradas =
  localActivo === 'general'
    ? ventasNormalizadas
    : ventasNormalizadas.filter(
        (venta) => venta.localNormalizado === localActivo
      );
  const datosGeneral = prepararSeries(ventasNormalizadas, periodo);
  const datosLocal = prepararSeries(ventasFiltradas, periodo);
  const datosMetodosPago = prepararSeriesMetodosPago(ventasFiltradas, periodo);
  const nombreLocalActivo = locales.find((local) => local.id === localActivo)?.nombre || 'General';
  const datosVentasActivas = localActivo === 'general' ? datosGeneral : datosLocal;
  const camposVentasActivas = localActivo === 'general'
    ? locales.map((local) => ({
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
  const hoy = new Date().toISOString().slice(0, 10);

  const ventasHoy = ventasNormalizadas.filter((venta) => {
    return obtenerFechaVenta(venta).toISOString().slice(0, 10) === hoy;
  });

const totalHoy = ventasHoy.reduce((suma, venta) => suma + venta.total, 0);
  const totalMetodos = metodosPago.map((metodo) => ({
    ...metodo,
    total: ventasFiltradas
      .filter((venta) => venta.metodoPagoNormalizado === metodo.id)
      .reduce((suma, venta) => suma + venta.total, 0),
  }));
  const nombreMetodoActivo = metodoActivo === 'todos'
    ? 'Todos los metodos'
    : metodosPago.find((metodo) => metodo.id === metodoActivo)?.nombre || 'Metodo';
  
  const generarPDF = () => {
    const doc = new jsPDF();

    let ventasReporte = ventasNormalizadas
      .filter((venta) => venta.localNormalizado === reporteLocal)
      .filter((venta) => {
        const fecha = obtenerFechaVenta(venta);
        const hoy = new Date();

        switch (reportePeriodo) {
          case "diario":
            return fecha.toDateString() === hoy.toDateString();

          case "semanal":
            return fecha >= obtenerInicioSemana(hoy);

          case "mensual":
            return (
              fecha.getMonth() === hoy.getMonth() &&
              fecha.getFullYear() === hoy.getFullYear()
            );

          case "anual":
            return fecha.getFullYear() === hoy.getFullYear();

          default:
            return true;
      }
    });

      let titulo = "REPORTE GENERAL DE VENTAS";

      if (reporteLocal === "almacen")
        titulo = "REPORTE - ALMACÉN";

      if (reporteLocal === "cafeteria")
        titulo = "REPORTE - CAFETERÍA";

      if (reporteLocal === "comida_rapida")
        titulo = "REPORTE - COMIDA RÁPIDA";

      doc.text(titulo, 15, 20);

      const total = ventasReporte.reduce(
        (suma, venta) => suma + venta.total,
        0
      );

      doc.text(
        `Total vendido: $${total.toLocaleString("es-CL")}`,
        15,
        35
      );

      let y = 55;

      ventasReporte.forEach((venta) => {
        doc.text(venta.usuario || "-", 15, y);
        doc.text(venta.local || venta.modulo || "-", 55, y);
        doc.text(venta.metodoPago || "-", 100, y);
        doc.text(obtenerFechaVenta(venta).toLocaleDateString("es-CL"), 135, y);
        doc.text(`$${venta.total.toLocaleString("es-CL")}`, 175, y);

        y += 8;

        if (y > 280) {
          doc.addPage();
          y = 20;
        }
      });

      doc.save("reporte.pdf");
    };
  return (
    
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Administrador</p>
          <h1>Panel de control</h1>
          <p className="datetime-line">{formatearFechaHora(ahora)}</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            className="btn btn-primary" onClick={() => setMostrarLocales(!mostrarLocales)}> Locales</button>

          <button
            className="btn btn-secondary" onClick={() => navigate("portal")}> Volver al portal</button>
          </div>
      </header>
        {mostrarLocales && (
          <section className="portal-shell" style={{ margin: "30px auto 50px auto", maxWidth: "1100px"}}>
            <div className="portal-header">
              <div>
                <p className="eyebrow">Módulos de Caja</p>
                  <h2>Selecciona un local</h2>
                <p className="muted">
                  Accede directamente al punto de venta de cualquier local.
                </p>
              </div>

              <button
                className="btn btn-secondary"
                onClick={() => setMostrarLocales(false)}
              >
                Cerrar
              </button>
              </div>

              <div className="action-grid">

                <button
                  className="module-card module-green"
                  onClick={() => navigate("almacen")}
                >
                <span className="module-icon">Almacén</span>
                <strong></strong>
                <small>Ingresar al punto de venta del almacén.</small>
                </button>

                <button
                  className="module-card module-blue"
                  onClick={() => navigate("cafeteria")}
                >
                <span className="module-icon">Cafetería</span>
                <strong></strong>
                <small>Ingresar al punto de venta de cafetería.</small>
                </button>

                <button
                  className="module-card module-orange"
                  onClick={() => navigate("comida_rapida")}
                >
                <span className="module-icon">Comida Rápida</span>
                <strong></strong>
                <small>Ingresar al punto de venta de comida rápida.</small>
                </button>

              </div>
          </section>
        )}
      <section className="stats-grid">
        
        <div className="stat-card">
          <span>Ventas totales</span>

          <strong>
            ${ventasNormalizadas.reduce((a, b) => a + b.total, 0).toLocaleString("es-CL")}
          </strong>

          <small>{ventas.length} ventas registradas</small>
        </div>

        <div className="stat-card">
          <span>Ventas de hoy</span>

          <strong>
            ${totalHoy.toLocaleString("es-CL")}
          </strong>

          <small>{ventasHoy.length} ventas realizadas hoy</small>
        </div>

        <div className="stat-card">
          <span>Cajas abiertas</span>

          <strong>{cajas.length}</strong>

          <small>Movimientos disponibles</small>
        </div>

</section>

      <section className="open-cash-panel">
        <div className="analytics-head">
          <div>
            <p className="eyebrow">Control de cajas</p>
            <h2>Cajas abiertas</h2>
            <p className="muted">Puedes cerrar una caja desde aqui si quedo abierta.</p>
          </div>
        </div>

        <div className="open-cash-list">
          {cajas.length === 0 ? (
            <p className="muted">No hay cajas abiertas.</p>
          ) : (
            cajas.map((caja) => (
              <div className="open-cash-row" key={caja.id}>
                <div>
                  <strong>{caja.localNombre || caja.local}</strong>
                  <span> {caja.nombre? `${caja.nombre} ${caja.apellido}`: caja.usuario}</span>
                  <small>Abierta: {formatearFechaHora(caja.abiertaDesde)}</small>
                </div>
                <button className="btn btn-danger" onClick={() => cerrarCajaAdmin(caja)}>Cerrar caja</button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-head">
          <div>
            <p className="eyebrow">Graficos de ventas</p>
            <h2>Resumen por local</h2>
            <p className="muted">Selecciona un local y cambia entre vista diaria, semanal o mensual.</p>
          </div>
          <div className="period-toggle">
            <button className={periodo === 'diario' ? 'active' : ''} onClick={() => setPeriodo('diario')}>Dia</button>
            <button className={periodo === 'semanal' ? 'active' : ''} onClick={() => setPeriodo('semanal')}>Semanal</button>
            <button className={periodo === 'mensual' ? 'active' : ''} onClick={() => setPeriodo('mensual')}>Mensual</button>
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
            <section className="open-cash-panel">
              <div className="analytics-head">
                <div>
                  <p className="eyebrow">Reportes</p>
                    <h2>Descargar Reporte PDF</h2>
                </div>
              </div>

              <div className="report-options">

                <div className='report-field'>
                  <h4>Periodo</h4>
                  <div className="period-toggle">
                    <button className={reportePeriodo === 'diario' ? 'active' : ''} onClick={() => setReportePeriodo("diario")}>Diario</button>
                    <button className={reportePeriodo === 'semanal' ? 'active' : ''} onClick={() => setReportePeriodo("semanal")}>Semanal</button>
                    <button className={reportePeriodo === 'mensual' ? 'active' : ''} onClick={() => setReportePeriodo("mensual")}>Mensual</button>
                    <button className={reportePeriodo === 'anual' ? 'active' : ''} onClick={() => setReportePeriodo("anual")}>Anual</button>
                  </div>
                </div>

                <div className="report-field">
                  <h4>Local</h4>
                  <div className="local-selector in-chart">
                    <button className={reporteLocal === 'almacen' ? 'active' : ''} onClick={() => setReporteLocal("almacen")}>Almacén</button>
                    <button className={reporteLocal === 'cafeteria' ? 'active' : ''} onClick={() => setReporteLocal("cafeteria")}>Cafetería</button>
                    <button className={reporteLocal === 'comida_rapida' ? 'active' : ''} onClick={() => setReporteLocal("comida_rapida")}>Comida Rápida</button>
                  </div>
                </div>

                <button className="btn btn-primary" onClick={generarPDF} style={{ width: '100%', marginTop: '10px' }}>
                  Descargar Reporte de PDF
                </button>
              </div>
            </section>
          </article>
        </div>
      </section>
    </main>
  );
}
export default Admin;
