// code128.js
//
// Code 128 (juego B) sin dependencias, en el mismo estilo que ean13.js.
// Se usa para los códigos internos de productos a granel: "GR-0000".

// Anchos barra/espacio/barra/... de cada símbolo (valores 0–105), start B (104) y stop (106).
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232',
];
const START_B = 104;
const STOP = '2331112';

// true si todos los caracteres se pueden codificar en el juego B (ASCII imprimible).
export function esCode128B(texto) {
  return /^[\x20-\x7e]+$/.test(String(texto ?? ''));
}

// Cadena de módulos ('1' = barra, '0' = espacio), incluyendo start, verificador y stop.
export function modulosCode128(texto) {
  const t = String(texto ?? '');
  if (!esCode128B(t)) throw new Error('Code 128: el texto tiene caracteres no soportados');
  const valores = [START_B, ...t.split('').map((c) => c.charCodeAt(0) - 32)];
  const suma = valores.reduce((acc, v, i) => acc + v * (i === 0 ? 1 : i), 0);
  valores.push(suma % 103);
  const anchos = valores.map((v) => PATRONES[v]).join('') + STOP;
  let bits = '';
  [...anchos].forEach((ancho, i) => { bits += (i % 2 === 0 ? '1' : '0').repeat(Number(ancho)); });
  return bits;
}

/**
 * SVG del código. Solo se usa con texto ya validado (GR-####), así que es seguro
 * insertarlo como HTML; el texto se escapa igualmente.
 * Zona en blanco de 10 módulos a cada lado, como pide el estándar.
 */
export function svgCode128(texto, { conTexto = true } = {}) {
  const bits = modulosCode128(texto);
  const X0 = 10;
  const ALTO_BARRAS = 46;
  const ancho = X0 * 2 + bits.length;
  const alto = conTexto ? 59 : ALTO_BARRAS + 2;

  let barras = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] !== '1') { i += 1; continue; }
    let j = i;
    while (j < bits.length && bits[j] === '1') j += 1;
    barras += `<rect x="${X0 + i}" y="0" width="${j - i}" height="${ALTO_BARRAS}"/>`;
    i = j;
  }

  const seguro = String(texto).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const textoSvg = conTexto
    ? `<text x="${ancho / 2}" y="56" font-family="Arial, Helvetica, sans-serif" font-size="9" text-anchor="middle" fill="#000">${seguro}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">` +
    `<rect width="${ancho}" height="${alto}" fill="#fff"/><g fill="#000">${barras}</g>${textoSvg}</svg>`;
}