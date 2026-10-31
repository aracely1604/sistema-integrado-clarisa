// screens/inventario/CampoFechaVencimiento.jsx
//
// Selector de fecha de vencimiento con calendario (<input type="date"> nativo:
// funciona en escritorio y en el celular, sin librerías).
//
// El valor que entra y sale es SIEMPRE el texto "DD/MM/AAAA" (el mismo formato
// que ya usaba el formulario), así el resto del código no cambia. Solo por
// dentro se convierte a "AAAA-MM-DD", que es lo que entiende el input.
//
// Uso:
//   <CampoFechaVencimiento
//     value={fechaVencimiento}
//     onChange={setFechaVencimiento}
//     className="..."   // la misma clase que usan los otros inputs del formulario
//     error={errors.fechaVencimiento}
//   />

const pad = (n) => String(n).padStart(2, '0');

function aISO(fecha) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

// "DD/MM/AAAA" (o "AAAA-MM-DD") → "AAAA-MM-DD"; '' si no es una fecha real.
function dmyAISO(valor) {
  const texto = String(valor ?? '').trim();
  let m = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  let dia, mes, anio;
  if (m) {
    [, dia, mes, anio] = m;
  } else if ((m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) {
    [, anio, mes, dia] = m;
  } else {
    return '';
  }
  const fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
  if (fecha.getDate() !== Number(dia) || fecha.getMonth() !== Number(mes) - 1) return '';
  return aISO(fecha);
}

// "AAAA-MM-DD" → "DD/MM/AAAA"
function isoADMY(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

function isoAFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export default function CampoFechaVencimiento({
  value,
  onChange,
  className,
  style,
  id,
  disabled = false,
  error = '',
  maxAnios = 10,
}) {
  const hoy = new Date();
  const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const min = aISO(hoyInicio);
  const max = aISO(new Date(hoyInicio.getFullYear() + maxAnios, hoyInicio.getMonth(), hoyInicio.getDate()));

  const iso = dmyAISO(value);
  const antesDeHoy = iso !== '' && iso < min;
  const muyLejos   = iso !== '' && iso > max;

  // Confirmación en texto: evita confundir 05/10 con 10/05.
  let resumen = '';
  if (iso && !antesDeHoy && !muyLejos) {
    const dias = Math.round((isoAFecha(iso) - hoyInicio) / 86400000);
    const larga = isoAFecha(iso).toLocaleDateString('es-CL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    resumen = `${larga} · ${dias === 0 ? 'vence hoy' : `en ${dias} ${dias === 1 ? 'día' : 'días'}`}`;
  }

  const mensaje = error
    || (antesDeHoy ? 'La fecha de vencimiento no puede ser anterior a hoy' : '')
    || (muyLejos ? `La fecha es demasiado lejana (máximo ${maxAnios} años)` : '');

  return (
    <div>
      <input
        id={id}
        type="date"
        className={className}
        style={style}
        value={iso}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(isoADMY(e.target.value))}
        // Abre el calendario al tocar cualquier parte del campo (no solo el ícono).
        onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* ya está abierto */ } }}
      />
      {mensaje ? (
        <p role="alert" style={{ color: '#E24B4A', fontSize: 12, margin: '4px 0 0' }}>{mensaje}</p>
      ) : resumen ? (
        <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.75 }}>{resumen}</p>
      ) : null}
    </div>
  );
}