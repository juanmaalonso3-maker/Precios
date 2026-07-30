/**
 * tarifas.js — resolución de tablas de tarifas y peso facturable.
 *
 * Una tarifa es una fila con esta forma:
 *   { peso_min, peso_max, precio_min, precio_max, valor_c_iva, vigencia_desde }
 *
 * Todas las tablas del sistema (envío ML, comisión fija ML, fee logístico de
 * Frávega, OnCity y ViaCompras) usan la MISMA estructura. Eso permite un único
 * buscador y que agregar un marketplace sea insertar filas, no escribir código.
 */

import { num } from './money.js';

/**
 * Convención de bordes, definida con el cliente sobre el tarifario de
 * ViaCompras: el mínimo es EXCLUYENTE y el máximo INCLUYENTE.
 *
 *   Escalón "1 kg a 5 kg" → un bulto de 5,0 kg entra; uno de 5,1 kg no.
 *
 * Se aplica igual a todas las tablas para que no haya sorpresas al comparar
 * marketplaces con el mismo peso.
 */
export const pesoEnEscalon = (peso, fila) =>
  num(peso) > num(fila.peso_min) && num(peso) <= num(fila.peso_max);

/**
 * El tramo de precio usa mínimo INCLUYENTE y máximo EXCLUYENTE, porque así
 * están redactados los tarifarios de ML ("De $33.000 a $49.999", "Más de
 * $50.000"): un precio de exactamente $50.000 cae en el tramo superior.
 */
export const precioEnTramo = (pvp, fila) =>
  num(pvp) >= num(fila.precio_min) && num(pvp) < num(fila.precio_max);

/**
 * Devuelve el valor CON IVA de la tarifa aplicable, o null si el peso o el
 * precio caen fuera de la tabla.
 *
 * Devolver null en vez de 0 es deliberado: un cero silencioso se confunde con
 * "envío gratis" y esconde el problema. El motor propaga el null como una
 * advertencia visible en la pantalla de rentabilidad.
 */
export const buscarTarifa = (tabla, peso, pvpConIva) => {
  if (!Array.isArray(tabla) || tabla.length === 0) return null;
  const fila = tabla.find((f) => pesoEnEscalon(peso, f) && precioEnTramo(pvpConIva, f));
  return fila ? num(fila.valor_c_iva) : null;
};

/** Peso volumétrico = (alto x ancho x largo) / divisor. Divisor 4000 en ML. */
export const pesoVolumetrico = (alto, ancho, largo, divisor = 4000) => {
  const a = num(alto), b = num(ancho), c = num(largo), d = num(divisor);
  if (a <= 0 || b <= 0 || c <= 0 || d <= 0) return null;
  return (a * b * c) / d;
};

/**
 * Peso facturable: el MAYOR entre el peso físico y el volumétrico.
 * Criterio confirmado contra la documentación de MercadoLibre.
 *
 * `volumetricoManual` existe porque en ML el peso volumétrico lo cargamos a
 * mano en la publicación, y ese valor —no el que saldría de las medidas— es el
 * que ML factura. Si está presente, gana sobre el calculado.
 */
export const pesoFacturable = ({
  pesoReal, alto, ancho, largo, divisor = 4000, volumetricoManual = null,
}) => {
  const vol = num(volumetricoManual) > 0
    ? num(volumetricoManual)
    : pesoVolumetrico(alto, ancho, largo, divisor);
  const real = num(pesoReal);
  if (vol === null) return real > 0 ? real : null;
  return Math.max(real, vol);
};

/** Filtra tarifas por vigencia, quedándose con la más reciente ya aplicable. */
export const vigentesA = (tabla, fecha = new Date()) => {
  if (!Array.isArray(tabla)) return [];
  const ref = fecha instanceof Date ? fecha : new Date(fecha);
  const aplicables = tabla.filter(
    (f) => !f.vigencia_desde || new Date(f.vigencia_desde) <= ref
  );
  const ultima = aplicables.reduce((max, f) => {
    const v = f.vigencia_desde ? String(f.vigencia_desde) : '';
    return v > max ? v : max;
  }, '');
  return aplicables.filter((f) => (f.vigencia_desde ? String(f.vigencia_desde) : '') === ultima);
};
