import { readFileSync } from 'fs';
import { calcularRentabilidad, precioSugeridoModalidad } from './src/core/engine.js';

const d = JSON.parse(readFileSync('/tmp/dataset.json', 'utf8'));
const cfgRaw = {}; d.Config.forEach(c => cfgRaw[c.clave] = c.valor);
const fin = {};
d.Financiacion.forEach(f => { (fin[f.marketplace_id] ||= {})[f.cuotas] = { costo_real: f.costo_real, markup: f.markup }; });
const mps = {};
d.Marketplaces.forEach(m => mps[m.id] = { comisionPctDefault: m.comision_pct_default, umbralEnvio: m.umbral_envio, procesamientoPagosPct: m.procesamiento_pagos_pct });
const cfg = { iva: cfgRaw.IVA, tc: cfgRaw.TIPO_CAMBIO, divisorVolumetrico: cfgRaw.DIVISOR_VOLUMETRICO,
  iibbPct: cfgRaw.IIBB_PCT, impDebCredPct: cfgRaw.IMP_DEB_CRED_PCT, marketplaces: mps, financiacion: fin };
const tarifas = {};
[...d.TarifasLogistica, ...d.TarifasComisionFija].forEach(t => (tarifas[t.tabla] ||= []).push(t));

const prods = {}; d.Productos.forEach(p => prods[String(p.sku)] = p);
const pms = {}; d.ProductoMarketplace.forEach(x => pms[x.sku + '|' + x.marketplace_id] = x);

const fmt = n => n === null || n === undefined ? '   —' : n.toLocaleString('es-AR', { maximumFractionDigits: 0 });
const pct = n => n === null ? '   —' : (n * 100).toFixed(1) + '%';

let neg = 0, avisos = 0, total = 0;
const filas = [];
d.Publicaciones.forEach(pub => {
  const producto = prods[String(pub.sku)];
  const pm = pms[pub.sku + '|' + pub.marketplace_id];
  if (!producto || !pm) return;
  const r = calcularRentabilidad({ producto, pm, marketplaceId: pub.marketplace_id, modalidad: pub.modalidad, pvpConIva: pub.pvp_c_iva, cfg, tarifas });
  total++; if (r.negativo) neg++; avisos += r.advertencias.length;
  filas.push({ r, producto, avisos: r.advertencias });
});

console.log('\n═══ RENTABILIDAD CONTADO — dataset sembrado ═══\n');
console.log('SKU     Producto                              MP        PVP c/IVA   Peso   Envío/Fijo  Comis.   IIBB   Utilidad   Mg neto');
console.log('─'.repeat(122));
filas.filter(f => f.r.marketplaceId === 'ML').forEach(({ r, producto }) => {
  console.log(
    String(r.sku).padEnd(8) + (producto.descripcion || '').slice(0, 36).padEnd(38) +
    r.marketplaceId.padEnd(10) + fmt(r.pvpConIva).padStart(9) +
    (r.pesoFacturable === null ? '  —' : r.pesoFacturable.toFixed(1)).padStart(7) +
    fmt(r.facturado.logistica + r.facturado.cargoFijo).padStart(12) +
    fmt(r.costos.comision).padStart(9) + fmt(r.costos.iibb).padStart(7) +
    fmt(r.utilidad).padStart(11) + pct(r.margenSobreFacturacionNeta).padStart(9) +
    (r.negativo ? '  ◀ PÉRDIDA' : ''));
});

console.log('\n═══ COMPARADOR — mismo producto, modalidad equivalente ═══\n');
const sku = 20608;
console.log('Freidora por Aire KTA608 — contado');
console.log('MP            PVP c/IVA    Logística   Comisión efectiva    Utilidad   Mg neto');
console.log('─'.repeat(80));
['ML', 'FRAVEGA', 'ONCITY'].forEach(mp => {
  const pub = d.Publicaciones.find(p => p.sku === sku && p.marketplace_id === mp);
  if (!pub) return;
  const r = calcularRentabilidad({ producto: prods[String(sku)], pm: pms[sku + '|' + mp], marketplaceId: mp, pvpConIva: pub.pvp_c_iva, cfg, tarifas });
  const efectiva = r.costos.comision / r.pvpConIva;
  console.log(mp.padEnd(14) + fmt(r.pvpConIva).padStart(9) + fmt(r.costos.costoLogistico).padStart(13) +
    (pct(r.tasas.comision) + ' → ' + pct(efectiva)).padStart(20) + fmt(r.utilidad).padStart(12) + pct(r.margenSobreFacturacionNeta).padStart(9));
});

console.log('\n═══ PRECIOS EN CUOTAS — ML, sin cascada ═══\n');
const pubML = d.Publicaciones.find(p => p.sku === sku && p.marketplace_id === 'ML');
console.log('Modalidad   Precio sugerido   Factor   Utilidad   Mg neto');
console.log('─'.repeat(58));
['CONTADO', 3, 6, 9, 12].forEach(m => {
  const precio = m === 'CONTADO' ? pubML.pvp_c_iva : precioSugeridoModalidad({ pvpContado: pubML.pvp_c_iva, cfg, marketplaceId: 'ML', modalidad: m });
  const r = calcularRentabilidad({ producto: prods[String(sku)], pm: pms[sku + '|ML'], marketplaceId: 'ML', modalidad: m, pvpConIva: precio, cfg, tarifas });
  console.log(String(m).padEnd(12) + fmt(precio).padStart(15) + (precio / pubML.pvp_c_iva).toFixed(3).padStart(9) +
    fmt(r.utilidad).padStart(11) + pct(r.margenSobreFacturacionNeta).padStart(9));
});

console.log(`\n═══ RESUMEN ═══`);
console.log(`Publicaciones calculadas: ${total}`);
console.log(`En pérdida: ${neg}`);
console.log(`Advertencias de datos: ${avisos}`);
const conAviso = filas.filter(f => f.avisos.length);
if (conAviso.length) {
  console.log('\nAdvertencias:');
  const vistas = new Set();
  conAviso.forEach(f => { const k = f.r.sku + f.avisos[0]; if (!vistas.has(k)) { vistas.add(k); console.log(`  SKU ${f.r.sku} (${f.r.marketplaceId}): ${f.avisos.join(' | ')}`); } });
}
