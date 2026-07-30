/**
 * Registro de marketplaces.
 *
 * Cada marketplace declara CÓMO se comporta; los VALORES (tasas, tarifas,
 * umbrales) viven en el Google Sheets y llegan por configuración. Nada de
 * números de negocio en el código.
 */

import meli from './meli.js';
import { crearMarketplaceConFee } from './feeLogistico.js';

/**
 * Frávega — comisión "IVA por fuera": sobre una venta de $100 con IVA nos
 * cobran $15 + IVA = $18,15, de los cuales $3,15 son crédito fiscal. El costo
 * real es $15,00, un 21% más caro que la misma tasa nominal en MercadoLibre.
 *
 * Precio único por producto: no se pueden publicar variantes de cuotas dentro
 * de la misma publicación. Se define un precio y qué planes se habilitan; el
 * motor calcula la rentabilidad de cada plan sobre ese mismo precio.
 */
export const fravega = crearMarketplaceConFee({
  id: 'FRAVEGA',
  nombre: 'Frávega',
  tablaTarifas: 'FRAVEGA_FEE',
});

/** OnCity — misma mecánica que Frávega, con tabla y tasa propias. */
export const oncity = crearMarketplaceConFee({
  id: 'ONCITY',
  nombre: 'OnCity',
  tablaTarifas: 'ONCITY_FEE',
});

/** ViaCompras — sólo cobra fee logístico. Sin comisión. Tarifario 01-JUL-26. */
export const viacompras = crearMarketplaceConFee({
  id: 'VIACOMPRAS',
  nombre: 'ViaCompras',
  tablaTarifas: 'VIACOMPRAS_FEE',
});

/**
 * Tienda BNA — todavía sin operar, preparado para activarse.
 * Comisión 8% + IVA, más 1,8% + IVA sobre el PVP por procesamiento de pagos.
 * Sin fee logístico definido: si más adelante lo cobran, se carga la tabla
 * BNA_FEE y se cambia `exigeTarifa` a true.
 */
export const bna = crearMarketplaceConFee({
  id: 'BNA',
  nombre: 'Tienda BNA',
  tablaTarifas: 'BNA_FEE',
  exigeTarifa: false,
  cargosExtra: ({ cfg }) => [
    {
      concepto: 'Procesamiento de pagos',
      tasa: cfg.marketplaces.BNA?.procesamientoPagosPct ?? 0,
      modoIva: 'por_fuera',
    },
  ],
});

export const MARKETPLACES = {
  ML: meli,
  FRAVEGA: fravega,
  ONCITY: oncity,
  VIACOMPRAS: viacompras,
  BNA: bna,
};

export const obtenerMarketplace = (id) => {
  const mp = MARKETPLACES[String(id || '').toUpperCase()];
  if (!mp) throw new Error(`Marketplace desconocido: ${id}`);
  return mp;
};

export default MARKETPLACES;
