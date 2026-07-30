/**
 * store.js — estado de la aplicación en memoria.
 *
 * El dataset entero entra una vez y se queda acá. Recalcular las ~1.200
 * combinaciones de producto x marketplace x modalidad tarda milisegundos, así
 * que cada vez que se toca un precio o un parámetro se recalcula todo de nuevo
 * en lugar de intentar invalidar selectivamente. Más simple y sin riesgo de
 * mostrar un número viejo.
 */

import { traerTodo, guardar } from './api.js';
import { calcularRentabilidad, precioSugeridoModalidad, precioParaMargen, CONTADO } from '../core/engine.js';

const estado = {
  cargado: false,
  fuente: null,
  horaCarga: null,
  raw: null,
  cfg: null,
  tarifas: {},
  productos: [],
  productoMarketplace: [],
  publicaciones: [],
  marketplaces: [],
  resultados: [],
  indices: { producto: new Map(), pm: new Map() },
};

const suscriptores = new Set();
export const suscribir = (fn) => { suscriptores.add(fn); return () => suscriptores.delete(fn); };
const notificar = () => suscriptores.forEach((fn) => fn(estado));

const nro = (v) => {
  if (typeof v === 'number') return v;
  if (v === '' || v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const bool = (v) => v === true || v === 'true' || v === 'TRUE' || v === 1;

/** Arma el objeto de configuración que consume el motor. */
const normalizar = (data) => {
  const plano = {};
  (data.Config || []).forEach((c) => { plano[c.clave] = c.valor; });

  const marketplaces = {};
  (data.Marketplaces || []).forEach((m) => {
    marketplaces[m.id] = {
      comisionPctDefault: nro(m.comision_pct_default),
      umbralEnvio: nro(m.umbral_envio),
      procesamientoPagosPct: nro(m.procesamiento_pagos_pct),
    };
  });

  const financiacion = {};
  (data.Financiacion || []).forEach((f) => {
    const mp = String(f.marketplace_id);
    (financiacion[mp] ||= {})[nro(f.cuotas)] = {
      costo_real: nro(f.costo_real),
      markup: nro(f.markup),
    };
  });

  const tarifas = {};
  [...(data.TarifasLogistica || []), ...(data.TarifasComisionFija || [])].forEach((t) => {
    (tarifas[t.tabla] ||= []).push({
      peso_min: nro(t.peso_min), peso_max: nro(t.peso_max),
      precio_min: nro(t.precio_min), precio_max: nro(t.precio_max),
      valor_c_iva: nro(t.valor_c_iva), vigencia_desde: t.vigencia_desde,
    });
  });

  return {
    cfg: {
      iva: nro(plano.IVA) || 0.21,
      tc: nro(plano.TIPO_CAMBIO),
      divisorVolumetrico: nro(plano.DIVISOR_VOLUMETRICO) || 4000,
      iibbPct: nro(plano.IIBB_PCT),
      impDebCredPct: nro(plano.IMP_DEB_CRED_PCT),
      marketplaces,
      financiacion,
    },
    tarifas,
  };
};

export const cargar = async () => {
  const { data, fuente } = await traerTodo();
  const { cfg, tarifas } = normalizar(data);

  estado.raw = data;
  estado.cfg = cfg;
  estado.tarifas = tarifas;
  estado.marketplaces = (data.Marketplaces || []).slice()
    .sort((a, b) => nro(a.orden) - nro(b.orden));
  estado.productos = (data.Productos || []).map((p) => ({
    ...p,
    sku: String(p.sku),
    costo_usd: nro(p.costo_usd), peso_real: nro(p.peso_real),
    alto: nro(p.alto), ancho: nro(p.ancho), largo: nro(p.largo),
  }));
  estado.productoMarketplace = (data.ProductoMarketplace || []).map((x) => ({
    ...x,
    sku: String(x.sku),
    comision_pct: nro(x.comision_pct), publicidad_pct: nro(x.publicidad_pct),
    varios_pct: nro(x.varios_pct), peso_real: nro(x.peso_real),
    alto: nro(x.alto), ancho: nro(x.ancho), largo: nro(x.largo),
    peso_volumetrico_manual: nro(x.peso_volumetrico_manual),
    envio_me1_manual_c_iva: nro(x.envio_me1_manual_c_iva),
    activo: x.activo === '' ? true : bool(x.activo),
  }));
  estado.publicaciones = (data.Publicaciones || []).map((p) => ({
    ...p, sku: String(p.sku), pvp_c_iva: nro(p.pvp_c_iva),
  }));

  estado.indices.producto = new Map(estado.productos.map((p) => [p.sku, p]));
  estado.indices.pm = new Map(estado.productoMarketplace.map((x) => [`${x.sku}|${x.marketplace_id}`, x]));

  estado.cargado = true;
  estado.fuente = fuente;
  estado.horaCarga = new Date();
  recalcular();
  return estado;
};

/** Recalcula todas las publicaciones activas. */
export const recalcular = () => {
  const salida = [];
  estado.publicaciones.forEach((pub) => {
    if (pub.estado === 'INACTIVA') return;
    const producto = estado.indices.producto.get(pub.sku);
    const pm = estado.indices.pm.get(`${pub.sku}|${pub.marketplace_id}`);
    if (!producto || !pm || pm.activo === false) return;
    if (producto.estado === 'INACTIVO') return;
    salida.push({
      ...calcularRentabilidad({
        producto, pm,
        marketplaceId: pub.marketplace_id,
        modalidad: pub.modalidad,
        pvpConIva: pub.pvp_c_iva,
        cfg: estado.cfg, tarifas: estado.tarifas,
      }),
      descripcion: producto.descripcion,
      marca: producto.marca,
      categoria: producto.categoria,
    });
  });
  estado.resultados = salida;
  notificar();
  return salida;
};

/** Rentabilidad puntual, sin persistir. Para simular precios en la UI. */
export const simular = ({ sku, marketplaceId, modalidad = CONTADO, pvpConIva }) => {
  const producto = estado.indices.producto.get(String(sku));
  const pm = estado.indices.pm.get(`${sku}|${marketplaceId}`);
  if (!producto || !pm) return null;
  return calcularRentabilidad({
    producto, pm, marketplaceId, modalidad, pvpConIva,
    cfg: estado.cfg, tarifas: estado.tarifas,
  });
};

export const precioSugerido = (marketplaceId, modalidad, pvpContado) =>
  precioSugeridoModalidad({ pvpContado, cfg: estado.cfg, marketplaceId, modalidad });

export const precioObjetivo = ({ sku, marketplaceId, modalidad, margenObjetivo }) => {
  const producto = estado.indices.producto.get(String(sku));
  const pm = estado.indices.pm.get(`${sku}|${marketplaceId}`);
  if (!producto || !pm) return null;
  return precioParaMargen({
    producto, pm, marketplaceId, modalidad, margenObjetivo,
    cfg: estado.cfg, tarifas: estado.tarifas,
  });
};

/** Modalidades disponibles según la financiación cargada. */
export const modalidades = (marketplaceId) => {
  const cuotas = Object.keys(estado.cfg?.financiacion?.[marketplaceId] || {})
    .map(Number).filter((n) => n > 1).sort((a, b) => a - b);
  return [CONTADO, ...cuotas];
};

/**
 * Guarda y actualiza el estado local. Si el backend falla, no se toca nada:
 * mejor un error visible que una pantalla que miente sobre lo que se guardó.
 */
export const persistir = async (tab, filas) => {
  await guardar(tab, filas);
  // Los datos de catálogo se parchean en memoria, que es barato. Cambiar un
  // parámetro o una tarifa afecta a todo, así que en ese caso se recarga entero.
  const coleccion = {
    Productos: 'productos',
    ProductoMarketplace: 'productoMarketplace',
    Publicaciones: 'publicaciones',
  }[tab];
  if (!coleccion) {
    await cargar();
    return;
  }
  {
    filas.forEach((nueva) => {
      const clave = tab === 'Productos' ? ['sku']
        : tab === 'ProductoMarketplace' ? ['sku', 'marketplace_id']
          : ['sku', 'marketplace_id', 'modalidad'];
      const idx = estado[coleccion].findIndex((f) =>
        clave.every((c) => String(f[c]) === String(nueva[c])));
      if (idx >= 0) Object.assign(estado[coleccion][idx], nueva);
      else estado[coleccion].push({ ...nueva });
    });
    estado.indices.producto = new Map(estado.productos.map((p) => [String(p.sku), p]));
    estado.indices.pm = new Map(estado.productoMarketplace.map((x) => [`${x.sku}|${x.marketplace_id}`, x]));
  }
  recalcular();
};

export const obtener = () => estado;
export { CONTADO };
