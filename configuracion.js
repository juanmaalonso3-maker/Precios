/**
 * Configuración — toda la lógica del sistema es editable desde acá.
 *
 * No hay un solo valor de negocio escrito en el código: comisiones, umbrales,
 * costos financieros, markups, IIBB, tipo de cambio y las cinco tablas de
 * tarifas viven en el Sheets y se editan en esta pantalla.
 */

import { obtener, persistir } from '../../data/store.js';
import { pesos, porcentaje, kilos, escapar } from '../format.js';
import { tabla, activarOrden, selector, panel, campo, leerCampos, notificar, aviso, descargarCsv } from '../componentes.js';

const orden = {};
const estadoUi = { tablaTarifa: 'ML_ENVIO' };

export const titulo = 'Configuración';

const ETIQUETAS_TARIFA = {
  ML_ENVIO: 'MercadoLibre · envío que absorbemos (PVP ≥ umbral)',
  ML_COMISION_FIJA: 'MercadoLibre · cargo fijo por venta (PVP < umbral)',
  FRAVEGA_FEE: 'Frávega · fee logístico',
  ONCITY_FEE: 'OnCity · fee logístico',
  VIACOMPRAS_FEE: 'ViaCompras · fee logístico',
  BNA_FEE: 'Tienda BNA · fee logístico',
};

export const render = () => {
  const { raw, cfg, marketplaces, tarifas } = obtener();

  const colsGlobal = [
    { clave: 'clave', titulo: 'Parámetro', mono: true, ancho: '210px' },
    {
      clave: 'valor', titulo: 'Valor', alinear: 'der', mono: true, ancho: '120px',
      render: (f) => (String(f.tipo) === 'porcentaje' ? porcentaje(Number(f.valor), 2) : pesos(Number(f.valor))),
      valor: (f) => Number(f.valor),
    },
    { clave: 'marketplace_id', titulo: 'Canal', ancho: '90px', render: (f) => escapar(f.marketplace_id || '—') },
    { clave: 'descripcion', titulo: 'Qué hace', render: (f) => escapar(f.descripcion || '') },
    { clave: 'acciones', titulo: '', ancho: '80px', render: (f) => `<button class="btn btn--mini" data-cfg="${escapar(f.clave)}">Editar</button>` },
  ];

  const colsFin = [
    { clave: 'marketplace_id', titulo: 'Canal', ancho: '110px' },
    { clave: 'cuotas', titulo: 'Cuotas', alinear: 'der', mono: true, ancho: '80px', valor: (f) => Number(f.cuotas) },
    {
      clave: 'costo_real', titulo: 'Costo del canal', alinear: 'der', mono: true, ancho: '120px',
      render: (f) => (Number(f.costo_real) ? porcentaje(Number(f.costo_real), 2) : '<span class="cifra-perdida">falta</span>'),
      valor: (f) => Number(f.costo_real),
    },
    { clave: 'markup', titulo: 'Markup propio', alinear: 'der', mono: true, ancho: '120px', render: (f) => porcentaje(Number(f.markup), 2), valor: (f) => Number(f.markup) },
    {
      clave: 'recargo', titulo: 'Recargo total', alinear: 'der', mono: true, ancho: '120px',
      render: (f) => porcentaje(Number(f.costo_real) + Number(f.markup), 2),
      valor: (f) => Number(f.costo_real) + Number(f.markup),
      ayuda: 'Lo que se suma al precio de contado para esta modalidad',
    },
    { clave: 'notas', titulo: 'Nota', render: (f) => escapar(f.notas || '') },
    { clave: 'acciones', titulo: '', ancho: '80px', render: (f) => `<button class="btn btn--mini" data-fin="${escapar(f.marketplace_id)}|${escapar(f.cuotas)}">Editar</button>` },
  ];

  const colsMp = [
    { clave: 'id', titulo: 'ID', mono: true, ancho: '92px' },
    { clave: 'nombre', titulo: 'Canal', ancho: '130px' },
    { clave: 'activo', titulo: 'Activo', ancho: '80px', render: (f) => `<span class="chip${f.activo === true || f.activo === 'true' ? '' : ' chip--apagado'}">${f.activo === true || f.activo === 'true' ? 'sí' : 'no'}</span>` },
    { clave: 'comision_pct_default', titulo: 'Comisión base', alinear: 'der', mono: true, ancho: '110px', render: (f) => porcentaje(Number(f.comision_pct_default), 2) },
    {
      clave: 'comision_iva_mode', titulo: 'IVA de la comisión', ancho: '150px',
      render: (f) => `<span class="chip" title="${f.comision_iva_mode === 'incluido' ? 'La tasa publicada ya contiene IVA' : 'La tasa se aplica y después se le suma IVA'}">${f.comision_iva_mode === 'incluido' ? 'por dentro' : 'por fuera'}</span>`,
    },
    { clave: 'umbral_envio', titulo: 'Umbral de envío', alinear: 'der', mono: true, ancho: '120px', render: (f) => (Number(f.umbral_envio) ? pesos(Number(f.umbral_envio)) : '—') },
    { clave: 'notas', titulo: 'Cómo funciona', render: (f) => escapar(f.notas || '') },
  ];

  const filasTarifa = (tarifas[estadoUi.tablaTarifa] || []).slice()
    .sort((a, b) => a.peso_max - b.peso_max || a.precio_min - b.precio_min);
  const colsTarifa = [
    { clave: 'peso', titulo: 'Escalón de peso', mono: true, ancho: '170px', render: (f) => `más de ${kilos(f.peso_min)} hasta ${f.peso_max >= 1e12 ? '∞' : kilos(f.peso_max)}`, valor: (f) => f.peso_max },
    { clave: 'precio', titulo: 'Tramo de precio', mono: true, ancho: '200px', render: (f) => (f.precio_max >= 1e12 ? `desde ${pesos(f.precio_min)}` : `${pesos(f.precio_min)} a ${pesos(f.precio_max - 1)}`), valor: (f) => f.precio_min },
    { clave: 'valor_c_iva', titulo: 'Tarifa c/IVA', alinear: 'der', mono: true, ancho: '120px', render: (f) => pesos(f.valor_c_iva) },
    { clave: 'neto', titulo: 'Neto', alinear: 'der', mono: true, ancho: '120px', render: (f) => pesos(f.valor_c_iva / (1 + cfg.iva)), valor: (f) => f.valor_c_iva },
    { clave: 'vigencia_desde', titulo: 'Vigente desde', mono: true, ancho: '120px' },
  ];

  const opcTablas = Object.keys(ETIQUETAS_TARIFA)
    .filter((k) => (tarifas[k] || []).length)
    .map((k) => ({ valor: k, texto: ETIQUETAS_TARIFA[k] }));

  return `
    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Parámetros globales</h2>
        <p>Se aplican a todo el catálogo. Cambiar el tipo de cambio recalcula el costo de los 40 productos.</p>
      </header>
      ${tabla(colsGlobal, raw.Config || [], { id: 'cfg', ...(orden.cfg || { ordenPor: 'clave', ordenAsc: true }) })}
    </section>

    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Canales</h2>
        <p>Cómo trata el IVA cada canal es lo que hace que la misma tasa nominal cueste distinto. Con IVA por dentro, 15% sobre $100 cuesta $12,40; con IVA por fuera, cuesta $15,00.</p>
      </header>
      ${tabla(colsMp, marketplaces, { id: 'mps', ...(orden.mps || { ordenPor: 'id', ordenAsc: true }) })}
    </section>

    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Financiación en cuotas</h2>
        <p>El costo del canal es lo que cobra el marketplace; el markup es nuestro margen adicional. El precio de cada modalidad se calcula siempre desde el contado, nunca desde la modalidad anterior.</p>
      </header>
      ${aviso('El costo financiero se cobra sobre el precio ya recargado, así que un markup plano deja menos margen a medida que se estira el plazo. Si el margen a 12 o 18 cuotas queda por debajo del de contado, hay que subir el markup de esos plazos.')}
      ${tabla(colsFin, raw.Financiacion || [], { id: 'fin', ...(orden.fin || { ordenPor: 'marketplace_id', ordenAsc: true }) })}
    </section>

    <section class="bloque">
      <header class="bloque__cabecera">
        <h2>Tablas de tarifas</h2>
        <p>Cada fila es un escalón de peso cruzado con un tramo de precio. Agregar un escalón es agregar una fila en el Sheets: no hay que tocar nada del código.</p>
      </header>
      <div class="barra-herramientas">
        ${selector('tabla-tarifa', opcTablas, estadoUi.tablaTarifa)}
        <button class="btn btn--fantasma" id="exportar-tarifas">Descargar CSV</button>
      </div>
      ${tabla(colsTarifa, filasTarifa, { id: 'tar', ...(orden.tar || { ordenPor: 'peso', ordenAsc: true }) })}
    </section>

    <p class="pie-nota">
      Convención de escalones: el mínimo es excluyente y el máximo incluyente. Un bulto de 5,0 kg entra en el
      escalón "1 a 5 kg"; uno de 5,1 kg pasa al siguiente. Los tramos de precio van al revés, como los publican
      los canales: "$33.000 a $49.999" incluye el mínimo y excluye el máximo.
    </p>`;
};

export const activar = (contenedor, refrescar) => {
  activarOrden(contenedor, orden, refrescar);

  const sel = contenedor.querySelector('#tabla-tarifa');
  if (sel) sel.addEventListener('change', (e) => { estadoUi.tablaTarifa = e.target.value; refrescar(); });

  const exp = contenedor.querySelector('#exportar-tarifas');
  if (exp) exp.addEventListener('click', () => {
    const { tarifas } = obtener();
    descargarCsv(`tarifas-${estadoUi.tablaTarifa.toLowerCase()}.csv`,
      ['Peso min', 'Peso max', 'Precio min', 'Precio max', 'Tarifa c/IVA', 'Vigente desde'],
      (tarifas[estadoUi.tablaTarifa] || []).map((t) => [t.peso_min, t.peso_max, t.precio_min,
        t.precio_max >= 1e12 ? '' : t.precio_max, t.valor_c_iva, t.vigencia_desde]));
    notificar('CSV descargado.');
  });

  contenedor.querySelectorAll('[data-cfg]').forEach((b) =>
    b.addEventListener('click', () => editarParametro(b.dataset.cfg, refrescar)));
  contenedor.querySelectorAll('[data-fin]').forEach((b) =>
    b.addEventListener('click', () => editarFinanciacion(b.dataset.fin, refrescar)));
};

const editarParametro = (clave, refrescar) => {
  const fila = (obtener().raw.Config || []).find((c) => c.clave === clave);
  if (!fila) return;
  const esPct = String(fila.tipo) === 'porcentaje';

  panel('Editar parámetro', `
    <p class="panel__intro">${escapar(clave)}</p>
    <p class="campo__ayuda campo__ayuda--marcada">${escapar(fila.descripcion || '')}</p>
    ${campo(esPct ? 'Valor (como fracción)' : 'Valor', 'valor', fila.valor, {
    paso: esPct ? '0.0001' : '1',
    sufijo: esPct ? `hoy ${porcentaje(Number(fila.valor), 2)}` : '',
    ayuda: esPct ? 'Se escribe como fracción: 0,04 equivale a 4%.' : '',
  })}
  `, async (cont) => {
    const datos = leerCampos(cont);
    await persistir('Config', [{ clave, valor: datos.valor }]);
    notificar('Parámetro guardado. Todo el catálogo recalculado.');
    refrescar();
  });
};

const editarFinanciacion = (id, refrescar) => {
  const [mp, cuotas] = id.split('|');
  const fila = (obtener().raw.Financiacion || [])
    .find((f) => String(f.marketplace_id) === mp && String(f.cuotas) === cuotas);
  if (!fila) return;

  panel(`Financiación · ${mp} · ${cuotas} cuotas`, `
    ${campo('Costo del canal', 'costo_real', fila.costo_real, { paso: '0.0001', sufijo: 'fracción', ayuda: 'Lo que cobra el marketplace por financiar. 0,232 equivale a 23,2%.' })}
    ${campo('Markup propio', 'markup', fila.markup, { paso: '0.0001', sufijo: 'fracción', ayuda: 'Nuestro margen adicional por encima del costo del canal.' })}
    ${campo('Nota', 'notas', fila.notas || '', { tipo: 'text' })}
  `, async (cont) => {
    const datos = leerCampos(cont);
    await persistir('Financiacion', [{ marketplace_id: mp, cuotas: Number(cuotas), ...datos }]);
    notificar('Financiación guardada.');
    refrescar();
  });
};
