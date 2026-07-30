/**
 * Rentabilidad por canal — una pantalla por marketplace, con el desglose
 * completo de costos y el precio editable en línea.
 *
 * En MercadoLibre se listan todas las publicaciones del mismo producto (una por
 * modalidad de cuotas). En los demás canales hay un precio único, así que se
 * muestran las modalidades habilitadas calculadas sobre ese mismo precio.
 */

import { obtener, persistir, simular, precioSugerido, precioObjetivo, modalidades } from '../../data/store.js';
import {
  pesos, pesosFirmado, porcentaje, kilos, barraMargen, chipRegimen,
  etiquetaModalidad, marcaAviso, escapar,
} from '../format.js';
import { tabla, indicadores, activarOrden, buscador, selector, panel, campo, leerCampos, notificar, descargarCsv } from '../componentes.js';

const orden = {};
const filtro = { texto: '', modalidad: 'TODAS' };

export let marketplaceActual = 'ML';
export const fijarMarketplace = (id) => { marketplaceActual = id; };
export const titulo = () => {
  const mp = obtener().marketplaces.find((m) => m.id === marketplaceActual);
  return mp ? `Rentabilidad · ${mp.nombre}` : 'Rentabilidad';
};

/** Filas a mostrar: publicaciones reales más las modalidades derivadas. */
const armarFilas = () => {
  const { resultados, publicaciones, marketplaces } = obtener();
  const mpDef = marketplaces.find((m) => m.id === marketplaceActual) || {};
  const variantes = mpDef.soporta_variantes_cuotas === true || mpDef.soporta_variantes_cuotas === 'true';
  const propias = resultados.filter((r) => r.marketplaceId === marketplaceActual);

  if (variantes) return propias.map((r) => ({ ...r, derivada: false }));

  // Precio único: se proyectan las modalidades habilitadas sobre el mismo precio.
  const filas = [];
  propias.forEach((r) => {
    filas.push({ ...r, derivada: false });
    if (r.modalidad !== 'CONTADO') return;
    modalidades(marketplaceActual).filter((m) => m !== 'CONTADO').forEach((cuotas) => {
      const pub = publicaciones.find((p) => p.sku === r.sku && p.marketplace_id === marketplaceActual && String(p.modalidad) === String(cuotas));
      if (pub) return;
      const sim = simular({ sku: r.sku, marketplaceId: marketplaceActual, modalidad: cuotas, pvpConIva: r.pvpConIva });
      if (sim) filas.push({ ...sim, descripcion: r.descripcion, marca: r.marca, categoria: r.categoria, derivada: true });
    });
  });
  return filas;
};

const columnas = () => [
  { clave: 'sku', titulo: 'SKU', mono: true, ancho: '74px' },
  {
    clave: 'descripcion',
    titulo: 'Producto',
    render: (f) => `${escapar(f.descripcion || '')}${marcaAviso(f.advertencias)}${f.derivada ? '<span class="chip chip--derivada" title="Modalidad proyectada sobre el precio único de este canal">proyectada</span>' : ''}`,
  },
  { clave: 'modalidad', titulo: 'Modalidad', ancho: '92px', render: (f) => escapar(etiquetaModalidad(f.modalidad)), valor: (f) => (f.modalidad === 'CONTADO' ? 0 : f.modalidad) },
  {
    clave: 'pvpConIva', titulo: 'PVP c/IVA', alinear: 'der', mono: true, ancho: '104px',
    render: (f) => `<button class="celda-editable" data-editar="${escapar(f.sku)}" data-modalidad="${escapar(f.modalidad)}" title="Editar precio">${pesos(f.pvpConIva)}</button>`,
  },
  { clave: 'ingresoNeto', titulo: 'Neto', alinear: 'der', mono: true, ancho: '96px', render: (f) => pesos(f.ingresoNeto), ayuda: 'Precio sin IVA' },
  { clave: 'costoProducto', titulo: 'Costo', alinear: 'der', mono: true, ancho: '96px', render: (f) => pesos(f.costos.costoProducto), valor: (f) => f.costos.costoProducto },
  { clave: 'comision', titulo: 'Comisión', alinear: 'der', mono: true, ancho: '92px', render: (f) => pesos(f.costos.comision), valor: (f) => f.costos.comision, ayuda: 'Costo neto de comisión, ya descontado el IVA recuperable' },
  { clave: 'financiero', titulo: 'Financiación', alinear: 'der', mono: true, ancho: '96px', render: (f) => pesos(f.costos.costoFinanciero), valor: (f) => f.costos.costoFinanciero },
  {
    clave: 'logistica', titulo: 'Logística', alinear: 'der', mono: true, ancho: '96px',
    render: (f) => pesos(f.costos.costoLogistico + f.costos.cargoFijo),
    valor: (f) => f.costos.costoLogistico + f.costos.cargoFijo,
  },
  { clave: 'regimen', titulo: 'Régimen', ancho: '92px', render: (f) => chipRegimen(f.regimenLogistico), valor: (f) => f.regimenLogistico },
  { clave: 'peso', titulo: 'Peso fact.', alinear: 'der', mono: true, ancho: '84px', render: (f) => kilos(f.pesoFacturable), valor: (f) => f.pesoFacturable ?? -1 },
  { clave: 'impuestos', titulo: 'Impuestos', alinear: 'der', mono: true, ancho: '92px', render: (f) => pesos(f.costos.iibb + f.costos.impDebCred), valor: (f) => f.costos.iibb + f.costos.impDebCred, ayuda: 'IIBB más impuesto al débito y crédito, sobre el precio con IVA' },
  { clave: 'gastos', titulo: 'Pub. y varios', alinear: 'der', mono: true, ancho: '96px', render: (f) => pesos(f.costos.publicidad + f.costos.varios), valor: (f) => f.costos.publicidad + f.costos.varios },
  {
    clave: 'utilidad', titulo: 'Utilidad', alinear: 'der', mono: true, ancho: '100px',
    render: (f) => `<span class="${f.negativo ? 'cifra-perdida' : 'cifra-fuerte'}">${pesosFirmado(f.utilidad)}</span>`,
  },
  { clave: 'margenSobreFacturacionNeta', titulo: 'Margen neto', ancho: '150px', render: (f) => barraMargen(f.margenSobreFacturacionNeta) },
  { clave: 'rentabilidadSobreCosto', titulo: 's/costo', alinear: 'der', mono: true, ancho: '78px', render: (f) => porcentaje(f.rentabilidadSobreCosto) },
];

export const render = () => {
  const { marketplaces } = obtener();
  const mpDef = marketplaces.find((m) => m.id === marketplaceActual) || {};
  let filas = armarFilas();

  if (filtro.texto) {
    const t = filtro.texto.toLowerCase();
    filas = filas.filter((f) => String(f.sku).includes(t) || String(f.descripcion || '').toLowerCase().includes(t));
  }
  if (filtro.modalidad !== 'TODAS') {
    filas = filas.filter((f) => String(f.modalidad) === filtro.modalidad);
  }

  const contado = filas.filter((f) => f.modalidad === 'CONTADO');
  const perdidas = filas.filter((f) => f.negativo);
  const margenProm = contado.length
    ? contado.reduce((s, f) => s + (f.margenSobreFacturacionNeta ?? 0), 0) / contado.length : null;

  const opcModalidad = [{ valor: 'TODAS', texto: 'Todas las modalidades' },
    ...modalidades(marketplaceActual).map((m) => ({ valor: String(m), texto: etiquetaModalidad(m) }))];

  return `
    ${indicadores([
      { etiqueta: 'Publicaciones', valor: String(filas.length) },
      { etiqueta: 'Margen promedio contado', valor: porcentaje(margenProm) },
      { etiqueta: 'En pérdida', valor: String(perdidas.length), alerta: perdidas.length > 0 },
      { etiqueta: 'Comisión base', valor: porcentaje(Number(mpDef.comision_pct_default) || 0), pie: mpDef.comision_iva_mode === 'incluido' ? 'IVA incluido en la tasa' : 'IVA por fuera' },
    ])}

    <div class="barra-herramientas">
      ${buscador(filtro.texto)}
      ${selector('filtro-modalidad', opcModalidad, filtro.modalidad)}
      <button class="btn btn--fantasma" id="exportar">Descargar CSV</button>
    </div>

    ${mpDef.notas ? `<p class="pie-nota">${escapar(mpDef.notas)}</p>` : ''}

    ${tabla(columnas(), filas, {
      id: 'rent',
      ...(orden.rent || { ordenPor: 'margenSobreFacturacionNeta', ordenAsc: true }),
      vacio: 'No hay publicaciones para este canal con los filtros actuales.',
    })}`;
};

export const activar = (contenedor, refrescar) => {
  activarOrden(contenedor, orden, refrescar);

  const busc = contenedor.querySelector('#buscador');
  if (busc) {
    busc.addEventListener('input', (e) => {
      filtro.texto = e.target.value;
      refrescar();
      const nuevo = document.querySelector('#buscador');
      if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
    });
  }

  const selMod = contenedor.querySelector('#filtro-modalidad');
  if (selMod) selMod.addEventListener('change', (e) => { filtro.modalidad = e.target.value; refrescar(); });

  const exp = contenedor.querySelector('#exportar');
  if (exp) {
    exp.addEventListener('click', () => {
      const filas = armarFilas();
      descargarCsv(`rentabilidad-${marketplaceActual.toLowerCase()}.csv`,
        ['SKU', 'Producto', 'Modalidad', 'PVP c/IVA', 'Neto', 'Costo', 'Comision', 'Financiacion',
          'Logistica', 'Regimen', 'Peso facturable', 'IIBB', 'Deb/Cred', 'Publicidad', 'Varios',
          'Utilidad', 'Margen neto', 'Margen s/costo'],
        filas.map((f) => [f.sku, f.descripcion, etiquetaModalidad(f.modalidad),
          Math.round(f.pvpConIva), Math.round(f.ingresoNeto), Math.round(f.costos.costoProducto),
          Math.round(f.costos.comision), Math.round(f.costos.costoFinanciero),
          Math.round(f.costos.costoLogistico + f.costos.cargoFijo), f.regimenLogistico,
          f.pesoFacturable === null ? '' : f.pesoFacturable.toFixed(3),
          Math.round(f.costos.iibb), Math.round(f.costos.impDebCred),
          Math.round(f.costos.publicidad), Math.round(f.costos.varios),
          Math.round(f.utilidad),
          f.margenSobreFacturacionNeta === null ? '' : (f.margenSobreFacturacionNeta * 100).toFixed(2),
          f.rentabilidadSobreCosto === null ? '' : (f.rentabilidadSobreCosto * 100).toFixed(2)]));
      notificar('CSV descargado.');
    });
  }

  contenedor.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => abrirEditorPrecio(btn.dataset.editar, btn.dataset.modalidad, refrescar));
  });
};

/** Editor de precio con vista previa del margen en vivo. */
const abrirEditorPrecio = (sku, modalidad, refrescar) => {
  const { publicaciones, resultados } = obtener();
  const actual = resultados.find((r) => r.sku === sku && r.marketplaceId === marketplaceActual && String(r.modalidad) === String(modalidad));
  const contadoPub = publicaciones.find((p) => p.sku === sku && p.marketplace_id === marketplaceActual && p.modalidad === 'CONTADO');
  const sugerido = contadoPub && modalidad !== 'CONTADO'
    ? precioSugerido(marketplaceActual, modalidad, contadoPub.pvp_c_iva) : null;

  const cuerpo = `
    <p class="panel__intro">${escapar(actual?.descripcion || sku)} · ${escapar(etiquetaModalidad(modalidad))}</p>
    ${campo('Precio de venta', 'pvp_c_iva', actual?.pvpConIva ?? 0, { paso: '1', sufijo: 'con IVA' })}
    ${sugerido ? `<p class="campo__ayuda">Sugerido desde el contado: <button type="button" class="enlace" id="usar-sugerido">${pesos(sugerido)}</button></p>` : ''}
    <div id="previa" class="previa"></div>
    <label class="campo">
      <span class="campo__etiqueta">Margen objetivo <em>opcional</em></span>
      <div class="fila-objetivo">
        <input type="number" id="objetivo" step="0.5" placeholder="15" >
        <button type="button" class="btn btn--fantasma" id="calcular-objetivo">Calcular precio</button>
      </div>
      <span class="campo__ayuda">Despeja el precio necesario para ese margen, teniendo en cuenta que cruzar un escalón de tarifa cambia el costo.</span>
    </label>`;

  const p = panel('Editar precio', cuerpo, async (cont) => {
    const datos = leerCampos(cont);
    const pvp = Number(datos.pvp_c_iva);
    if (!(pvp > 0)) throw new Error('El precio tiene que ser mayor a cero.');
    await persistir('Publicaciones', [{
      sku, marketplace_id: marketplaceActual, modalidad, pvp_c_iva: pvp,
      origen: 'manual', estado: 'ACTIVA',
    }]);
    notificar('Precio guardado.');
    refrescar();
  });

  const input = p.querySelector('[name="pvp_c_iva"]');
  const previa = p.querySelector('#previa');
  const pintar = () => {
    const r = simular({ sku, marketplaceId: marketplaceActual, modalidad, pvpConIva: Number(input.value) });
    if (!r) { previa.innerHTML = ''; return; }
    previa.innerHTML = `
      <div class="previa__fila"><span>Ingreso neto</span><b class="mono">${pesos(r.ingresoNeto)}</b></div>
      <div class="previa__fila"><span>Costo del producto</span><b class="mono">${pesos(r.costos.costoProducto)}</b></div>
      <div class="previa__fila"><span>Comisión y financiación</span><b class="mono">${pesos(r.costos.comision + r.costos.costoFinanciero)}</b></div>
      <div class="previa__fila"><span>Logística ${chipRegimen(r.regimenLogistico)}</span><b class="mono">${pesos(r.costos.costoLogistico + r.costos.cargoFijo)}</b></div>
      <div class="previa__fila"><span>Impuestos y gastos</span><b class="mono">${pesos(r.costos.iibb + r.costos.impDebCred + r.costos.publicidad + r.costos.varios)}</b></div>
      <div class="previa__fila previa__fila--total"><span>Utilidad</span><b class="mono ${r.negativo ? 'cifra-perdida' : 'cifra-fuerte'}">${pesosFirmado(r.utilidad)}</b></div>
      <div class="previa__margen">${barraMargen(r.margenSobreFacturacionNeta)}</div>`;
  };
  input.addEventListener('input', pintar);
  pintar();

  const usar = p.querySelector('#usar-sugerido');
  if (usar) usar.addEventListener('click', () => { input.value = Math.round(sugerido); pintar(); });

  p.querySelector('#calcular-objetivo').addEventListener('click', () => {
    const objetivo = Number(p.querySelector('#objetivo').value) / 100;
    if (!Number.isFinite(objetivo)) { notificar('Escribí un margen objetivo, por ejemplo 15.', 'error'); return; }
    const res = precioObjetivo({ sku, marketplaceId: marketplaceActual, modalidad, margenObjetivo: objetivo });
    if (!res || !res.convergio) { notificar('No se pudo despejar un precio para ese margen.', 'error'); return; }
    input.value = Math.round(res.pvpConIva);
    pintar();
  });
};
