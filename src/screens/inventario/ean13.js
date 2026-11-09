// ean13.js
//
// Códigos de barras EAN-13 sin dependencias: validación, dígito verificador y
// dibujo en SVG (para vista previa en pantalla y para imprimir etiquetas).

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

// El primer dígito define qué juego (L o G) usan los 6 dígitos de la izquierda.
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export function digitoVerificadorEan13(doce) {
  let suma = 0;
  for (let i = 0; i < 12; i += 1) suma += Number(doce[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (suma % 10)) % 10;
}

/**
 * Deja un código listo para imprimir como EAN-13.
 *  · 13 dígitos con verificador correcto → se imprime tal cual.
 *  · 12 dígitos → se le agrega el verificador (así quedó guardado el código si el lector
 *    omite el último dígito; al escanear la etiqueta ese lector entrega los mismos 12).
 *  · Cualquier otra cosa → no imprimible como EAN-13.
 * @returns {{ ok: boolean, codigo: string, completado: boolean, motivo: string }}
 */
export function normalizarEan13(entrada) {
  const codigo = String(entrada ?? '').trim();
  if (!/^\d+$/.test(codigo)) {
    return { ok: false, codigo, completado: false, motivo: 'El código tiene caracteres que no son números' };
  }
  if (codigo.length === 12) {
    return { ok: true, codigo: codigo + digitoVerificadorEan13(codigo), completado: true, motivo: '' };
  }
  if (codigo.length === 13) {
    if (digitoVerificadorEan13(codigo.slice(0, 12)) !== Number(codigo[12])) {
      return { ok: false, codigo, completado: false, motivo: 'El dígito verificador no coincide (EAN-13 inválido)' };
    }
    return { ok: true, codigo, completado: false, motivo: '' };
  }
  return { ok: false, codigo, completado: false, motivo: `Tiene ${codigo.length} dígitos; un EAN-13 tiene 13` };
}

// 95 módulos: guarda (101) + 6 dígitos + centro (01010) + 6 dígitos + guarda (101)
export function modulosEan13(codigo13) {
  const d = codigo13.split('').map(Number);
  const paridad = PARIDAD[d[0]];
  let bits = '101';
  for (let i = 0; i < 6; i += 1) bits += (paridad[i] === 'L' ? L : G)[d[i + 1]];
  bits += '01010';
  for (let i = 0; i < 6; i += 1) bits += R[d[i + 7]];
  return `${bits}101`;
}

/**
 * SVG del código (solo dígitos: es seguro insertarlo como HTML).
 * 1 módulo = 1 unidad; zonas en blanco de 11 (izq.) y 7 (der.) módulos, como pide el estándar.
 */
export function svgEan13(codigo13, { conTexto = true } = {}) {
  const bits = modulosEan13(codigo13);
  const X0 = 11;                       // zona en blanco izquierda
  const ALTO_BARRAS = 46;
  const ALTO_GUARDAS = 50;
  const ancho = X0 + 95 + 7;
  const alto = conTexto ? 59 : ALTO_GUARDAS + 2;

  const esGuarda = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
  let barras = '';
  let i = 0;
  while (i < 95) {
    if (bits[i] !== '1') { i += 1; continue; }
    // une módulos negros contiguos del mismo alto en un solo rectángulo
    const guarda = esGuarda(i);
    let j = i;
    while (j < 95 && bits[j] === '1' && esGuarda(j) === guarda) j += 1;
    barras += `<rect x="${X0 + i}" y="0" width="${j - i}" height="${guarda ? ALTO_GUARDAS : ALTO_BARRAS}"/>`;
    i = j;
  }

  let texto = '';
  if (conTexto) {
    const estilo = 'font-family="Arial, Helvetica, sans-serif" font-size="9" text-anchor="middle" fill="#000"';
    texto =
      `<text x="${X0 - 6}" y="57" ${estilo}>${codigo13[0]}</text>` +
      `<text x="${X0 + 3 + 21}" y="57" ${estilo} textLength="39" lengthAdjust="spacing">${codigo13.slice(1, 7)}</text>` +
      `<text x="${X0 + 3 + 42 + 5 + 21}" y="57" ${estilo} textLength="39" lengthAdjust="spacing">${codigo13.slice(7)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">` +
    `<rect width="${ancho}" height="${alto}" fill="#fff"/><g fill="#000">${barras}</g>${texto}</svg>`;
}