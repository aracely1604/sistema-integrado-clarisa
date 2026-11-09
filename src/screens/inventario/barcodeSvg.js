// screens/inventario/barcodeSvg.js
//
// Dibuja como imagen (SVG) los códigos de barras comerciales: EAN-13, UPC-A (12 dígitos) y EAN-8,
// con la misma simbología del envase (no Code 128). Solo se genera si el código tiene el largo
// correcto Y el dígito verificador es válido; si no, devuelve null (quien lo use puede caer a otro
// formato o mostrar solo el número).
//
// El SVG se arma únicamente con dígitos ya validados, así que es seguro usarlo como HTML.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
// Paridad de los 6 dígitos de la izquierda en EAN-13, según el primer dígito.
const PARIDAD = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

// Dígito verificador: pesos 3 y 1 alternados, empezando por la derecha del cuerpo (sin el verificador).
function digitoVerificador(cuerpo) {
  let suma = 0;
  for (let i = cuerpo.length - 1, peso = 3; i >= 0; i -= 1, peso = 4 - peso) {
    suma += Number(cuerpo[i]) * peso;
  }
  return (10 - (suma % 10)) % 10;
}

export function esCodigoComercialValido(codigo) {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13].includes(codigo.length)) return false;
  return digitoVerificador(codigo.slice(0, -1)) === Number(codigo.slice(-1));
}

function patronEan13(d) {
  const paridad = PARIDAD[Number(d[0])];
  let bits = '101';
  for (let i = 0; i < 6; i += 1) bits += (paridad[i] === 'L' ? L : G)[Number(d[i + 1])];
  bits += '01010';
  for (let i = 7; i < 13; i += 1) bits += R[Number(d[i])];
  return `${bits}101`;
}

function patronEan8(d) {
  let bits = '101';
  for (let i = 0; i < 4; i += 1) bits += L[Number(d[i])];
  bits += '01010';
  for (let i = 4; i < 8; i += 1) bits += R[Number(d[i])];
  return `${bits}101`;
}

/**
 * @param {string} codigo  solo dígitos (EAN-13, UPC-A de 12 o EAN-8)
 * @returns {string|null}  SVG listo para insertar, o null si no es un código comercial válido
 */
export function svgCodigoComercial(codigo) {
  const texto = String(codigo ?? '').trim();
  if (!esCodigoComercialValido(texto)) return null;

  // UPC-A es un EAN-13 con un 0 delante: las barras son idénticas.
  const digitos = texto.length === 12 ? `0${texto}` : texto;
  const ean8 = digitos.length === 8;
  const bits = ean8 ? patronEan8(digitos) : patronEan13(digitos);

  const margen = 9;                 // zona de silencio (en módulos)
  const altoBarras = 56;
  const ancho = bits.length + margen * 2;
  const alto = altoBarras + 14;

  // Barras: cada tramo de unos seguidos es un rectángulo
  let barras = '';
  for (let i = 0; i < bits.length; ) {
    if (bits[i] === '1') {
      let j = i;
      while (j < bits.length && bits[j] === '1') j += 1;
      barras += `<rect x="${margen + i}" y="0" width="${j - i}" height="${altoBarras}"/>`;
      i = j;
    } else {
      i += 1;
    }
  }

  // Números bajo las barras, como en el envase
  const t = (x, s) => `<text x="${x}" y="${alto - 2}" text-anchor="middle">${s}</text>`;
  let numeros;
  if (ean8) {
    numeros = t(margen + 3 + 14, digitos.slice(0, 4)) + t(margen + 3 + 28 + 5 + 14, digitos.slice(4));
  } else {
    numeros = t(margen - 5, digitos[0])
      + t(margen + 3 + 21, digitos.slice(1, 7))
      + t(margen + 3 + 42 + 5 + 21, digitos.slice(7));
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Código de barras ${texto}">`
    + `<rect width="${ancho}" height="${alto}" fill="#fff"/>`
    + `<g fill="#000">${barras}</g>`
    + `<g fill="#000" font-family="monospace" font-size="9">${numeros}</g>`
    + '</svg>'
  );
}