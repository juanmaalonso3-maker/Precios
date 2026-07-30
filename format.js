/**
 * format.js — presentación de números y el componente de margen.
 *
 * Todos los importes se muestran en pesos sin decimales: en esta escala los
 * centavos son ruido, y quitarlos deja las columnas más cortas y más fáciles de
 * barrer con la vista.
 */

const fmtPesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmtDec = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const pesos = (v) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : fmtPesos.format(Math.round(v));

export const pesosFirmado = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const s = fmtPesos.format(Math.abs(Math.round(v)));
  return v < 0 ? `−${s}` : s;
};

export const porcentaje = (v, dec = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(dec)}%`;

export const kilos = (v) =>
  v === null || v === undefined ? '—' : `${fmtDec.format(v)} kg`;

export const etiquetaModalidad = (m) =>
  String(m).toUpperCase() === 'CONTADO' ? 'Contado' : `${m} cuotas`;

export const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * BARRA DE MARGEN — el elemento central de la interfaz.
 *
 * El margen se dibuja como una barra anclada en una línea de cero central: crece
 * hacia la derecha si hay ganancia y hacia la izquierda si hay pérdida. Al
 * recorrer una columna de márgenes, las pérdidas sobresalen hacia el lado
 * contrario y se ven sin leer un solo número.
 *
 * No hay umbrales de color intermedios a propósito: el único corte que importa
 * en este negocio es el cero, así que la línea del cero es la regla.
 *
 * La escala se satura en ±40%: por encima de eso la diferencia entre 45% y 60%
 * no cambia ninguna decisión, y comprimir la escala haría ilegibles los márgenes
 * chicos, que son justamente los que hay que vigilar.
 */
export const barraMargen = (margen) => {
  if (margen === null || margen === undefined || Number.isNaN(margen)) {
    return '<span class="margen margen--vacio">—</span>';
  }
  const tope = 0.4;
  const ancho = Math.min(Math.abs(margen) / tope, 1) * 50;
  const negativo = margen < 0;
  const clase = negativo ? 'margen--perdida' : 'margen--ganancia';
  const barra = negativo
    ? `left:${50 - ancho}%;width:${ancho}%`
    : `left:50%;width:${ancho}%`;
  return `<span class="margen ${clase}">
    <span class="margen__pista"><span class="margen__barra" style="${barra}"></span></span>
    <span class="margen__valor">${porcentaje(margen)}</span>
  </span>`;
};

/** Chip de régimen logístico, para explicar de dónde sale el costo de envío. */
export const chipRegimen = (regimen) => {
  const textos = {
    ENVIO_GRATIS: ['Envío', 'Absorbemos el envío porque el precio supera el umbral'],
    CARGO_FIJO: ['Cargo fijo', 'Bajo el umbral: ML cobra cargo fijo y no pagamos envío'],
    ME1: ['ME1', 'Envío por fuera de la logística del marketplace, importe manual'],
    FEE_LOGISTICO: ['Fee', 'Fee logístico por escalón de peso'],
    SIN_LOGISTICA: ['—', 'Sin costo logístico definido'],
    INDETERMINADO: ['Sin datos', 'Falta peso o medidas para resolver la tarifa'],
  };
  const [txt, ayuda] = textos[regimen] || [regimen, ''];
  const alerta = regimen === 'INDETERMINADO' ? ' chip--alerta' : '';
  return `<span class="chip${alerta}" title="${escapar(ayuda)}">${escapar(txt)}</span>`;
};

export const chipMarketplace = (id) =>
  `<span class="chip chip--mp chip--${escapar(String(id).toLowerCase())}">${escapar(id)}</span>`;

/** Ícono de advertencia con el detalle en el tooltip. */
export const marcaAviso = (avisos) => {
  if (!avisos || !avisos.length) return '';
  return `<span class="aviso" title="${escapar(avisos.join(' · '))}">!</span>`;
};
