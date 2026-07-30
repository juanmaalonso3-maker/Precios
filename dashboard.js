/**
 * Dashboard — la primera pantalla. Su único trabajo es responder "¿hay algo que
 * esté perdiendo plata ahora mismo?" antes de que haya que buscarlo.
 */

import { obtener } from '../../data/store.js';
import { pesos, pesosFirmado, porcentaje, barraMargen, chipMarketplace, etiquetaModalidad, escapar } from '../format.js';
import { tabla, indicadores, activarOrden } from '../componentes.js';

const orden = {};

export const titulo = 'Panel general';

export const render = () => {
  const { resultados, productos, marketplaces, cfg, publicaciones } = obtener();
  const contado = resultados.filter((r) => r.modalidad === 'CONTADO');
  const perdidas = resultados.filter((r) => r.negativo);
  const conAvisos = resultados.filter((r) => r.advertencias.length);

  const margenPromedio = contado.length
    ? contado.reduce((s, r) => s + (r.margenSobreFacturacionNeta ?? 0), 0) / contado.length
    : null;
  const utilidadTotal = contado.reduce((s, r) => s + r.utilidad, 0);

  // Brecha entre marketplaces: mismo producto, misma modalidad, márgenes muy
  // distintos. Suele significar un precio desalineado, no un costo distinto.
  const porSku = new Map();
  contado.forEach((r) => {
    if (!porSku.has(r.sku)) porSku.set(r.sku, []);
    porSku.get(r.sku).push(r);
  });
  const brechas = [];
  porSku.forEach((lista, sku) => {
    if (lista.length < 2) return;
    const margenes = lista.map((r) => r.margenSobreFacturacionNeta ?? 0);
    const brecha = Math.max(...margenes) - Math.min(...margenes);
    if (brecha >= 0.08) {
      const mejor = lista.reduce((a, b) => ((a.margenSobreFacturacionNeta ?? 0) > (b.margenSobreFacturacionNeta ?? 0) ? a : b));
      const peor = lista.reduce((a, b) => ((a.margenSobreFacturacionNeta ?? 0) < (b.margenSobreFacturacionNeta ?? 0) ? a : b));
      brechas.push({ sku, descripcion: lista[0].descripcion, brecha, mejor, peor });
    }
  });

  const colsPerdidas = [
    { clave: 'sku', titulo: 'SKU', mono: true, ancho: '76px' },
    { clave: 'descripcion', titulo: 'Producto', render: (f) => escapar(f.descripcion || '') },
    { clave: 'marketplaceId', titulo: 'Canal', ancho: '96px', render: (f) => chipMarketplace(f.marketplaceId) },
    { clave: 'modalidad', titulo: 'Modalidad', ancho: '96px', render: (f) => escapar(etiquetaModalidad(f.modalidad)) },
    { clave: 'pvpConIva', titulo: 'PVP c/IVA', alinear: 'der', mono: true, render: (f) => pesos(f.pvpConIva) },
    { clave: 'utilidad', titulo: 'Utilidad', alinear: 'der', mono: true, render: (f) => `<span class="cifra-perdida">${pesosFirmado(f.utilidad)}</span>` },
    { clave: 'margenSobreFacturacionNeta', titulo: 'Margen', ancho: '160px', render: (f) => barraMargen(f.margenSobreFacturacionNeta) },
  ];

  const colsBrechas = [
    { clave: 'sku', titulo: 'SKU', mono: true, ancho: '76px' },
    { clave: 'descripcion', titulo: 'Producto', render: (f) => escapar(f.descripcion || '') },
    {
      clave: 'peor',
      titulo: 'Peor canal',
      render: (f) => `${chipMarketplace(f.peor.marketplaceId)} <span class="mono tenue">${porcentaje(f.peor.margenSobreFacturacionNeta)}</span>`,
      valor: (f) => f.peor.margenSobreFacturacionNeta,
    },
    {
      clave: 'mejor',
      titulo: 'Mejor canal',
      render: (f) => `${chipMarketplace(f.mejor.marketplaceId)} <span class="mono tenue">${porcentaje(f.mejor.margenSobreFacturacionNeta)}</span>`,
      valor: (f) => f.mejor.margenSobreFacturacionNeta,
    },
    { clave: 'brecha', titulo: 'Diferencia', alinear: 'der', mono: true, render: (f) => `${(f.brecha * 100).toFixed(1)} pts` },
  ];

  return `
    ${indicadores([
      { etiqueta: 'Productos activos', valor: String(productos.filter((p) => p.estado !== 'INACTIVO').length), pie: `${publicaciones.length} publicaciones` },
      { etiqueta: 'Canales', valor: String(marketplaces.filter((m) => m.activo === true || m.activo === 'true').length), pie: `de ${marketplaces.length} configurados` },
      { etiqueta: 'Margen promedio', valor: porcentaje(margenPromedio), pie: 'contado, sobre facturación neta' },
      { etiqueta: 'Utilidad por unidad', valor: pesos(utilidadTotal), pie: 'suma de todo el catálogo en contado' },
      { etiqueta: 'En pérdida', valor: String(perdidas.length), pie: perdidas.length ? 'requieren acción' : 'nada por revisar', alerta: perdidas.length > 0 },
    ])}

    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Publicaciones en pérdida</h2>
        <p>Vendiendo estas unidades se pierde plata al precio actual. Es el único umbral que el sistema marca en rojo.</p>
      </header>
      ${tabla(colsPerdidas, perdidas, {
        id: 'perdidas',
        ...(orden.perdidas || { ordenPor: 'margenSobreFacturacionNeta', ordenAsc: true }),
        vacio: 'Ninguna publicación está en pérdida. Buen momento para revisar precios al alza.',
      })}
    </section>

    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Diferencias entre canales</h2>
        <p>Mismo producto, misma modalidad, más de 8 puntos de margen de diferencia. Casi siempre es un precio desalineado, no un costo distinto.</p>
      </header>
      ${tabla(colsBrechas, brechas, {
        id: 'brechas',
        ...(orden.brechas || { ordenPor: 'brecha', ordenAsc: false }),
        vacio: 'Los márgenes están alineados entre canales.',
      })}
    </section>

    ${conAvisos.length ? `
    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Datos incompletos</h2>
        <p>Estas publicaciones se calculan con información faltante, así que el margen que muestran no es confiable.</p>
      </header>
      <ul class="lista-avisos">
        ${[...new Set(conAvisos.map((r) => `${r.sku}|${r.marketplaceId}|${r.advertencias.join(' · ')}`))]
    .map((linea) => {
      const [sku, mp, texto] = linea.split('|');
      return `<li><span class="mono">${escapar(sku)}</span> ${chipMarketplace(mp)} ${escapar(texto)}</li>`;
    }).join('')}
      </ul>
    </section>` : ''}

    <p class="pie-nota">
      Tipo de cambio ${pesos(cfg.tc)} · IVA ${porcentaje(cfg.iva, 0)} ·
      IIBB ${porcentaje(cfg.iibbPct, 0)} y débito/crédito ${porcentaje(cfg.impDebCredPct, 1)} sobre el precio con IVA.
    </p>`;
};

export const activar = (contenedor, refrescar) => activarOrden(contenedor, orden, refrescar);
