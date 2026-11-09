// ─── Utilidades de códigos de barras (validación de lo que se escanea / escribe) ──
// El dibujo y el dígito verificador EAN-13 ya viven en ean13.js; el contador de
// códigos internos vive en CodigoInternoControl.js. Acá solo se valida y normaliza.
//
//  · Códigos comerciales: EAN-13 (13), UPC-A/EAN-13 sin verificador (12), EAN-8 (8), GTIN-14 (14).
//  · Códigos internos de granel: Code 128 "GR-0000" (ver generarCodigoGranel).
//  · Códigos internos antiguos: EAN-13 que empieza con 29 (son EAN-13 normales).

import { normalizarEan13 } from './ean13';

const REGEX_GRANEL = /^GR-\d{4,}$/;

export function esCodigoGranel(codigo) {
  return REGEX_GRANEL.test(String(codigo ?? '').trim().toUpperCase());
}

// Lo que llega de la pistola o del teclado:
//  · empieza con G → formato granel: mayúsculas, solo G, R, guion y dígitos
//  · cualquier otro → solo dígitos
export function normalizarCodigo(valor) {
  const crudo = String(valor ?? '').trim().toUpperCase();
  if (/^G/.test(crudo)) return crudo.replace(/[^GR\d-]/g, '');
  return crudo.replace(/\D/g, '');
}

// Dígito verificador GS1 genérico (EAN-8 y GTIN-14; el EAN-13 usa ean13.js).
function verificadorGS1Valido(digitos) {
  const nums = digitos.split('').map(Number);
  const verificador = nums.pop();
  let suma = 0;
  for (let i = nums.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) suma += nums[i] * peso;
  return (10 - (suma % 10)) % 10 === verificador;
}

// Devuelve { valido: true, granel } o { valido: false, motivo }.
export function validarCodigoBarra(codigo) {
  const c = String(codigo ?? '').trim();
  if (!c) return { valido: false, motivo: 'Ingresa o escanea un código de barras' };
  if (esCodigoGranel(c)) return { valido: true, granel: true };
  if (!/^\d+$/.test(c)) return { valido: false, motivo: 'El código solo puede contener números' };

  if (c.length === 13 || c.length === 12) {
    // Con 12 dígitos se acepta: hay lectores que omiten el verificador (ver normalizarEan13)
    // y también existe el UPC-A de 12. Con 13 se exige el verificador correcto.
    const r = normalizarEan13(c);
    return r.ok ? { valido: true, granel: false } : { valido: false, motivo: r.motivo };
  }
  if (c.length === 8 || c.length === 14) {
    return verificadorGS1Valido(c)
      ? { valido: true, granel: false }
      : { valido: false, motivo: 'El dígito verificador no coincide: revisa que el código esté bien escaneado o escrito' };
  }
  return { valido: false, motivo: `Un código de barras tiene 8, 12, 13 o 14 dígitos (ingresaste ${c.length})` };
}