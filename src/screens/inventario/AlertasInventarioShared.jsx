// screens/inventario/AlertasInventarioShared.jsx
//
// Piezas del dashboard de inventario que usan TANTO la vista de escritorio como la móvil:
// subtítulos de sección, la pastilla de las filas con vencimiento, el título con ayuda
// y el resumen de estado del local.

import { FiSlash, FiInfo, FiChevronRight, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { getLevel, getVencLevel, formatearPrecio } from './inventarioHelpers';

// Subtítulo de una sección dentro de una tarjeta (punto de color + nombre + cantidad).
// Muestra siempre su título; si no hay elementos, un texto de "vacío" en su lugar.
// `claseLista`: clase CSS que separa los elementos (la de cada vista: 'div-list-gap' / 'ml-list').
export function Subseccion({ titulo, cantidad, color, textoVacio, claseLista = 'div-list-gap', children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 6, marginBottom: 8,
          borderBottom: '1px solid var(--c-border, rgba(128,128,128,.25))',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-textPrimary)' }}>{titulo}</span>
        <span style={{ fontSize: 11, color: 'var(--c-textSecondary)' }}>· {cantidad}</span>
      </div>
      {cantidad === 0
        ? <p style={{ fontSize: 12, margin: 0, color: 'var(--c-placeholder, #B0ADA8)' }}>{textoVacio}</p>
        : <div className={claseLista}>{children}</div>}
    </div>
  );
}

// Fila de "Stock a reponer" cuyo producto además está vencido o por vencer (con stock).
// Los mensajes completos están en el detalle de la alerta (se abre al presionarla); acá solo
// se agrega una pastilla que invita a presionar:
//  · Vencido: la reposición NO está disponible → la tarjeta se opaca.
//  · Por vencer: hay una recomendación (no bloquea).
export function FilaStockConVencimiento({ vencido, onAbrir, children }) {
  const c = vencido
    ? { bg: '#FCEBEB', border: '#F5A6A6', text: '#791F1F', Icono: FiSlash, label: 'Reposición no disponible' }
    : { bg: '#FAEEDA', border: '#FAC775', text: '#633806', Icono: FiInfo,  label: 'Recomendación disponible' };
  return (
    <div>
      <div style={vencido ? { opacity: 0.5, filter: 'grayscale(0.4)' } : undefined}>{children}</div>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`${c.label}. Presiona para ver el detalle`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, padding: '3px 8px 3px 7px',
          borderRadius: 999, background: c.bg, border: `1px solid ${c.border}`, color: c.text,
          fontSize: 11, fontWeight: 600, cursor: 'pointer',
        }}
      >
        <c.Icono size={12} />
        <span>{c.label}</span>
        <span style={{ fontWeight: 400, opacity: 0.8 }}>· presiona para ver</span>
        <FiChevronRight size={12} />
      </button>
    </div>
  );
}

// Título de una tarjeta + aviso de que las alertas se pueden presionar.
// `className`: clase del título en cada vista ('div-section-label' / 'ml-section-label').
export function TituloConAyuda({ titulo, className = 'div-section-label' }) {
  return (
    <div>
      <span className={className}>{titulo}</span>
      <div style={{ fontSize: 11, marginTop: 2, color: 'var(--c-textSecondary)' }}>
        Presiona en las alertas para más información
      </div>
    </div>
  );
}

// Resumen del local para el indicador de estado (barra superior / encabezado):
//  · rojo  → hay algo que pide acción ya (vencidos o stock crítico)
//  · ámbar → solo avisos (stock bajo o por vencer)
//  · verde → todo en orden
// `detalle` es el desglose (se muestra al pasar el mouse / como texto accesible).
export function resumenEstadoLocal(stockLocal, vencLocal) {
  const nCriticos  = stockLocal.filter(i => ['critical', 'out'].includes(getLevel(i))).length;
  const nBajos     = stockLocal.filter(i => getLevel(i) === 'low').length;
  const nVencidos  = vencLocal.filter(i => getVencLevel(i.vence) === 'expired').length;
  const nPorVencer = vencLocal.length - nVencidos;
  const nUrgentes  = nCriticos + nVencidos;
  const nAvisos    = nBajos + nPorVencer;

  const base = nUrgentes > 0
    ? { Icono: FiAlertTriangle, bg: '#FCEBEB', color: '#791F1F',
        texto: `${nUrgentes} ${nUrgentes === 1 ? 'requiere' : 'requieren'} acción` }
    : nAvisos > 0
    ? { Icono: FiAlertTriangle, bg: '#FAEEDA', color: '#633806',
        texto: `${nAvisos} ${nAvisos === 1 ? 'aviso' : 'avisos'}` }
    : { Icono: FiCheckCircle, bg: '#EAF3DE', color: '#27500A', texto: 'Todo en orden' };

  const detalle = [
    nVencidos  > 0 && `${nVencidos} ${nVencidos === 1 ? 'vencido' : 'vencidos'}`,
    nCriticos  > 0 && `${nCriticos} con stock crítico`,
    nBajos     > 0 && `${nBajos} con stock bajo`,
    nPorVencer > 0 && `${nPorVencer} por vencer`,
  ].filter(Boolean).join(' · ') || 'Sin alertas de stock ni de vencimiento';

  return { ...base, detalle };
}

// ─────────────────────────────────────────────────────────────────────────────
// Métricas: valor en riesgo y ofertas activas
// ─────────────────────────────────────────────────────────────────────────────

// Valor en riesgo = stock vencido + por vencer, valorizado a PRECIO DE VENTA (precio × cantidad,
// con el precio expresado por kg / lt / unidad, igual que la cantidad que se ve en pantalla).
export function resumenMetricasLocal(vencLocal, ofertasActivas) {
  const valorDe = (i) => (Number(i.precioVenta) || 0) * (Number(i.qty) || 0);
  const suma = (lista) => lista.reduce((acc, i) => acc + valorDe(i), 0);
  const vencidos  = vencLocal.filter(i => getVencLevel(i.vence) === 'expired');
  const porVencer = vencLocal.filter(i => getVencLevel(i.vence) !== 'expired');
  const valorVencido   = suma(vencidos);
  const valorPorVencer = suma(porVencer);
  return {
    vencidos, porVencer, valorVencido, valorPorVencer,
    valorRiesgo: valorVencido + valorPorVencer,
    nOfertas: ofertasActivas.length,
    valorDe,
  };
}

const ESTILO_FILA = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0',
  borderBottom: '1px solid var(--c-border, rgba(128,128,128,.25))', fontSize: 13,
};

function TituloSeccion({ children }) {
  return (
    <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: 'var(--c-textSecondary)' }}>
      {children}
    </p>
  );
}

// Contenido del detalle que se abre al presionar la tarjeta "Métricas" (solo lectura).
export function DetalleMetricas({ vencLocal, ofertasActivas }) {
  const m = resumenMetricasLocal(vencLocal, ofertasActivas);
  const enRiesgo = [...vencLocal].sort((a, b) => m.valorDe(b) - m.valorDe(a));

  return (
    <div style={{ color: 'var(--c-textPrimary)' }}>
      <TituloSeccion>VALOR EN RIESGO</TituloSeccion>
      <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700 }}>{formatearPrecio(m.valorRiesgo)}</p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--c-textSecondary)' }}>
        Stock vencido y por vencer, valorizado a precio de venta.
      </p>

      <div style={ESTILO_FILA}>
        <span><span style={{ color: '#E24B4A' }}>●</span> Vencido (pérdida) · {m.vencidos.length}</span>
        <strong>{formatearPrecio(m.valorVencido)}</strong>
      </div>
      <div style={ESTILO_FILA}>
        <span><span style={{ color: '#BA7517' }}>●</span> Por vencer · {m.porVencer.length}</span>
        <strong>{formatearPrecio(m.valorPorVencer)}</strong>
      </div>

      {enRiesgo.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {enRiesgo.map(i => {
            const vencido = getVencLevel(i.vence) === 'expired';
            return (
              <div key={i.id} style={ESTILO_FILA}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{i.nombre}</span>
                  <span style={{ fontSize: 11.5, color: vencido ? '#E24B4A' : '#BA7517' }}>
                    {i.qty} {i.unitQty} ·{' '}
                    {vencido
                      ? `venció hace ${Math.abs(i.vence)} ${Math.abs(i.vence) === 1 ? 'día' : 'días'}`
                      : i.vence === 0 ? 'vence hoy' : `vence en ${i.vence} ${i.vence === 1 ? 'día' : 'días'}`}
                  </span>
                </span>
                <strong>{formatearPrecio(m.valorDe(i))}</strong>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <TituloSeccion>OFERTAS ACTIVAS · {ofertasActivas.length}</TituloSeccion>
        {ofertasActivas.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-placeholder, #B0ADA8)' }}>
            No hay productos con la oferta activa en este local.
          </p>
        ) : ofertasActivas.map(o => {
          const descuento = o.precioVenta > 0 ? Math.round((1 - o.oferta / o.precioVenta) * 100) : 0;
          return (
            <div key={o.id} style={ESTILO_FILA}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{o.nombre}</span>
                <span style={{ fontSize: 11.5, color: 'var(--c-textSecondary)' }}>
                  Stock: {o.qty} {o.unitQty}
                </span>
              </span>
              <span style={{ textAlign: 'right' }}>
                <strong style={{ color: '#639922' }}>{formatearPrecio(o.oferta)}</strong>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--c-textSecondary)' }}>
                  antes {formatearPrecio(o.precioVenta)}{descuento > 0 ? ` · -${descuento}%` : ''}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recetas: cuántas se pueden preparar, ingrediente limitante e ingrediente clave
// ─────────────────────────────────────────────────────────────────────────────

export const textoUnidades = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

// Color según cuántas unidades se pueden preparar (0 = no se puede hacer ninguna)
export function colorPreparables(n) {
  if (n <= 0) return '#E24B4A';
  if (n <= 3) return '#BA7517';
  return '#639922';
}

// Texto del ingrediente que limita una receta
export function textoLimitante(r) {
  const lim = r.limitante;
  if (!lim) return 'Sin ingredientes';
  if (lim.sinAsignar) return `${lim.nombreIngrediente}: sin producto asignado`;
  return `Limita: ${lim.nombreIngrediente}${lim.nombreProducto ? ` (${lim.nombreProducto})` : ''}`;
}

// Contenido del detalle que se abre al presionar la tarjeta de Recetas (solo lectura).
export function DetalleRecetas({ resumen, localLabel }) {
  const { total, activas, inactivas, sinAsignar, recetas, ingredienteClave, ranking } = resumen;
  const maxRecetas = ranking[0]?.recetas || 1;

  return (
    <div style={{ color: 'var(--c-textPrimary)' }}>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--c-textSecondary)' }}>
        <strong style={{ color: 'var(--c-textPrimary)' }}>{total}</strong> {total === 1 ? 'receta' : 'recetas'} en {localLabel}
        {' · '}{activas} {activas === 1 ? 'activa' : 'activas'}
        {inactivas > 0 ? ` · ${inactivas} ${inactivas === 1 ? 'inactiva' : 'inactivas'}` : ''}
        {sinAsignar > 0 ? ` · ${sinAsignar} del recetario sin asignar` : ''}
      </p>

      <TituloSeccion>INGREDIENTE MÁS IMPORTANTE</TituloSeccion>
      {ingredienteClave ? (
        <>
          <p style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 700 }}>{ingredienteClave.nombre}</p>
          <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--c-textSecondary)' }}>
            Está en {ingredienteClave.recetas} de {ingredienteClave.de} recetas. Es el que más recetas necesitan:
            si se acaba, se frena la mayor parte de la producción.
          </p>
          {ranking.map((ing) => (
            <div key={ing.nombre} style={{ marginBottom: 7, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span>{ing.nombre}</span>
                <span style={{ color: 'var(--c-textSecondary)' }}>{ing.recetas} {ing.recetas === 1 ? 'receta' : 'recetas'}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--c-border, rgba(128,128,128,.25))' }}>
                <div
                  style={{
                    height: '100%', borderRadius: 3, background: '#185FA5',
                    width: `${Math.max(8, Math.round((ing.recetas / maxRecetas) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-placeholder, #B0ADA8)' }}>
          Todavía no hay un ingrediente que se repita en 2 o más recetas de este local.
        </p>
      )}

      <div style={{ marginTop: 22 }}>
        <TituloSeccion>SE PUEDEN PREPARAR · {total} {total === 1 ? 'RECETA' : 'RECETAS'}</TituloSeccion>
        {recetas.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--c-placeholder, #B0ADA8)' }}>
            Este local todavía no tiene recetas asignadas.
          </p>
        ) : recetas.map((r) => (
          <div key={r.id} style={{ ...ESTILO_FILA, opacity: r.activa ? 1 : 0.55 }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 600 }}>
                {r.nombre}
                {!r.activa && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--c-textSecondary)' }}>
                    INACTIVA
                  </span>
                )}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--c-textSecondary)' }}>{textoLimitante(r)}</span>
            </span>
            <strong style={{ color: colorPreparables(r.preparables), whiteSpace: 'nowrap' }}>
              {textoUnidades(r.preparables)}
            </strong>
          </div>
        ))}
      </div>
    </div>
  );
}