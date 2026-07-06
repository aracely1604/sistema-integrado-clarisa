import React, { useEffect, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import jsPDF from 'jspdf';
import { db } from '../firebase';
import '../styles/views/admin.css';

const locales = [
  { id: 'almacen', nombre: 'Almacén' },
  { id: 'cafeteria', nombre: 'Cafetería' },
  { id: 'comida_rapida', nombre: 'Comida Rápida' },
];

const opcionesLocales = [{ id: 'general', nombre: 'General' }, ...locales];
const opcionesReporteLocales = [{ id: 'todos', nombre: 'Los 3 locales' }, ...locales];

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

const nombreLocalReporte = (localId) => {
  if (localId === 'todos') return 'Los 3 locales';
  return locales.find((local) => local.id === localId)?.nombre || 'Local';
};

const nombrePeriodoReporte = (periodo) => {
  const nombres = {
    diario: 'Diario',
    semanal: 'Semanal',
    mensual: 'Mensual',
    anual: 'Anual',
  };
  return nombres[periodo] || 'General';
};

const limpiarTextoPDF = (valor, max = 26) => {
  const texto = String(valor || '-');
  return texto.length > max ? `${texto.slice(0, max - 3)}...` : texto;
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
  const [reportePeriodo, setReportePeriodo] = useState('diario');
  const [reporteLocal, setReporteLocal] = useState('todos');
  const [localActivo, setLocalActivo] = useState('general');

  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(reloj);
  }, []);

  useEffect(() => {
    const cargarDatos = async () => {
      const ventasLocales = JSON.parse(localStorage.getItem('ventas')) || [];
      const cajasLocales = JSON.parse(localStorage.getItem('cajas')) || [];

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
      : ventasNormalizadas.filter((venta) => venta.localNormalizado === localActivo);
  const datosGeneral = prepararSeries(ventasNormalizadas, periodo);
  const datosLocal = prepararSeries(ventasFiltradas, periodo);
  const datosMetodosPago = prepararSeriesMetodosPago(ventasFiltradas, periodo);
  const nombreLocalActivo = opcionesLocales.find((local) => local.id === localActivo)?.nombre || 'General';
  const datosVentasActivas = localActivo === 'general' ? datosGeneral : datosLocal;
  const camposVentasActivas =
    localActivo === 'general'
      ? locales.map((local) => ({
          id: local.id,
          nombre: local.nombre,
          className: `bar-${local.id}`,
        }))
      : [
          {
            id: localActivo,
            nombre: nombreLocalActivo,
            className: `bar-${localActivo}`,
          },
        ];
  const camposMetodosActivos =
    metodoActivo === 'todos'
      ? metodosPago.map((metodo) => ({
          id: metodo.id,
          nombre: metodo.nombre,
          className: `bar-pay-${metodo.id}`,
        }))
      : [
          {
            id: metodoActivo,
            nombre: metodosPago.find((metodo) => metodo.id === metodoActivo)?.nombre || 'Metodo',
            className: `bar-pay-${metodoActivo}`,
          },
        ];
  const totalGeneral = ventasNormalizadas.reduce((a, b) => a + b.total, 0);
  const totalFiltrado = ventasFiltradas.reduce((a, b) => a + b.total, 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const ventasHoy = ventasNormalizadas.filter((venta) => obtenerFechaVenta(venta).toISOString().slice(0, 10) === hoy);
  const totalHoy = ventasHoy.reduce((suma, venta) => suma + venta.total, 0);
  const totalMetodos = metodosPago.map((metodo) => ({
    ...metodo,
    total: ventasFiltradas
      .filter((venta) => venta.metodoPagoNormalizado === metodo.id)
      .reduce((suma, venta) => suma + venta.total, 0),
  }));
  const nombreMetodoActivo =
    metodoActivo === 'todos'
      ? 'Todos los metodos'
      : metodosPago.find((metodo) => metodo.id === metodoActivo)?.nombre || 'Metodo';

  const filtrarVentasReporte = () => {
    return ventasNormalizadas
      .filter((venta) => reporteLocal === 'todos' || venta.localNormalizado === reporteLocal)
      .filter((venta) => {
        const fecha = obtenerFechaVenta(venta);
        const hoyReporte = new Date();

        switch (reportePeriodo) {
          case 'diario':
            return fecha.toDateString() === hoyReporte.toDateString();
          case 'semanal':
            return fecha >= obtenerInicioSemana(hoyReporte);
          case 'mensual':
            return fecha.getMonth() === hoyReporte.getMonth() && fecha.getFullYear() === hoyReporte.getFullYear();
          case 'anual':
            return fecha.getFullYear() === hoyReporte.getFullYear();
          default:
            return true;
        }
      });
  };

  const generarPDF = () => {
    const ventasReporte = filtrarVentasReporte();
    const total = ventasReporte.reduce((suma, venta) => suma + venta.total, 0);
    const doc = new jsPDF({ orientation: 'landscape' });
    const anchoPagina = doc.internal.pageSize.getWidth();
    const margen = 14;
    const anchoTabla = anchoPagina - margen * 2;
    const subtitulo = `${nombreLocalReporte(reporteLocal)} - ${nombrePeriodoReporte(reportePeriodo)}`;

    const dibujarEncabezado = () => {
      doc.setFillColor(15, 118, 110);
      doc.rect(0, 0, anchoPagina, 28, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(18);
      doc.text('REPORTE DE VENTAS', margen, 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(subtitulo, margen, 21);

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Total vendido: $${total.toLocaleString('es-CL')}`, margen, 39);
      doc.text(`Ventas: ${ventasReporte.length}`, margen + 82, 39);
      doc.text(`Generado: ${formatearFechaHora(new Date())}`, margen + 130, 39);

      doc.setFillColor(241, 245, 249);
      doc.rect(margen, 48, anchoTabla, 9, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('Usuario', margen + 3, 54);
      doc.text('Local', margen + 70, 54);
      doc.text('Metodo', margen + 122, 54);
      doc.text('Fecha', margen + 174, 54);
      doc.text('Total', margen + 238, 54);
    };

    dibujarEncabezado();

    if (ventasReporte.length === 0) {
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.text('No hay ventas registradas para los filtros seleccionados.', margen, 70);
      doc.save('reporte-ventas.pdf');
      return;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let y = 66;

    ventasReporte.forEach((venta) => {
      if (y > 188) {
        doc.addPage();
        dibujarEncabezado();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        y = 66;
      }

      doc.setDrawColor(226, 232, 240);
      doc.line(margen, y + 3, anchoPagina - margen, y + 3);
      doc.setTextColor(15, 23, 42);
      doc.text(limpiarTextoPDF(venta.usuario, 32), margen + 3, y);
      doc.text(limpiarTextoPDF(venta.localNombre || venta.local || venta.modulo, 22), margen + 70, y);
      doc.text(limpiarTextoPDF(venta.metodoPago, 18), margen + 122, y);
      doc.text(formatearFechaHora(obtenerFechaVenta(venta)), margen + 174, y);
      doc.text(`$${venta.total.toLocaleString('es-CL')}`, margen + 238, y);
      y += 10;
    });

    doc.save('reporte-ventas.pdf');
  };

  return (
    <main className="dashboard-page">
      <header className="dashboard-topbar">
        <div>
          <p className="eyebrow">Administrador</p>
          <h1>Panel de control</h1>
          <p className="datetime-line">{formatearFechaHora(ahora)}</p>
        </div>
        <div className="admin-actions">
          <button className="btn btn-primary" onClick={() => setMostrarLocales(!mostrarLocales)}>
            Locales
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('portal')}>
            Volver al portal
          </button>
        </div>
      </header>

      {mostrarLocales && (
        <section className="admin-local-panel portal-shell">
          <div className="portal-header">
            <div>
              <p className="eyebrow">Modulos de caja</p>
              <h2>Selecciona un local</h2>
              <p className="muted">Accede directamente al punto de venta de cualquier local.</p>
            </div>
            <button className="btn btn-secondary" onClick={() => setMostrarLocales(false)}>
              Volver al panel
            </button>
          </div>

          <div className="action-grid">
            <button className="module-card module-green" onClick={() => navigate('almacen')}>
              <span className="module-icon">Almacén</span>
              <strong>Punto de venta</strong>
              <small>Ingresar al punto de venta del almacén.</small>
            </button>

            <button className="module-card module-blue" onClick={() => navigate('cafeteria')}>
              <span className="module-icon">Cafetería</span>
              <strong>Punto de venta</strong>
              <small>Ingresar al punto de venta de cafetería.</small>
            </button>

            <button className="module-card module-orange" onClick={() => navigate('comida_rapida')}>
              <span className="module-icon">Comida</span>
              <strong>Punto de venta</strong>
              <small>Ingresar al punto de venta de comida rápida.</small>
            </button>
          </div>
        </section>
      )}

      <section className="stats-grid admin-stats-grid">
        <div className="stat-card">
          <span>Ventas totales</span>
          <strong>${totalGeneral.toLocaleString('es-CL')}</strong>
          <small>{ventas.length} ventas registradas</small>
        </div>

        <div className="stat-card">
          <span>Ventas de hoy</span>
          <strong>${totalHoy.toLocaleString('es-CL')}</strong>
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
                  <span>{caja.nombre ? `${caja.nombre} ${caja.apellido}` : caja.usuario}</span>
                  <small>Abierta: {formatearFechaHora(caja.abiertaDesde)}</small>
                </div>
                <button className="btn btn-danger" onClick={() => cerrarCajaAdmin(caja)}>
                  Cerrar caja
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="analytics-panel">
        <div className="analytics-head">
          <div>
            <p className="eyebrow">Gráficos de ventas</p>
            <h2>Resumen por local</h2>
            <p className="muted">Selecciona un local y cambia entre vista diaria, semanal o mensual.</p>
          </div>
          <div className="period-toggle">
            <button className={periodo === 'diario' ? 'active' : ''} onClick={() => setPeriodo('diario')}>
              Día
            </button>
            <button className={periodo === 'semanal' ? 'active' : ''} onClick={() => setPeriodo('semanal')}>
              Semanal
            </button>
            <button className={periodo === 'mensual' ? 'active' : ''} onClick={() => setPeriodo('mensual')}>
              Mensual
            </button>
          </div>
        </div>

        <div className="chart-grid">
          <article className="chart-card">
            <div className="chart-title">
              <h3>{localActivo === 'general' ? 'General de los 3 locales' : nombreLocalActivo}</h3>
              <span>${totalFiltrado.toLocaleString('es-CL')}</span>
            </div>
            <div className="local-selector in-chart">
              {opcionesLocales.map((local) => (
                <button
                  className={localActivo === local.id ? 'active' : ''}
                  onClick={() => setLocalActivo(local.id)}
                  key={local.id}
                >
                  {local.nombre}
                </button>
              ))}
            </div>
            <Barras datos={datosVentasActivas} campos={camposVentasActivas} />
            <div className="chart-legend">
              {camposVentasActivas.map((campo) => (
                <span className={`legend-dot ${campo.className}`} key={campo.id}>
                  {campo.nombre}
                </span>
              ))}
            </div>
          </article>

          <article className="chart-card">
            <div className="chart-title">
              <h3>{nombreMetodoActivo}</h3>
              <span>${totalFiltrado.toLocaleString('es-CL')}</span>
            </div>
            <div className="payment-method-selector">
              <button className={metodoActivo === 'todos' ? 'active' : ''} onClick={() => setMetodoActivo('todos')}>
                Todos
              </button>
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
            <Barras datos={datosMetodosPago} campos={camposMetodosActivos} />
            <div className="payment-summary compact">
              {totalMetodos.map((metodo) => (
                <div className={`payment-summary-row ${metodoActivo === metodo.id ? 'active' : ''}`} key={metodo.id}>
                  <span className={`legend-dot bar-pay-${metodo.id}`}>{metodo.nombre}</span>
                  <strong>${metodo.total.toLocaleString('es-CL')}</strong>
                </div>
              ))}
            </div>

            <section className="report-panel">
              <div className="analytics-head">
                <div>
                  <p className="eyebrow">Reportes</p>
                  <h2>Descargar reporte PDF</h2>
                </div>
              </div>

              <div className="report-options">
                <div className="report-field">
                  <h4>Periodo</h4>
                  <div className="period-toggle">
                    <button className={reportePeriodo === 'diario' ? 'active' : ''} onClick={() => setReportePeriodo('diario')}>
                      Diario
                    </button>
                    <button className={reportePeriodo === 'semanal' ? 'active' : ''} onClick={() => setReportePeriodo('semanal')}>
                      Semanal
                    </button>
                    <button className={reportePeriodo === 'mensual' ? 'active' : ''} onClick={() => setReportePeriodo('mensual')}>
                      Mensual
                    </button>
                    <button className={reportePeriodo === 'anual' ? 'active' : ''} onClick={() => setReportePeriodo('anual')}>
                      Anual
                    </button>
                  </div>
                </div>

                <div className="report-field">
                  <h4>Local</h4>
                  <div className="local-selector in-chart">
                    {opcionesReporteLocales.map((local) => (
                      <button
                        className={reporteLocal === local.id ? 'active' : ''}
                        onClick={() => setReporteLocal(local.id)}
                        key={local.id}
                      >
                        {local.nombre}
                      </button>
                    ))}
                  </div>
                </div>

                <button className="btn btn-primary report-download" onClick={generarPDF}>
                  Descargar reporte PDF
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
