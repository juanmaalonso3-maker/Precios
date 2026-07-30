/**
 * money.js — utilidades numéricas y tratamiento de IVA.
 *
 * Regla del sistema: TODO precio se ingresa y se almacena CON IVA INCLUIDO.
 * El motor trabaja internamente en valores NETOS (sin IVA), porque el costo
 * del producto es nacionalizado sin IVA y el IVA de comisiones, logística y
 * publicidad es crédito fiscal recuperable.
 *
 * Excepciones que NO se netean (no generan crédito fiscal):
 *   - IIBB (Ingresos Brutos)
 *   - Impuesto al Débito y Crédito bancario
 * Esos dos se calculan siempre sobre el precio de venta CON IVA.
 */

export const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Convierte un importe con IVA a su valor neto. */
export const aNeto = (importeConIva, iva) => num(importeConIva) / (1 + num(iva));

/** Convierte un importe neto a su valor con IVA. */
export const aConIva = (importeNeto, iva) => num(importeNeto) * (1 + num(iva));

/**
 * Costo neto de un cargo porcentual, según cómo el marketplace trata el IVA.
 *
 *   'incluido'  → la tasa publicada YA contiene IVA (MercadoLibre).
 *                 Ej: 15% sobre $100 c/IVA = $15 facturado, de los cuales
 *                 $2,60 son IVA crédito → costo real $12,40.
 *
 *   'por_fuera' → la tasa se aplica y LUEGO se le suma IVA (Frávega, OnCity,
 *                 Tienda BNA). Ej: 15% sobre $100 c/IVA = $15 + IVA = $18,15
 *                 facturado, de los cuales $3,15 son IVA crédito → costo
 *                 real $15,00.
 *
 * Consecuencia práctica: la MISMA tasa nominal cuesta 21% más en Frávega que
 * en MercadoLibre. Por eso las tasas nunca se comparan de forma directa.
 */
export const costoNetoPorcentual = (pvpConIva, tasa, modoIva, iva) => {
  const bruto = num(pvpConIva) * num(tasa);
  return modoIva === 'por_fuera' ? bruto : bruto / (1 + num(iva));
};

/** Importe bruto efectivamente facturado por un cargo porcentual. */
export const cargoFacturado = (pvpConIva, tasa, modoIva, iva) => {
  const base = num(pvpConIva) * num(tasa);
  return modoIva === 'por_fuera' ? base * (1 + num(iva)) : base;
};

export const redondear = (v, decimales = 2) => {
  const f = Math.pow(10, decimales);
  return Math.round(num(v) * f) / f;
};

/** División protegida: devuelve null en lugar de Infinity o NaN. */
export const dividir = (a, b) => {
  const d = num(b);
  return d === 0 ? null : num(a) / d;
};
