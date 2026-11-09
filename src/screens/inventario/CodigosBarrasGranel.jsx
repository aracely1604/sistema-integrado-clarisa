import { useEffect, useMemo, useState } from 'react';
import { FiPrinter, FiSearch } from 'react-icons/fi';

import { suscribirProductosGlobales } from '../../controllers/ProductoControl';
import { unidadBaseDesdeUnidadMedida } from './gestionProductosData';
import { normalizarEan13, svgEan13 } from './ean13';
import { svgCode128 } from './code128';
import { esCodigoGranel } from './codigoBarraUtils';
import '../../css/CodigosBarrasGranel.css';

const COPIAS_MAX = 50;

const NOMBRE_UNIDAD = { g: 'Kilogramos', ml: 'Litros' };
const VENTA_POR     = { g: 'Venta por kg', ml: 'Venta por lt' };

// Deja el código listo para imprimir:
//  · "GR-0000" (granel nuevo) → Code 128, tal cual
//  · cualquier otro (EAN-13 antiguos "29…") → EAN-13, con la normalización de siempre
// Devuelve la misma forma que normalizarEan13 más `tipo`.
function prepararCodigo(codigo) {
  const c = String(codigo ?? '').trim();
  if (esCodigoGranel(c)) {
    return { ok: true, codigo: c.toUpperCase(), completado: false, motivo: '', tipo: 'code128' };
  }
  return { ...normalizarEan13(c), tipo: 'ean13' };
}

const dibujarCodigo = (info, opciones) => (
  info.tipo === 'code128' ? svgCode128(info.codigo, opciones) : svgEan13(info.codigo, opciones)
);

const escaparHtml = (texto) =>
  String(texto ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

// Documento que se abre en otra pestaña y se manda a imprimir.
//  · 'hoja'     → hoja A4 con etiquetas de 62×36 mm (3 columnas)
//  · 'etiqueta' → una etiqueta de 50×30 mm por página (impresoras térmicas)
function construirDocumentoImpresion(items, formato) {
  const etiquetas = items.map((p) => `
    <div class="etiqueta">
      <div class="nombre">${escaparHtml(p.nombre)}</div>
      <div class="barras">${dibujarCodigo(p.ean)}</div>
      <div class="venta">${escaparHtml(VENTA_POR[p.unidadBase] ?? '')}</div>
    </div>`).join('');

  const pagina = formato === 'etiqueta'
    ? `@page { size: 50mm 30mm; margin: 0; }
       .etiqueta { width: 50mm; height: 30mm; padding: 1.5mm 2mm; page-break-after: always; border: none; }
       .nombre { font-size: 7.5pt; }
       .barras { height: 17mm; }`
    : `@page { size: A4; margin: 10mm; }
       .hoja { display: flex; flex-wrap: wrap; gap: 2mm; }
       .etiqueta { width: 62mm; height: 36mm; padding: 2mm 3mm; border: 0.2mm dashed #b8b8b8; page-break-inside: avoid; }
       .nombre { font-size: 9pt; }
       .barras { height: 21mm; }`;

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Etiquetas de códigos de barras</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; }
  ${pagina}
  .etiqueta { display: flex; flex-direction: column; align-items: center; justify-content: space-between; overflow: hidden; }
  .nombre { width: 100%; font-weight: 700; text-align: center; line-height: 1.15; max-height: 2.4em; overflow: hidden; }
  .barras { width: 100%; display: flex; align-items: center; justify-content: center; }
  .barras svg { width: 100%; height: 100%; }
  .venta { font-size: 6.5pt; color: #333; }
</style></head>
<body><div class="hoja">${etiquetas}</div></body></html>`;
}

export default function CodigosBarrasGranel() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando]   = useState(true);
  const [busqueda, setBusqueda]   = useState('');
  const [seleccion, setSeleccion] = useState(() => new Set());
  const [copias, setCopias]       = useState(1);
  const [formato, setFormato]     = useState('hoja');
  const [aviso, setAviso]         = useState('');

  useEffect(() => {
    const cancelar = suscribirProductosGlobales((lista) => {
      setProductos(lista);
      setCargando(false);
    });
    return () => cancelar?.();
  }, []);

  // Productos a granel = los que se venden por kilo o por litro
  const granel = useMemo(() => productos
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      unidadBase: unidadBaseDesdeUnidadMedida(p.unidadMedida),
      codigoBarra: p.codigoBarra,
      ean: prepararCodigo(p.codigoBarra),
    }))
    .filter((p) => p.unidadBase !== 'uds' && p.codigoBarra)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  [productos]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return granel;
    return granel.filter((p) => p.nombre.toLowerCase().includes(q) || p.codigoBarra.toLowerCase().includes(q));
  }, [granel, busqueda]);

  const imprimibles = visibles.filter((p) => p.ean.ok);
  const todosMarcados = imprimibles.length > 0 && imprimibles.every((p) => seleccion.has(p.id));
  const elegidos = granel.filter((p) => seleccion.has(p.id) && p.ean.ok);
  const totalEtiquetas = elegidos.length * copias;

  function alternar(id) {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(id)) nuevo.delete(id); else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodos() {
    setSeleccion((prev) => {
      const nuevo = new Set(prev);
      imprimibles.forEach((p) => (todosMarcados ? nuevo.delete(p.id) : nuevo.add(p.id)));
      return nuevo;
    });
  }

  function cambiarCopias(valor) {
    const n = Math.floor(Number(valor));
    setCopias(Number.isNaN(n) ? 1 : Math.min(COPIAS_MAX, Math.max(1, n)));
  }

  function imprimir() {
    setAviso('');
    if (elegidos.length === 0) return;

    // Cada producto se repite `copias` veces
    const items = elegidos.flatMap((p) => Array.from({ length: copias }, () => p));
    const ventana = window.open('', '_blank');
    if (!ventana) {
      setAviso('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes e inténtalo de nuevo.');
      return;
    }
    ventana.document.open();
    ventana.document.write(construirDocumentoImpresion(items, formato));
    ventana.document.close();
    setTimeout(() => { ventana.focus(); ventana.print(); }, 350);
  }

  return (
    <div className="cbg">

      <p className="cbg-intro">
        Productos que se venden por kilo o por litro. No traen código de barras del fabricante:
        imprime la etiqueta y pégala en el producto o en su estante para escanearlo en caja.
      </p>

      {/* Opciones de impresión */}
      <div className="cbg-opciones">
        <div className="cbg-campo">
          <label htmlFor="cbg-formato">Formato</label>
          <select id="cbg-formato" value={formato} onChange={(e) => setFormato(e.target.value)}>
            <option value="hoja">Hoja A4 (etiquetas de 62×36 mm)</option>
            <option value="etiqueta">Etiqueta suelta (50×30 mm)</option>
          </select>
        </div>

        <div className="cbg-campo cbg-campo-corto">
          <label htmlFor="cbg-copias">Copias de cada una</label>
          <input
            id="cbg-copias"
            type="number"
            min={1}
            max={COPIAS_MAX}
            value={copias}
            onChange={(e) => cambiarCopias(e.target.value)}
          />
        </div>
      </div>

      {/* Búsqueda */}
      <div className="cbg-busqueda">
        <FiSearch size={14} />
        <input
          type="text"
          placeholder="Buscar por nombre o código"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {cargando && <p className="cbg-vacio">Cargando productos…</p>}

      {!cargando && granel.length === 0 && (
        <p className="cbg-vacio">
          Todavía no hay productos a granel. Créalos con “Registrar producto” → “Registrar producto a granel”,
          eligiendo kilogramos o litros.
        </p>
      )}

      {!cargando && granel.length > 0 && visibles.length === 0 && (
        <p className="cbg-vacio">Ningún producto coincide con la búsqueda.</p>
      )}

      {visibles.length > 0 && (
        <>
          <label className="cbg-todos">
            <input
              type="checkbox"
              checked={todosMarcados}
              onChange={alternarTodos}
              disabled={imprimibles.length === 0}
            />
            <span>Seleccionar todos ({imprimibles.length})</span>
          </label>

          <div className="cbg-lista">
            {visibles.map((p) => (
              <label
                key={p.id}
                className={`cbg-item ${p.ean.ok ? '' : 'cbg-item-invalido'}`}
              >
                <input
                  type="checkbox"
                  checked={seleccion.has(p.id) && p.ean.ok}
                  onChange={() => alternar(p.id)}
                  disabled={!p.ean.ok}
                />

                <div className="cbg-item-info">
                  <strong>{p.nombre}</strong>
                  <span>{NOMBRE_UNIDAD[p.unidadBase]} · {p.codigoBarra}</span>
                  {p.ean.completado && (
                    <small>
                      Se imprime como {p.ean.codigo} (se le agrega el dígito verificador al código guardado).
                    </small>
                  )}
                  {!p.ean.ok && <small className="cbg-error">No se puede imprimir: {p.ean.motivo}.</small>}
                </div>

                {p.ean.ok && (
                  <div
                    className="cbg-previa"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: dibujarCodigo(p.ean, { conTexto: false }) }}
                  />
                )}
              </label>
            ))}
          </div>
        </>
      )}

      {aviso && <p className="cbg-error cbg-aviso">{aviso}</p>}

      <button
        type="button"
        className="cbg-imprimir"
        onClick={imprimir}
        disabled={elegidos.length === 0}
      >
        <FiPrinter size={15} />
        {elegidos.length === 0
          ? 'Selecciona productos para imprimir'
          : `Imprimir ${totalEtiquetas} ${totalEtiquetas === 1 ? 'etiqueta' : 'etiquetas'}`}
      </button>

    </div>
  );
}