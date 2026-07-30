/**
 * Base Maestra de Productos — donde vive la información técnica.
 *
 * Cada cambio acá recalcula todas las rentabilidades: el costo en USD, el peso y
 * las medidas alimentan las cinco pantallas de rentabilidad y el comparador.
 *
 * Las medidas están separadas a propósito: las reales viven en el producto, y
 * cada canal guarda las suyas. Un mismo producto puede declararse con medidas
 * distintas en cada marketplace, y el sistema nunca reutiliza el peso
 * volumétrico de MercadoLibre para los demás.
 */

import { obtener, persistir } from '../../data/store.js';
import { pesos, kilos, escapar } from '../format.js';
import { tabla, indicadores, activarOrden, buscador, selector, panel, campo, leerCampos, notificar, descargarCsv, aviso } from '../componentes.js';
import { pesoVolumetrico } from '../../core/tarifas.js';

const orden = {};
const filtro = { texto: '', marca: 'TODAS', estado: 'ACTIVO' };

export const titulo = 'Base maestra de productos';

const volumetrico = (p, divisor) => pesoVolumetrico(p.alto, p.ancho, p.largo, divisor);

const columnas = (cfg) => [
  { clave: 'sku', titulo: 'SKU', mono: true, ancho: '74px' },
  { clave: 'descripcion', titulo: 'Producto', render: (f) => escapar(f.descripcion || '') },
  { clave: 'marca', titulo: 'Marca', ancho: '84px' },
  { clave: 'categoria', titulo: 'Categoría', ancho: '132px' },
  { clave: 'modelo', titulo: 'Modelo', mono: true, ancho: '86px' },
  { clave: 'costo_usd', titulo: 'Costo USD', alinear: 'der', mono: true, ancho: '90px', render: (f) => (f.costo_usd ? f.costo_usd.toFixed(2) : '<span class="cifra-perdida">falta</span>') },
  { clave: 'costo_ars', titulo: 'Costo ARS', alinear: 'der', mono: true, ancho: '96px', render: (f) => pesos(f.costo_usd * cfg.tc), valor: (f) => f.costo_usd * cfg.tc },
  { clave: 'peso_real', titulo: 'Peso real', alinear: 'der', mono: true, ancho: '84px', render: (f) => kilos(f.peso_real) },
  { clave: 'medidas', titulo: 'Medidas reales', mono: true, ancho: '132px', render: (f) => (f.alto && f.ancho && f.largo ? `${f.alto} × ${f.ancho} × ${f.largo}` : '<span class="celda-sin-dato">sin medidas</span>'), valor: (f) => f.alto },
  { clave: 'volumetrico', titulo: 'Volumétrico', alinear: 'der', mono: true, ancho: '96px', render: (f) => kilos(volumetrico(f, cfg.divisorVolumetrico)), valor: (f) => volumetrico(f, cfg.divisorVolumetrico) ?? -1, ayuda: 'Alto × ancho × largo / divisor' },
  { clave: 'es_combo', titulo: 'Combo', ancho: '76px', render: (f) => (f.es_combo === true || f.es_combo === 'true' ? `<span class="chip" title="${escapar(f.receta || 'Combo')}">combo</span>` : '') },
  { clave: 'estado', titulo: 'Estado', ancho: '86px', render: (f) => `<span class="chip${f.estado === 'INACTIVO' ? ' chip--apagado' : ''}">${escapar(f.estado || 'ACTIVO')}</span>` },
  {
    clave: 'acciones', titulo: '', ancho: '110px',
    render: (f) => `<button class="btn btn--mini" data-editar="${escapar(f.sku)}">Editar</button>
      <button class="btn btn--mini btn--fantasma" data-canales="${escapar(f.sku)}">Canales</button>`,
  },
];

export const render = () => {
  const { productos, cfg, productoMarketplace } = obtener();
  let filas = productos;

  if (filtro.estado !== 'TODOS') filas = filas.filter((p) => (p.estado || 'ACTIVO') === filtro.estado);
  if (filtro.marca !== 'TODAS') filas = filas.filter((p) => p.marca === filtro.marca);
  if (filtro.texto) {
    const t = filtro.texto.toLowerCase();
    filas = filas.filter((p) => String(p.sku).includes(t)
      || String(p.descripcion || '').toLowerCase().includes(t)
      || String(p.modelo || '').toLowerCase().includes(t));
  }

  const marcas = [...new Set(productos.map((p) => p.marca).filter(Boolean))].sort();
  const sinCosto = productos.filter((p) => !p.costo_usd).length;
  const sinMedidas = productos.filter((p) => !(p.alto && p.ancho && p.largo)).length;
  const sinMedidasCanal = productoMarketplace.filter((x) => x.marketplace_id !== 'ML' && !(x.alto && x.ancho && x.largo)).length;

  return `
    ${indicadores([
      { etiqueta: 'Productos', valor: String(productos.length), pie: `${productos.filter((p) => p.estado !== 'INACTIVO').length} activos` },
      { etiqueta: 'Tipo de cambio', valor: pesos(cfg.tc), pie: 'se aplica a todo el catálogo' },
      { etiqueta: 'Sin costo en USD', valor: String(sinCosto), alerta: sinCosto > 0 },
      { etiqueta: 'Sin medidas reales', valor: String(sinMedidas), alerta: sinMedidas > 0 },
      { etiqueta: 'Sin medidas por canal', valor: String(sinMedidasCanal), alerta: sinMedidasCanal > 0 },
    ])}

    <div class="barra-herramientas">
      ${buscador(filtro.texto, 'Buscar por SKU, producto o modelo')}
      ${selector('marca', [{ valor: 'TODAS', texto: 'Todas las marcas' }, ...marcas.map((m) => ({ valor: m, texto: m }))], filtro.marca)}
      ${selector('estado', [
        { valor: 'ACTIVO', texto: 'Sólo activos' },
        { valor: 'INACTIVO', texto: 'Sólo inactivos' },
        { valor: 'TODOS', texto: 'Todos' },
      ], filtro.estado)}
      <button class="btn btn--fantasma" id="exportar">Descargar CSV</button>
    </div>

    ${aviso('Cambiar un costo, un peso o una medida recalcula al instante todas las rentabilidades y el comparador.')}

    ${tabla(columnas(cfg), filas, {
      id: 'prods',
      ...(orden.prods || { ordenPor: 'sku', ordenAsc: true }),
      vacio: 'Ningún producto coincide con los filtros.',
    })}`;
};

export const activar = (contenedor, refrescar) => {
  activarOrden(contenedor, orden, refrescar);

  const busc = contenedor.querySelector('#buscador');
  if (busc) busc.addEventListener('input', (e) => {
    filtro.texto = e.target.value;
    refrescar();
    const n = document.querySelector('#buscador');
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });
  ['marca', 'estado'].forEach((k) => {
    const el = contenedor.querySelector(`#${k}`);
    if (el) el.addEventListener('change', (e) => { filtro[k] = e.target.value; refrescar(); });
  });

  const exp = contenedor.querySelector('#exportar');
  if (exp) exp.addEventListener('click', () => {
    const { productos, cfg } = obtener();
    descargarCsv('base-maestra.csv',
      ['SKU', 'Producto', 'Marca', 'Categoria', 'Modelo', 'Estado', 'Costo USD', 'Costo ARS',
        'Peso real', 'Alto', 'Ancho', 'Largo', 'Volumetrico', 'Combo', 'Receta'],
      productos.map((p) => [p.sku, p.descripcion, p.marca, p.categoria, p.modelo, p.estado,
        p.costo_usd, Math.round(p.costo_usd * cfg.tc), p.peso_real, p.alto, p.ancho, p.largo,
        (volumetrico(p, cfg.divisorVolumetrico) ?? '').toFixed ? volumetrico(p, cfg.divisorVolumetrico).toFixed(3) : '',
        p.es_combo, p.receta]));
    notificar('CSV descargado.');
  });

  contenedor.querySelectorAll('[data-editar]').forEach((b) =>
    b.addEventListener('click', () => editarProducto(b.dataset.editar, refrescar)));
  contenedor.querySelectorAll('[data-canales]').forEach((b) =>
    b.addEventListener('click', () => editarCanales(b.dataset.canales, refrescar)));
};

const editarProducto = (sku, refrescar) => {
  const { productos, cfg } = obtener();
  const p = productos.find((x) => x.sku === sku);
  if (!p) return;

  const cuerpo = `
    <p class="panel__intro">${escapar(p.descripcion || sku)} · SKU ${escapar(sku)}</p>
    ${campo('Descripción', 'descripcion', p.descripcion || '', { tipo: 'text' })}
    ${campo('Marca', 'marca', p.marca || '', { tipo: 'text' })}
    ${campo('Categoría', 'categoria', p.categoria || '', { tipo: 'text' })}
    ${campo('Modelo', 'modelo', p.modelo || '', { tipo: 'text' })}
    ${campo('Costo', 'costo_usd', p.costo_usd, { paso: '0.01', sufijo: 'USD, nacionalizado y sin IVA', ayuda: `Al tipo de cambio actual: ${pesos(p.costo_usd * cfg.tc)}` })}
    ${campo('Peso real', 'peso_real', p.peso_real, { paso: '0.01', sufijo: 'kg' })}
    <div class="grilla-3">
      ${campo('Alto', 'alto', p.alto, { paso: '0.1', sufijo: 'cm' })}
      ${campo('Ancho', 'ancho', p.ancho, { paso: '0.1', sufijo: 'cm' })}
      ${campo('Largo', 'largo', p.largo, { paso: '0.1', sufijo: 'cm' })}
    </div>
    <p class="campo__ayuda" id="calc-vol"></p>
    ${campo('Estado', 'estado', p.estado || 'ACTIVO', {
      opcionesSelect: [{ valor: 'ACTIVO', texto: 'Activo' }, { valor: 'INACTIVO', texto: 'Inactivo' }],
    })}
    ${campo('Receta del combo', 'receta', p.receta || '', { tipo: 'text', ayuda: 'Para combos: qué SKUs lo componen. El costo en USD es la suma de los componentes.' })}
    ${campo('Notas', 'notas', p.notas || '', { tipo: 'text' })}`;

  const pan = panel('Editar producto', cuerpo, async (cont) => {
    const datos = leerCampos(cont);
    await persistir('Productos', [{ sku, ...datos }]);
    notificar('Producto guardado. Rentabilidades recalculadas.');
    refrescar();
  });

  const nota = pan.querySelector('#calc-vol');
  const pintar = () => {
    const d = leerCampos(pan.querySelector('.panel__cuerpo'));
    const v = pesoVolumetrico(d.alto, d.ancho, d.largo, cfg.divisorVolumetrico);
    const real = Number(d.peso_real) || 0;
    nota.innerHTML = v === null
      ? 'Completá las tres medidas para calcular el peso volumétrico.'
      : `Peso volumétrico ${kilos(v)}. Se factura por ${kilos(Math.max(v, real))}, que es el mayor entre real y volumétrico.`;
  };
  pan.querySelectorAll('[name="alto"],[name="ancho"],[name="largo"],[name="peso_real"]')
    .forEach((el) => el.addEventListener('input', pintar));
  pintar();
};

const editarCanales = (sku, refrescar) => {
  const { productoMarketplace, marketplaces, productos, cfg } = obtener();
  const prod = productos.find((x) => x.sku === sku);
  const propias = marketplaces.map((mp) => ({
    mp, fila: productoMarketplace.find((x) => x.sku === sku && x.marketplace_id === mp.id),
  })).filter((x) => x.fila);

  const cuerpo = `
    <p class="panel__intro">${escapar(prod?.descripcion || sku)} · configuración por canal</p>
    ${propias.map(({ mp, fila }) => {
    const esML = mp.id === 'ML';
    return `<fieldset class="grupo" data-mp="${escapar(mp.id)}">
        <legend>${escapar(mp.nombre)}</legend>
        <div class="grilla-2">
          ${campo('Comisión', `${mp.id}__comision_pct`, fila.comision_pct, { paso: '0.0001', sufijo: mp.comision_iva_mode === 'incluido' ? 'IVA incluido' : '+ IVA' })}
          ${campo('Publicidad', `${mp.id}__publicidad_pct`, fila.publicidad_pct, { paso: '0.001' })}
          ${campo('Gastos varios', `${mp.id}__varios_pct`, fila.varios_pct, { paso: '0.001' })}
          ${campo('SKU en el canal', `${mp.id}__sku_externo`, fila.sku_externo || '', { tipo: 'text' })}
        </div>
        ${esML ? `
          ${campo('Peso volumétrico cargado en ML', `${mp.id}__peso_volumetrico_manual`, fila.peso_volumetrico_manual, { paso: '0.001', sufijo: 'kg', ayuda: 'ML factura por el valor que cargamos en la publicación, no por las medidas. Si está en cero, se calcula desde las medidas de abajo.' })}
          ${campo('Modalidad de envío', `${mp.id}__modalidad_envio`, fila.modalidad_envio || 'ME', {
      opcionesSelect: [{ valor: 'ME', texto: 'Logística de ML' }, { valor: 'ME1', texto: 'ME1 · envío propio' }],
    })}
          ${campo('Importe del envío ME1', `${mp.id}__envio_me1_manual_c_iva`, fila.envio_me1_manual_c_iva, { paso: '1', sufijo: 'con IVA', ayuda: 'Sólo si la modalidad es ME1. Cargalo con IVA: el sistema lo netea.' })}
        ` : ''}
        <div class="grilla-4">
          ${campo('Peso', `${mp.id}__peso_real`, fila.peso_real, { paso: '0.01', sufijo: 'kg' })}
          ${campo('Alto', `${mp.id}__alto`, fila.alto, { paso: '0.1', sufijo: 'cm' })}
          ${campo('Ancho', `${mp.id}__ancho`, fila.ancho, { paso: '0.1', sufijo: 'cm' })}
          ${campo('Largo', `${mp.id}__largo`, fila.largo, { paso: '0.1', sufijo: 'cm' })}
        </div>
        ${fila.notas ? `<p class="campo__ayuda campo__ayuda--marcada">${escapar(fila.notas)}</p>` : ''}
      </fieldset>`;
  }).join('')}
    <p class="campo__ayuda">Las medidas de cada canal son independientes. El peso volumétrico de MercadoLibre nunca se reutiliza en los demás.</p>`;

  panel('Configuración por canal', cuerpo, async (cont) => {
    const datos = leerCampos(cont);
    const filas = {};
    Object.entries(datos).forEach(([k, v]) => {
      const [mpId, campoNombre] = k.split('__');
      if (!campoNombre) return;
      (filas[mpId] ||= { sku, marketplace_id: mpId })[campoNombre] = v;
    });
    await persistir('ProductoMarketplace', Object.values(filas));
    notificar('Configuración guardada. Rentabilidades recalculadas.');
    refrescar();
  });
};
