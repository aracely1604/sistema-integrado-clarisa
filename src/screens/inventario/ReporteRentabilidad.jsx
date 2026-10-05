import { useState } from 'react';
import '../../css/Reportes.css';

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// fechalocal// 

const obtenerFechaLocal = () => {
  const fecha = new Date();

  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');

  return `${año}-${mes}-${dia}`;
};


// semana actual//

const obtenerSemanaActual = () => {
  const fecha = new Date();

  const dia = fecha.getDay() || 7;

  fecha.setDate(fecha.getDate() + 4 - dia);

  const año = fecha.getFullYear();

  const inicioAño = new Date(año, 0, 1);

  const numeroSemana = Math.ceil(
    (((fecha - inicioAño) / 86400000) + 1) / 7
  );

  return `${año}-W${String(numeroSemana).padStart(2, '0')}`;
};

//datos de ejemplo//

const productosIniciales = [
  {
    nombre: 'Pollo',
    costo: 2000,
    venta: 3500,
    unidades: 80,
  },
  {
    nombre: 'Bebida',
    costo: 500,
    venta: 1000,
    unidades: 120,
  },
  {
    nombre: 'Papas fritas',
    costo: 800,
    venta: 1800,
    unidades: 95,
  },
  {
    nombre: 'Arroz',
    costo: 600,
    venta: 1200,
    unidades: 70,
  },
];

const evolucionInicial = [
  {
    periodo: 'Semana 1',
    rentabilidad: 85000,
  },
  {
    periodo: 'Semana 2',
    rentabilidad: 105000,
  },
  {
    periodo: 'Semana 3',
    rentabilidad: 92000,
  },
  {
    periodo: 'Semana 4',
    rentabilidad: 125000,
  },
];

//componente//

export default function ReporteRentabilidad({
  activeLocal,
  localLabels,
}) {

//estados//
  const [periodo, setPeriodo] = useState('Diario');

  const [fecha, setFecha] = useState(
    obtenerFechaLocal()
  );

  const [semana, setSemana] = useState(
    obtenerSemanaActual()
  );

  const [mesSeleccionado, setMesSeleccionado] =
    useState(String(new Date().getMonth() + 1));

  const [añoSeleccionado, setAñoSeleccionado] =
    useState(String(new Date().getFullYear()));



  const local = localLabels[activeLocal];



  const meses = [
    { numero: '1', nombre: 'Enero' },
    { numero: '2', nombre: 'Febrero' },
    { numero: '3', nombre: 'Marzo' },
    { numero: '4', nombre: 'Abril' },
    { numero: '5', nombre: 'Mayo' },
    { numero: '6', nombre: 'Junio' },
    { numero: '7', nombre: 'Julio' },
    { numero: '8', nombre: 'Agosto' },
    { numero: '9', nombre: 'Septiembre' },
    { numero: '10', nombre: 'Octubre' },
    { numero: '11', nombre: 'Noviembre' },
    { numero: '12', nombre: 'Diciembre' },
  ];

  // ----------------------------------------------------
  // AÑOS
  // ----------------------------------------------------

  const añoActual = new Date().getFullYear();

  const años = [
    añoActual - 2,
    añoActual - 1,
    añoActual,
    añoActual + 1,
  ];

  // ----------------------------------------------------
  // CAMBIO DE PERÍODO
  // ----------------------------------------------------

  const cambiarPeriodo = (nuevoPeriodo) => {
    setPeriodo(nuevoPeriodo);

    if (nuevoPeriodo === 'Diario') {
      setFecha(obtenerFechaLocal());
    }

    if (nuevoPeriodo === 'Semanal') {
      setSemana(obtenerSemanaActual());
    }

    if (nuevoPeriodo === 'Mensual') {
      const ahora = new Date();

      setMesSeleccionado(
        String(ahora.getMonth() + 1)
      );

      setAñoSeleccionado(
        String(ahora.getFullYear())
      );
    }
  };

  // ----------------------------------------------------
  // CÁLCULOS
  // ----------------------------------------------------

  const productos = productosIniciales.map((producto) => {

    const margenUnitario =
      producto.venta - producto.costo;

    const aporteTotal =
      margenUnitario * producto.unidades;

    return {
      ...producto,
      margenUnitario,
      aporteTotal,
    };
  });

  const totalVentas = productos.reduce(
    (total, producto) =>
      total + producto.venta * producto.unidades,
    0
  );

  const totalCostos = productos.reduce(
    (total, producto) =>
      total + producto.costo * producto.unidades,
    0
  );

  const rentabilidad =
    totalVentas - totalCostos;

  const margen =
    totalVentas > 0
      ? (rentabilidad / totalVentas) * 100
      : 0;

  // ----------------------------------------------------
  // PRODUCTOS DESTACADOS
  // ----------------------------------------------------

  const productoMasRentable = [...productos].sort(
    (a, b) => b.aporteTotal - a.aporteTotal
  )[0];

  const productoMayorMargen = [...productos].sort(
    (a, b) => b.margenUnitario - a.margenUnitario
  )[0];

  // ----------------------------------------------------
  // DATOS GRÁFICO MARGEN
  // ----------------------------------------------------

  const datosMargen = productos.map((producto) => ({
    nombre: producto.nombre,
    margen: producto.margenUnitario,
  }));

  // ----------------------------------------------------
  // DATOS GRÁFICO COSTO VS VENTA
  // ----------------------------------------------------

  const datosComparacion = productos.map((producto) => ({
    nombre: producto.nombre,
    costo: producto.costo,
    venta: producto.venta,
  }));

  // ----------------------------------------------------
  // FORMATO PESOS
  // ----------------------------------------------------

  const formatoPesos = (valor) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
      maximumFractionDigits: 0,
    }).format(valor);
  };

  // ----------------------------------------------------
  // TOOLTIP
  // ----------------------------------------------------

  const TooltipPesos = ({
    active,
    payload,
    label,
  }) => {

    if (!active || !payload || !payload.length) {
      return null;
    }

    return (
      <div className="reporte-tooltip">

        <strong>{label}</strong>

        {payload.map((item, index) => (
          <div key={index}>
            {item.name}:{' '}
            {formatoPesos(item.value)}
          </div>
        ))}

      </div>
    );
  };


const descargarReporte = () => {
  const doc = new jsPDF();

  const nombreLocal =
    localLabels?.[activeLocal] || 'Local';

  // ==============================
  // COLORES
  // ==============================

  const gris = [107,114,128];
  const verde = [22, 163, 74];
  const naranja = [234, 88, 12];
  const morado = [124, 58, 237];

  const grisTexto = [75, 85, 99];
  const grisClaro = [243, 244, 246];
  const grisBorde = [229, 231, 235];

  // ==============================
  // ENCABEZADO
  // ==============================

  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(21);

  doc.text('Reporte de Rentabilidad', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  
  doc.setTextColor(107, 114, 128);

  doc.text(
    'Análisis de costos de adquisición y ventas',
    14,
    24
  );

  // ==============================
  // INFORMACIÓN DEL LOCAL
  // ==============================

  doc.setTextColor(...grisTexto);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);

  doc.text(nombreLocal, 14, 47);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.text(`Periodo: ${periodo}`, 14, 54);

  if (periodo === 'Diario') {
    doc.text(`Fecha: ${fecha}`, 14, 60);
  }

  if (periodo === 'Semanal') {
    doc.text(`Semana: ${semana}`, 14, 60);
  }

  if (periodo === 'Mensual') {
    doc.text(
      `Mes: ${mesSeleccionado}/${añoSeleccionado}`,
      14,
      60
    );
  }

  // ==============================
  // TARJETAS KPI
  // ==============================

  const kpiY = 70;
  const kpiWidth = 43;
  const kpiHeight = 29;
  const espacio = 5;

  const kpis = [
    {
      x: 14,
      titulo: 'VENTAS',
      valor: formatoPesos(totalVentas),
      color: gris,
    },
    {
      x: 14 + (kpiWidth + espacio),
      titulo: 'COSTOS',
      valor: formatoPesos(totalCostos),
      color: gris,
    },
    {
      x: 14 + (kpiWidth + espacio) * 2,
      titulo: 'RENTABILIDAD',
      valor: formatoPesos(rentabilidad),
      color: gris,
    },
    {
      x: 14 + (kpiWidth + espacio) * 3,
      titulo: 'MARGEN',
      valor: `${margen.toFixed(1)}%`,
      color: gris,
    },
  ];

  kpis.forEach((kpi) => {
    // Fondo
    doc.setFillColor(250, 250, 251);
    doc.setDrawColor(...grisBorde);

    doc.roundedRect(
      kpi.x,
      kpiY,
      kpiWidth,
      kpiHeight,
      3,
      3,
      'FD'
    );

    // Línea superior
    doc.setFillColor(...kpi.color);

    doc.roundedRect(
      kpi.x,
      kpiY,
      kpiWidth,
      3,
      1.5,
      1.5,
      'F'
    );

    // Título
    doc.setTextColor(...grisTexto);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    doc.text(
      kpi.titulo,
      kpi.x + 5,
      kpiY + 11
    );

    // Valor
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(10);

    doc.text(
      kpi.valor,
      kpi.x + 5,
      kpiY + 21
    );
  });

  // ==============================
  // TÍTULO TABLA
  // ==============================

  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);

  doc.text(
    'Detalle de rentabilidad por producto',
    14,
    115
  );

  // ==============================
  // TABLA
  // ==============================

  const filas = productos.map((producto) => {
    const margenUnitario =
      producto.venta - producto.costo;

    const aporteTotal =
      margenUnitario * producto.unidades;

    return [
      producto.nombre,
      formatoPesos(producto.costo),
      formatoPesos(producto.venta),
      formatoPesos(margenUnitario),
      producto.unidades.toString(),
      formatoPesos(aporteTotal),
    ];
  });

  autoTable(doc, {
    startY: 121,

    head: [[
      'Producto',
      'Costo',
      'Venta',
      'Margen',
      'Unidades',
      'Aporte',
    ]],

    body: filas,

    theme: 'plain',

    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: [55, 65, 81],
      cellPadding: 4,
      lineColor: grisBorde,
      lineWidth: 0.2,
    },

    headStyles: {
      fillColor: [243, 244, 246],
      textColor: [31, 41, 55],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },

    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },

    columnStyles: {
      0: {
        halign: 'left',
      },
      1: {
        halign: 'right',
      },
      2: {
        halign: 'right',
      },
      3: {
        halign: 'right',
      },
      4: {
        halign: 'center',
      },
      5: {
        halign: 'right',
      },
    },
  });

  // ==============================
  // RESUMEN FINAL
  // ==============================

  const finalY =
    doc.lastAutoTable?.finalY || 150;

  const resumenY = finalY + 14;

  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);

  doc.roundedRect(
    14,
    resumenY,
    182,
    28,
    3,
    3,
    'FD'
  );

  doc.setTextColor(...verde);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);

  doc.text(
    'Rentabilidad total',
    21,
    resumenY + 11
  );

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(15);

  doc.text(
    formatoPesos(rentabilidad),
    21,
    resumenY + 21
  );

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  doc.text(
    `Margen obtenido: ${margen.toFixed(1)}%`,
    120,
    resumenY + 17
  );

  // ==============================
  // PIE DE PÁGINA
  // ==============================

  const alturaPagina =
    doc.internal.pageSize.height;

  doc.setDrawColor(...grisBorde);

  doc.line(
    14,
    alturaPagina - 18,
    196,
    alturaPagina - 18
  );

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);

  const fechaGeneracion =
    new Date().toLocaleDateString('es-CL');

  doc.text(
    `Reporte generado el ${fechaGeneracion}`,
    14,
    alturaPagina - 10
  );

  doc.text(
    nombreLocal,
    196,
    alturaPagina - 10,
    {
      align: 'right',
    }
  );

  // ==============================
  // DESCARGA
  // ==============================

// ==============================
// NOMBRE DEL ARCHIVO
// ==============================

  const nombreLocalArchivo = nombreLocal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  let periodoArchivo = '';

  if (periodo === 'Diario') {
    periodoArchivo = fecha;
  }

  if (periodo === 'Semanal') {
    periodoArchivo = semana.replace(/\s+/g, '_');
  }

  if (periodo === 'Mensual') {
    periodoArchivo = `${mesSeleccionado}-${añoSeleccionado}`;
  }

  const nombreArchivo =
    `Rentabilidad_${nombreLocalArchivo}_${periodoArchivo}.pdf`;



  doc.save(nombreArchivo);
};
  // ====================================================
  // RENDER
  // ====================================================

  return (
    <div className="reporte-rentabilidad">

      {/* =================================================
          ENCABEZADO
      ================================================= */}

      <div className="reporte-header">

        <div>
          <span className="reporte-subtitulo">
            Reporte de inventario
          </span>

          <h1>
            Rentabilidad
          </h1>

          <p>
            {local}
          </p>
        </div>

      <button
        className="btn-descargar"
        onClick={descargarReporte}
      >
        <fitDowloand />
        Descargar Reporte
      </button>

      </div>


      {/* =================================================
          FILTROS
      ================================================= */}

      <div className="reporte-filtros">

        <div className="filtro-grupo">

          <label>
            Período
          </label>

          <select
            value={periodo}
            onChange={(e) =>
              cambiarPeriodo(e.target.value)
            }
          >
            <option value="Diario">
              Diario
            </option>

            <option value="Semanal">
              Semanal
            </option>

            <option value="Mensual">
              Mensual
            </option>
          </select>

        </div>


        {/* DIARIO */}

        {periodo === 'Diario' && (
          <div className="filtro-grupo">

            <label>
              Fecha
            </label>

            <input
              type="date"
              value={fecha}
              onChange={(e) =>
                setFecha(e.target.value)
              }
            />

          </div>
        )}


        {/* SEMANAL */}

        {periodo === 'Semanal' && (
          <div className="filtro-grupo">

            <label>
              Semana
            </label>

            <input
              type="week"
              value={semana}
              onChange={(e) =>
                setSemana(e.target.value)
              }
            />

          </div>
        )}


        {/* MENSUAL */}

        {periodo === 'Mensual' && (
          <>
            <div className="filtro-grupo">

              <label>
                Mes
              </label>

              <select
                value={mesSeleccionado}
                onChange={(e) =>
                  setMesSeleccionado(
                    e.target.value
                  )
                }
              >

                {meses.map((mes) => (
                  <option
                    key={mes.numero}
                    value={mes.numero}
                  >
                    {mes.nombre}
                  </option>
                ))}

              </select>

            </div>


            <div className="filtro-grupo">

              <label>
                Año
              </label>

              <select
                value={añoSeleccionado}
                onChange={(e) =>
                  setAñoSeleccionado(
                    e.target.value
                  )
                }
              >

                {años.map((año) => (
                  <option
                    key={año}
                    value={año}
                  >
                    {año}
                  </option>
                ))}

              </select>

            </div>
          </>
        )}

      </div>


      {/* =================================================
          KPIs
      ================================================= */}

      <div className="kpi-grid">

        <div className="kpi-card kpi-ventas">

          <span>
            Ventas
          </span>

          <strong>
            {formatoPesos(totalVentas)}
          </strong>

          <small>
            Total vendido
          </small>

        </div>


        <div className="kpi-card kpi-costos">

          <span>
            Costos
          </span>

          <strong>
            {formatoPesos(totalCostos)}
          </strong>

          <small>
            Costo de adquisición
          </small>

        </div>


        <div className="kpi-card kpi-rentabilidad">

          <span>
            Rentabilidad
          </span>

          <strong>
            {formatoPesos(rentabilidad)}
          </strong>

          <small>
            Ganancia estimada
          </small>

        </div>


        <div className="kpi-card kpi-margen">

          <span>
            Margen
          </span>

          <strong>
            {margen.toFixed(1)}%
          </strong>

          <small>
            Margen sobre ventas
          </small>

        </div>

      </div>


      {/* =================================================
          GRÁFICOS
      ================================================= */}

      <div className="reportes-graficos">

        {/* -----------------------------------------------
            GRÁFICO 1
        ----------------------------------------------- */}

        <div className="grafico-card">

          <div className="grafico-header">

            <div>

              <h2>
                Margen por producto
              </h2>

              <p>
                Ganancia obtenida por unidad
              </p>

            </div>

          </div>


          <div className="grafico-contenedor">

            <ResponsiveContainer
              width="100%"
              height={260}
            >

              <BarChart
                data={datosMargen}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="nombre"
                  tick={{
                    fontSize: 12,
                  }}
                />

                <YAxis
                  tick={{
                    fontSize: 11,
                  }}
                  tickFormatter={(valor) =>
                    `$${valor}`
                  }
                />

                <Tooltip
                  content={<TooltipPesos />}
                />

                <Bar
                  dataKey="margen"
                  name="Margen"
                  fill="#64748B"
                  radius={[5, 5, 0, 0]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>


        {/* -----------------------------------------------
            GRÁFICO 2
        ----------------------------------------------- */}

        <div className="grafico-card">

          <div className="grafico-header">

            <div>

              <h2>
                Costo vs. venta
              </h2>

              <p>
                Comparación por producto
              </p>

            </div>

          </div>


          <div className="grafico-contenedor">

            <ResponsiveContainer
              width="100%"
              height={260}
            >

              <BarChart
                data={datosComparacion}
                margin={{
                  top: 10,
                  right: 10,
                  left: 0,
                  bottom: 5,
                }}
              >

                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="nombre"
                  tick={{
                    fontSize: 12,
                  }}
                />

                <YAxis
                  tick={{
                    fontSize: 11,
                  }}
                  tickFormatter={(valor) =>
                    `$${valor}`
                  }
                />

                <Tooltip
                  content={<TooltipPesos />}
                />

                <Legend />

                <Bar
                  dataKey="costo"
                  name="Costo"
                  fill="#94A3B8"
                  radius={[5, 5, 0, 0]}
                />

                <Bar
                  dataKey="venta"
                  name="Venta"
                  fill="#334155"
                  radius={[5, 5, 0, 0]}
                />

              </BarChart>

            </ResponsiveContainer>

          </div>

        </div>

      </div>


      {/* =================================================
          PRODUCTOS DESTACADOS
      ================================================= */}

      <div className="destacados-grid">

        <div className="destacado-card">

          <span className="destacado-label">
            Producto más rentable
          </span>

          <h3>
            {productoMasRentable.nombre}
          </h3>

          <strong>
            {formatoPesos(
              productoMasRentable.aporteTotal
            )}
          </strong>

          <p>
            Aporte total a la rentabilidad
          </p>

        </div>


        <div className="destacado-card">

          <span className="destacado-label">
            Mayor margen unitario
          </span>

          <h3>
            {productoMayorMargen.nombre}
          </h3>

          <strong>
            {formatoPesos(
              productoMayorMargen.margenUnitario
            )}
          </strong>

          <p>
            Ganancia por unidad
          </p>

        </div>

      </div>


      {/* =================================================
          EVOLUCIÓN
      ================================================= */}

      <div className="grafico-card grafico-evolucion">

        <div className="grafico-header">

          <div>

            <h2>
              Evolución de la rentabilidad
            </h2>

            <p>
              Comportamiento durante el período
            </p>

          </div>

        </div>


        <div className="grafico-contenedor">

          <ResponsiveContainer
            width="100%"
            height={260}
          >

            <LineChart
              data={evolucionInicial}
              margin={{
                top: 10,
                right: 15,
                left: 0,
                bottom: 5,
              }}
            >

              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
              />

              <XAxis
                dataKey="periodo"
                tick={{
                  fontSize: 12,
                }}
              />

              <YAxis
                tick={{
                  fontSize: 11,
                }}
                tickFormatter={(valor) =>
                  `$${valor}`
                }
              />

              <Tooltip
                content={<TooltipPesos />}
              />

              <Line
                type="monotone"
                dataKey="rentabilidad"
                name="Rentabilidad"
                stroke="#7c3aed"
                strokeWidth={3}
                dot={{
                  r: 4,
                }}
                activeDot={{
                  r: 6,
                }}
              />

            </LineChart>

          </ResponsiveContainer>

        </div>

      </div>


      {/* =================================================
          TABLA
      ================================================= */}

      <div className="tabla-reporte">

        <div className="tabla-header">

          <div>

            <h2>
              Detalle de productos
            </h2>

            <p>
              Relación entre costo, venta y rentabilidad
            </p>

          </div>

        </div>


        <div className="tabla-scroll">

          <table>

            <thead>

              <tr>

                <th>
                  Producto
                </th>

                <th>
                  Costo
                </th>

                <th>
                  Venta
                </th>

                <th>
                  Margen
                </th>

                <th>
                  Unidades
                </th>

                <th>
                  Aporte
                </th>

              </tr>

            </thead>


            <tbody>

              {productos.map((producto) => (

                <tr key={producto.nombre}>

                  <td>
                    <strong>
                      {producto.nombre}
                    </strong>
                  </td>

                  <td>
                    {formatoPesos(
                      producto.costo
                    )}
                  </td>

                  <td>
                    {formatoPesos(
                      producto.venta
                    )}
                  </td>

                  <td className="valor-positivo">
                    {formatoPesos(
                      producto.margenUnitario
                    )}
                  </td>

                  <td>
                    {producto.unidades}
                  </td>

                  <td>
                    <strong>
                      {formatoPesos(
                        producto.aporteTotal
                      )}
                    </strong>
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}