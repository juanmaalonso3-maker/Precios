import { readFileSync } from 'fs';
import { calcularRentabilidad, precioSugeridoModalidad, precioParaMargen, precioEquivalenteContado } from './src/core/engine.js';
import { buscarTarifa } from './src/core/tarifas.js';

const filas = JSON.parse(readFileSync('./tarifas.json', 'utf8'));
const tarifas = {};
filas.forEach(([mp, tabla, pmin, pmax, prmin, prmax, val, vig]) => {
  (tarifas[tabla] ||= []).push({
    peso_min: pmin, peso_max: pmax, precio_min: prmin, precio_max: prmax,
    valor_c_iva: val, vigencia_desde: vig,
  });
});

const FIN_ML = { 3:{costo_real:0.090,markup:0.085}, 6:{costo_real:0.142,markup:0.085},
                 9:{costo_real:0.189,markup:0.085}, 12:{costo_real:0.232,markup:0.085},
                 18:{costo_real:0,markup:0.085} };
const cfg = {
  iva: 0.21, tc: 1480, divisorVolumetrico: 4000, iibbPct: 0.04, impDebCredPct: 0.012,
  marketplaces: {
    ML: { umbralEnvio: 33000, comisionPctDefault: 0.145 },
    FRAVEGA: { comisionPctDefault: 0.15 },
    ONCITY: { comisionPctDefault: 0.116 },
    VIACOMPRAS: { comisionPctDefault: 0 },
    BNA: { comisionPctDefault: 0.08, procesamientoPagosPct: 0.018 },
  },
  financiacion: { ML: FIN_ML, FRAVEGA: FIN_ML, ONCITY: FIN_ML, VIACOMPRAS: FIN_ML, BNA: FIN_ML },
};

let fallos = 0;
const cerca = (a, b, tol, etiqueta) => {
  const ok = a !== null && Math.abs(a - b) <= tol;
  if (!ok) { fallos += 1; console.log(`  ✗ ${etiqueta}: obtenido ${a}, esperado ${b}`); }
  else console.log(`  ✓ ${etiqueta}: ${typeof a === 'number' ? a.toFixed(4) : a}`);
};

const freidora = { sku: 20608, titulo: 'Freidora por Aire KTA608', costo_usd: 45.4, peso_real: 4.8 };
const pmMeli = { sku: 20608, marketplace_id: 'ML', comision_pct: 0.145, publicidad_pct: 0, varios_pct: 0,
  alto: 44.9, ancho: 37.2, largo: 39.2, peso_volumetrico_manual: 16.368744, modalidad_envio: 'ME' };

console.log('\n[1] Freidora KTA608 — ML contado, $129.999');
const r1 = calcularRentabilidad({ producto: freidora, pm: pmMeli, marketplaceId: 'ML', pvpConIva: 129999, cfg, tarifas });
cerca(r1.pesoFacturable, 16.368744, 0.0001, 'peso facturable = volumétrico manual');
cerca(r1.facturado.logistica, 17830, 0.01, 'envío c/IVA tramo 15-20 kg, +$50.000');
cerca(r1.ingresoNeto, 107437.1901, 0.01, 'ingreso neto');
cerca(r1.costos.comision, 15578.3926, 0.01, 'comisión neta (14,5% IVA incluido)');
cerca(r1.costos.iibb, 5199.96, 0.01, 'IIBB 4% sobre PVP c/IVA');
cerca(r1.costos.impDebCred, 1559.988, 0.01, 'Imp. Déb/Créd 1,2%');
cerca(r1.costos.costoProducto, 67192, 0.01, 'costo producto USD 45,4 x 1.480');
cerca(r1.utilidad, 3171.31, 0.02, 'utilidad neta');
cerca(r1.margenSobreFacturacionNeta, 0.029518, 0.00001, 'margen s/facturación neta');
console.log(`  régimen: ${r1.regimenLogistico}`);

console.log('\n[2] Cargo fijo bajo umbral — Plancha KTB80, ML, $16.666');
const plancha = { sku: 22506, costo_usd: 5.74, peso_real: 0.85 };
const pmPlancha = { marketplace_id: 'ML', comision_pct: 0.16, publicidad_pct: 0.03, varios_pct: 0.02,
  alto: 35, ancho: 5, largo: 9.5, peso_volumetrico_manual: 0.415625 };
const r2 = calcularRentabilidad({ producto: plancha, pm: pmPlancha, marketplaceId: 'ML', pvpConIva: 16666, cfg, tarifas });
cerca(r2.pesoFacturable, 0.85, 0.0001, 'peso facturable = peso real (mayor que volumétrico)');
cerca(r2.facturado.cargoFijo, 2465, 0.01, 'cargo fijo (coincide con la planilla: $2.465)');
cerca(r2.facturado.logistica, 0, 0.01, 'sin envío bajo el umbral');
console.log(`  régimen: ${r2.regimenLogistico}`);

console.log('\n[3] Frávega — comisión IVA por fuera, $128.999');
const pmFravega = { marketplace_id: 'FRAVEGA', comision_pct: 0.15, publicidad_pct: 0, varios_pct: 0.02,
  alto: 29, ancho: 25, largo: 26, peso_real: 2.0 };
const r3 = calcularRentabilidad({ producto: freidora, pm: pmFravega, marketplaceId: 'FRAVEGA', pvpConIva: 128999, cfg, tarifas });
cerca(r3.pesoFacturable, 4.7125, 0.0001, 'peso volumétrico con medidas propias de Frávega');
cerca(r3.facturado.comision, 23413.3185, 0.01, 'comisión facturada 15% + IVA = 18,15%');
cerca(r3.costos.comision, 19349.85, 0.01, 'comisión neta = 15% pleno');
cerca(r3.facturado.logistica, 6669, 0.01, 'fee logístico escalón 1,5-5 kg, orden >= $35.000');
cerca(r3.utilidad, 5717.16, 0.02, 'utilidad neta');

console.log('\n[4] La misma tasa cuesta distinto según el marketplace');
const netoML = calcularRentabilidad({ producto: freidora, pm: { ...pmMeli, comision_pct: 0.15 }, marketplaceId: 'ML', pvpConIva: 100, cfg, tarifas }).costos.comision;
const netoFV = calcularRentabilidad({ producto: freidora, pm: { ...pmFravega, comision_pct: 0.15 }, marketplaceId: 'FRAVEGA', pvpConIva: 100, cfg, tarifas }).costos.comision;
cerca(netoML, 12.3967, 0.001, '15% en ML sobre $100 c/IVA cuesta');
cerca(netoFV, 15.0, 0.001, '15% en Frávega sobre $100 c/IVA cuesta');

console.log('\n[5] Cuotas sin cascada — desde el contado, no de la anterior');
[3, 6, 9, 12].forEach((c) => {
  const p = precioSugeridoModalidad({ pvpContado: 129999, cfg, marketplaceId: 'ML', modalidad: c });
  console.log(`  ${String(c).padStart(2)} cuotas: $${p.toFixed(0).padStart(9)}  (factor ${(p / 129999).toFixed(4)})`);
});
cerca(precioSugeridoModalidad({ pvpContado: 129999, cfg, marketplaceId: 'ML', modalidad: 12 }), 171208.68, 0.01,
  '12 cuotas = contado x 1,317 (la planilla daba $314.469 = x2,419)');
cerca(precioEquivalenteContado({ pvpConIva: 171208.68, cfg, marketplaceId: 'ML', modalidad: 12 }), 129999, 0.01,
  'equivalente contado devuelve el precio original');

console.log('\n[6] ViaCompras — bordes del escalón (5,0 kg entra; 5,1 kg no)');
cerca(buscarTarifa(tarifas.VIACOMPRAS_FEE, 5.0, 50000), 18650, 0.01, '5,0 kg');
cerca(buscarTarifa(tarifas.VIACOMPRAS_FEE, 5.1, 50000), 20800, 0.01, '5,1 kg');
cerca(buscarTarifa(tarifas.VIACOMPRAS_FEE, 1.0, 50000), 16000, 0.01, '1,0 kg');

console.log('\n[7] Tienda BNA — comisión 8% + IVA y procesamiento 1,8% + IVA');
const pmBna = { marketplace_id: 'BNA', comision_pct: 0.08, publicidad_pct: 0, varios_pct: 0, alto: 29, ancho: 25, largo: 26, peso_real: 2 };
const r7 = calcularRentabilidad({ producto: freidora, pm: pmBna, marketplaceId: 'BNA', pvpConIva: 100000, cfg, tarifas });
cerca(r7.costos.comision, 8000, 0.01, 'comisión neta 8%');
cerca(r7.costos.extras[0].importe, 1800, 0.01, 'procesamiento neto 1,8%');

console.log('\n[8] Despeje inverso — precio para 20% de margen neto');
const inv = precioParaMargen({ producto: freidora, pm: pmMeli, marketplaceId: 'ML', cfg, tarifas, margenObjetivo: 0.20 });
console.log(`  precio: $${inv.pvpConIva.toFixed(0)} en ${inv.iteraciones} iteraciones, convergió: ${inv.convergio}`);
cerca(inv.resultado.margenSobreFacturacionNeta, 0.20, 0.0001, 'margen alcanzado');

console.log('\n[9] Producto en pérdida — se marca como negativo');
const r9 = calcularRentabilidad({ producto: freidora, pm: pmMeli, marketplaceId: 'ML', pvpConIva: 95000, cfg, tarifas });
console.log(`  utilidad $${r9.utilidad.toFixed(0)} · negativo: ${r9.negativo}`);
if (!r9.negativo) { fallos += 1; console.log('  ✗ debería marcarse negativo'); }

console.log('\n[10] ME1 — importe manual con IVA, sin tabla');
const pmMe1 = { ...pmMeli, modalidad_envio: 'ME1', envio_me1_manual_c_iva: 50000, peso_volumetrico_manual: 30.2878 };
const r10 = calcularRentabilidad({ producto: { sku: 47820, costo_usd: 122.3, peso_real: 42 }, pm: pmMe1, marketplaceId: 'ML', pvpConIva: 449099, cfg, tarifas });
cerca(r10.costos.costoLogistico, 50000 / 1.21, 0.01, 'ME1 neteado');
console.log(`  régimen: ${r10.regimenLogistico}`);
const sinImporte = calcularRentabilidad({ producto: { sku: 1, costo_usd: 10, peso_real: 42 }, pm: { ...pmMe1, envio_me1_manual_c_iva: 0 }, marketplaceId: 'ML', pvpConIva: 449099, cfg, tarifas });
console.log(`  advertencia sin importe: ${sinImporte.advertencias[0] ? 'sí' : 'NO'}`);

console.log(`\n${fallos === 0 ? '✅ TODAS LAS VALIDACIONES PASARON' : `❌ ${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
