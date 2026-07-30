/**
 * MercadoLibre — el marketplace más complejo del sistema.
 *
 * Particularidades que ningún otro tiene:
 *
 * 1. RÉGIMEN DUAL por umbral de precio (hoy $33.000, configurable):
 *      - PVP >= umbral  → el envío es gratis para el comprador y lo absorbemos
 *                         nosotros. NO hay cargo fijo por venta.
 *      - PVP <  umbral  → no pagamos envío, pero ML cobra un CARGO FIJO por
 *                         venta que depende del peso y del tramo de precio.
 *    Nunca se pagan las dos cosas a la vez.
 *
 * 2. PESO VOLUMÉTRICO MANUAL: en ML el peso volumétrico se carga a mano en la
 *    publicación, y ML factura por ESE valor. Si está cargado, se usa tal cual
 *    en lugar de recalcularlo desde las medidas.
 *
 * 3. ENVÍO ME1: productos grandes (grupos electrógenos, heladeras, cocinas) que
 *    despachamos por fuera de la logística de ML. No hay tarifa de tabla: el
 *    importe se carga a mano, con IVA incluido, y el motor lo netea.
 *
 * 4. La tasa de comisión de ML YA CONTIENE IVA (modo 'incluido').
 */

import { num } from '../money.js';
import { buscarTarifa, pesoFacturable } from '../tarifas.js';

export default {
  id: 'ML',
  nombre: 'MercadoLibre',
  comisionIvaMode: 'incluido',
  financiacionIvaMode: 'incluido',
  soportaVariantesDeCuotas: true,

  /**
   * En ML un mismo producto tiene una publicación por modalidad de cuotas, cada
   * una con su propio precio. El comparador nunca cruza modalidades distintas.
   */
  pesoFacturable(ctx) {
    const { producto, pm, cfg } = ctx;
    return pesoFacturable({
      pesoReal: num(pm.peso_real) > 0 ? pm.peso_real : producto.peso_real,
      alto: pm.alto, ancho: pm.ancho, largo: pm.largo,
      divisor: cfg.divisorVolumetrico,
      volumetricoManual: pm.peso_volumetrico_manual,
    });
  },

  resolverLogistica(ctx) {
    const { pm, pvpConIva, cfg, tarifas } = ctx;
    const peso = this.pesoFacturable(ctx);
    const advertencias = [];
    const umbral = num(cfg.marketplaces.ML.umbralEnvio);

    if (String(pm.modalidad_envio || '').toUpperCase() === 'ME1') {
      const manual = num(pm.envio_me1_manual_c_iva);
      if (manual <= 0) {
        advertencias.push('Marcado como ME1 pero sin importe de envío cargado.');
      }
      return { pesoFacturable: peso, logisticaCIva: manual, comisionFijaCIva: 0, regimen: 'ME1', advertencias };
    }

    if (peso === null) {
      advertencias.push('Sin peso ni medidas: no se puede determinar la tarifa.');
      return { pesoFacturable: null, logisticaCIva: 0, comisionFijaCIva: 0, regimen: 'INDETERMINADO', advertencias };
    }

    if (num(pvpConIva) >= umbral) {
      const envio = buscarTarifa(tarifas.ML_ENVIO, peso, pvpConIva);
      if (envio === null) {
        advertencias.push(`Sin tarifa de envío para ${peso.toFixed(2)} kg. ¿Corresponde ME1?`);
      }
      return {
        pesoFacturable: peso,
        logisticaCIva: num(envio),
        comisionFijaCIva: 0,
        regimen: 'ENVIO_GRATIS',
        advertencias,
      };
    }

    const fija = buscarTarifa(tarifas.ML_COMISION_FIJA, peso, pvpConIva);
    if (fija === null) {
      advertencias.push(`Sin cargo fijo tabulado para ${peso.toFixed(2)} kg.`);
    }
    return {
      pesoFacturable: peso,
      logisticaCIva: 0,
      comisionFijaCIva: num(fija),
      regimen: 'CARGO_FIJO',
      advertencias,
    };
  },

  /** ML no tiene cargos porcentuales propios más allá de comisión y financiación. */
  cargosExtra() {
    return [];
  },
};
