/**
 * engine.js — motor de cálculo de rentabilidad.
 *
 * Función pura: mismas entradas, mismas salidas, sin efectos secundarios y sin
 * tocar el DOM ni la red. Eso permite recalcular todo el catálogo en memoria
 * mientras el usuario tipea un precio, y testear los números contra la planilla.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ESPECIFICACIÓN DE CÁLCULO (validada con el cliente, julio 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Ingreso neto          = PVP_c_IVA / (1 + IVA)
 *
 *   − Comisión            ML:                 tasa / (1+IVA) x PVP_c_IVA
 *                         Frávega/OnCity/BNA: tasa x PVP_c_IVA
 *   − Costo financiero    mismo tratamiento de IVA que la comisión
 *   − Logística           tarifa_c_IVA / (1 + IVA)
 *   − Cargo fijo (ML)     cargo_c_IVA / (1 + IVA)
 *   − IIBB                IIBB% x PVP_c_IVA            ← BRUTO, sin crédito
 *   − Imp. Déb/Créd       1,2% x PVP_c_IVA             ← BRUTO, sin crédito
 *   − Publicidad          pub% / (1+IVA) x PVP_c_IVA   ← por producto
 *   − Gastos varios       var% / (1+IVA) x PVP_c_IVA   ← por producto
 *   − Cargos extra        según marketplace (ej. procesamiento BNA)
 *   − Costo producto      USD x TC                     ← ya neto de IVA
 *   ─────────────────────────────────────────────
 *   = Utilidad neta
 *
 * Dos puntos donde esto corrige la planilla original:
 *
 *   • IIBB se calculaba sobre el precio SIN IVA. Al no ser un impuesto con
 *     crédito fiscal, corresponde el precio CON IVA: la planilla lo subestimaba
 *     un 17,4% en la hoja de MercadoLibre. Sobre una freidora de $129.999 son
 *     $903 por unidad, el 16% de la ganancia declarada.
 *
 *   • El Impuesto al Débito y Crédito (1,2%) no estaba contemplado.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PRECIOS EN CUOTAS
 * ═══════════════════════════════════════════════════════════════════════════
 * Cada modalidad se calcula SIEMPRE desde el precio de contado, nunca desde la
 * modalidad anterior. La planilla original las encadenaba, y eso multiplicaba
 * los recargos: 12 cuotas terminaba en 2,42x el contado en lugar de 1,317x.
 */

import { num, dividir, redondear, aNeto, costoNetoPorcentual, cargoFacturado } from './money.js';
import { obtenerMarketplace } from './marketplaces/index.js';

export const CONTADO = 'CONTADO';

/** Normaliza la modalidad: 'CONTADO' o cantidad de cuotas como número. */
export const normalizarModalidad = (m) => {
  if (m === null || m === undefined || m === '' ) return CONTADO;
  const s = String(m).trim().toUpperCase();
  if (s === CONTADO || s === '0' || s === '1' || s === 'SIN CUOTAS') return CONTADO;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 1 ? n : CONTADO;
};

/** Devuelve { costo_real, markup } de una modalidad, o ceros si es contado. */
export const parametrosFinanciacion = (cfg, marketplaceId, modalidad) => {
  const mod = normalizarModalidad(modalidad);
  if (mod === CONTADO) return { costoReal: 0, markup: 0 };
  const tabla = cfg.financiacion?.[marketplaceId] ?? {};
  const fila = tabla[mod] ?? tabla[String(mod)];
  return { costoReal: num(fila?.costo_real), markup: num(fila?.markup) };
};

/**
 * Rentabilidad de un producto en un marketplace, a un precio y una modalidad.
 *
 * @returns desglose completo, en valores netos salvo donde se indica.
 */
export const calcularRentabilidad = ({
  producto,
  pm,                  // fila de ProductoMarketplace
  marketplaceId,
  modalidad = CONTADO,
  pvpConIva,
  cfg,
  tarifas,
}) => {
  const mp = obtenerMarketplace(marketplaceId);
  const iva = num(cfg.iva);
  const pvp = num(pvpConIva);
  const mod = normalizarModalidad(modalidad);
  const ctx = { producto, pm, pvpConIva: pvp, cfg, tarifas, marketplaceId: mp.id };

  const ingresoNeto = aNeto(pvp, iva);
  const logistica = mp.resolverLogistica(ctx);
  const advertencias = [...(logistica.advertencias || [])];

  // ── Comisión y financiación ────────────────────────────────────────────
  const tasaComision = num(pm.comision_pct) > 0
    ? num(pm.comision_pct)
    : num(cfg.marketplaces[mp.id]?.comisionPctDefault);
  const { costoReal: tasaFinanciera, markup } = parametrosFinanciacion(cfg, mp.id, mod);

  const comision = costoNetoPorcentual(pvp, tasaComision, mp.comisionIvaMode, iva);
  const costoFinanciero = costoNetoPorcentual(pvp, tasaFinanciera, mp.financiacionIvaMode, iva);

  // ── Logística ──────────────────────────────────────────────────────────
  const costoLogistico = aNeto(logistica.logisticaCIva, iva);
  const cargoFijo = aNeto(logistica.comisionFijaCIva, iva);

  // ── Impuestos sin crédito fiscal: sobre el precio CON IVA ──────────────
  const iibb = pvp * num(cfg.iibbPct);
  const impDebCred = pvp * num(cfg.impDebCredPct);

  // ── Gastos con crédito fiscal: se netean ───────────────────────────────
  const publicidad = costoNetoPorcentual(pvp, num(pm.publicidad_pct), 'incluido', iva);
  const varios = costoNetoPorcentual(pvp, num(pm.varios_pct), 'incluido', iva);

  // ── Cargos propios del marketplace (ej. procesamiento de pagos BNA) ────
  const extras = mp.cargosExtra(ctx).map((c) => ({
    concepto: c.concepto,
    importe: costoNetoPorcentual(pvp, c.tasa, c.modoIva, iva),
    tasa: num(c.tasa),
  }));
  const totalExtras = extras.reduce((s, c) => s + c.importe, 0);

  // ── Costo del producto: ya viene neto de IVA ───────────────────────────
  const costoProducto = num(producto.costo_usd) * num(cfg.tc);
  if (costoProducto <= 0) advertencias.push('Producto sin costo en USD cargado.');
  if (pvp <= 0) advertencias.push('Producto sin precio de venta cargado.');

  const totalCostos = comision + costoFinanciero + costoLogistico + cargoFijo
    + iibb + impDebCred + publicidad + varios + totalExtras + costoProducto;

  const utilidad = ingresoNeto - totalCostos;

  return {
    sku: producto.sku,
    marketplaceId: mp.id,
    marketplace: mp.nombre,
    modalidad: mod,
    cuotas: mod === CONTADO ? 0 : mod,

    pvpConIva: pvp,
    ingresoNeto,
    pesoFacturable: logistica.pesoFacturable,
    regimenLogistico: logistica.regimen,

    costos: {
      comision,
      costoFinanciero,
      costoLogistico,
      cargoFijo,
      iibb,
      impDebCred,
      publicidad,
      varios,
      extras,
      costoProducto,
      total: totalCostos,
    },

    // Importes efectivamente facturados por terceros, útiles para conciliar
    // contra la factura del marketplace.
    facturado: {
      comision: cargoFacturado(pvp, tasaComision, mp.comisionIvaMode, iva),
      costoFinanciero: cargoFacturado(pvp, tasaFinanciera, mp.financiacionIvaMode, iva),
      logistica: num(logistica.logisticaCIva),
      cargoFijo: num(logistica.comisionFijaCIva),
    },

    tasas: { comision: tasaComision, financiacion: tasaFinanciera, markup },

    utilidad,
    margenSobreFacturacionNeta: dividir(utilidad, ingresoNeto),
    margenSobrePvpConIva: dividir(utilidad, pvp),
    rentabilidadSobreCosto: dividir(utilidad, costoProducto),

    negativo: utilidad < 0,
    advertencias,
  };
};

/**
 * Precio sugerido de una modalidad a partir del precio de contado.
 *
 *   precio = contado x (1 + costo_financiero + markup)
 *
 * Cada modalidad parte del contado. El markup es nuestro margen adicional por
 * encima del costo que cobra el marketplace, configurable por modalidad.
 */
export const precioSugeridoModalidad = ({ pvpContado, cfg, marketplaceId, modalidad }) => {
  const { costoReal, markup } = parametrosFinanciacion(cfg, marketplaceId, modalidad);
  return num(pvpContado) * (1 + costoReal + markup);
};

/**
 * Precio equivalente de contado: normaliza un precio en cuotas para poder
 * comparar entre marketplaces sin mezclar condiciones comerciales.
 */
export const precioEquivalenteContado = ({ pvpConIva, cfg, marketplaceId, modalidad }) => {
  const { costoReal, markup } = parametrosFinanciacion(cfg, marketplaceId, modalidad);
  const factor = 1 + costoReal + markup;
  return factor === 0 ? num(pvpConIva) : num(pvpConIva) / factor;
};

/**
 * Despeje inverso: qué precio hay que publicar para alcanzar un margen objetivo.
 *
 * No se puede resolver algebraicamente porque la logística y el cargo fijo son
 * funciones escalonadas del propio precio (cruzar $33.000 cambia el régimen
 * completo). Se resuelve iterando: converge en 3 o 4 pasos.
 */
export const precioParaMargen = ({
  producto, pm, marketplaceId, modalidad = CONTADO, cfg, tarifas,
  margenObjetivo,                 // fracción sobre facturación neta, ej. 0.15
  maxIteraciones = 40,
  tolerancia = 0.00005,
}) => {
  const iva = num(cfg.iva);
  const costoProducto = num(producto.costo_usd) * num(cfg.tc);
  // Semilla razonable: costo inflado por el margen objetivo y el IVA.
  let pvp = costoProducto * (1 + iva) * (1 + num(margenObjetivo) + 0.35);
  if (!(pvp > 0)) pvp = 1000;

  let r = null;
  for (let i = 0; i < maxIteraciones; i += 1) {
    r = calcularRentabilidad({ producto, pm, marketplaceId, modalidad, pvpConIva: pvp, cfg, tarifas });
    const margen = r.margenSobreFacturacionNeta ?? 0;
    const error = num(margenObjetivo) - margen;
    if (Math.abs(error) < tolerancia) {
      return { pvpConIva: redondear(pvp, 2), iteraciones: i + 1, convergio: true, resultado: r };
    }
    // El margen crece de forma casi lineal con el precio: corrección proporcional
    // amortiguada para no oscilar en los saltos de escalón.
    pvp *= 1 + error * 0.9;
    if (!(pvp > 0) || !Number.isFinite(pvp)) {
      return { pvpConIva: null, iteraciones: i + 1, convergio: false, resultado: r };
    }
  }
  return { pvpConIva: redondear(pvp, 2), iteraciones: maxIteraciones, convergio: false, resultado: r };
};

/**
 * Calcula todas las publicaciones de un producto en todos los marketplaces.
 * Es la entrada que usan las pantallas: una sola pasada, todo en memoria.
 */
export const calcularProducto = ({ producto, productoMarketplaces, publicaciones, cfg, tarifas }) => {
  const resultados = [];
  publicaciones
    .filter((p) => String(p.sku) === String(producto.sku) && p.estado !== 'INACTIVA')
    .forEach((pub) => {
      const pm = productoMarketplaces.find(
        (x) => String(x.sku) === String(producto.sku)
          && String(x.marketplace_id).toUpperCase() === String(pub.marketplace_id).toUpperCase()
      );
      if (!pm || pm.activo === false) return;
      resultados.push(calcularRentabilidad({
        producto, pm,
        marketplaceId: pub.marketplace_id,
        modalidad: pub.modalidad,
        pvpConIva: pub.pvp_c_iva,
        cfg, tarifas,
      }));
    });
  return resultados;
};
