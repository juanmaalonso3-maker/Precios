/**
 * feeLogistico.js — fábrica de estrategias para los marketplaces que cobran un
 * fee logístico por peso, sin el régimen dual de MercadoLibre.
 *
 * Cubre Frávega, OnCity, ViaCompras y Tienda BNA. En todos ellos:
 *   - Siempre se paga el fee logístico (no existe el corte de "envío gratis").
 *   - No hay cargo fijo por venta.
 *   - El peso facturable sale de las MEDIDAS PROPIAS del marketplace, nunca del
 *     peso volumétrico que cargamos en MercadoLibre. Cada marketplace puede
 *     tener medidas distintas para el mismo producto, y eso es a propósito.
 *
 * Lo único que cambia entre ellos es la tabla de tarifas, la tasa de comisión y
 * el tratamiento del IVA. Por eso una sola fábrica alcanza: agregar un
 * marketplace nuevo de este tipo son tres líneas de configuración.
 */

import { num } from '../money.js';
import { buscarTarifa, pesoFacturable } from '../tarifas.js';

export const crearMarketplaceConFee = ({
  id,
  nombre,
  tablaTarifas,
  comisionIvaMode = 'por_fuera',
  financiacionIvaMode = 'por_fuera',
  soportaVariantesDeCuotas = false,
  cargosExtra = () => [],
  exigeTarifa = true,
}) => ({
  id,
  nombre,
  comisionIvaMode,
  financiacionIvaMode,
  soportaVariantesDeCuotas,

  pesoFacturable(ctx) {
    const { producto, pm, cfg } = ctx;
    return pesoFacturable({
      pesoReal: num(pm.peso_real) > 0 ? pm.peso_real : producto.peso_real,
      alto: pm.alto,
      ancho: pm.ancho,
      largo: pm.largo,
      divisor: cfg.divisorVolumetrico,
      // Deliberadamente sin volumetricoManual: ese dato es exclusivo de ML.
    });
  },

  resolverLogistica(ctx) {
    const { pvpConIva, tarifas } = ctx;
    const peso = this.pesoFacturable(ctx);
    const advertencias = [];

    if (!exigeTarifa) {
      return { pesoFacturable: peso, logisticaCIva: 0, comisionFijaCIva: 0, regimen: 'SIN_LOGISTICA', advertencias };
    }

    if (peso === null) {
      advertencias.push(`${nombre}: sin peso ni medidas propias cargadas.`);
      return { pesoFacturable: null, logisticaCIva: 0, comisionFijaCIva: 0, regimen: 'INDETERMINADO', advertencias };
    }

    const fee = buscarTarifa(tarifas[tablaTarifas], peso, pvpConIva);
    if (fee === null) {
      advertencias.push(`${nombre}: sin fee logístico tabulado para ${peso.toFixed(2)} kg.`);
    }
    return {
      pesoFacturable: peso,
      logisticaCIva: num(fee),
      comisionFijaCIva: 0,
      regimen: 'FEE_LOGISTICO',
      advertencias,
    };
  },

  cargosExtra,
});
