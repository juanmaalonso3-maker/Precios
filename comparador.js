/**
 * Comparador general — el mismo producto en todos los canales, a la vez.
 *
 * La regla que resuelve el problema original: NUNCA se comparan modalidades
 * distintas. Se elige una modalidad y se ven sólo los precios de esa modalidad.
 * Un canal que no la ofrece aparece vacío, no comparado contra otra cosa.
 *
 * El modo "equivalente contado" existe para el otro lado del problema: cuando
 * hace falta saber si el precio de vidriera de un canal está desalineado, se
 * lleva todo a base contado dividiendo por el recargo de su modalidad.
 */

import { obtener, simular, modalidades } from '../../data/store.js';
import { pesos, pesosFirmado, porcentaje, barraMargen, etiquetaModalidad, chipMarketplace, escapar } from '../format.js';
import { tabla, activarOrden, buscador, selector, aviso, descargarCsv, notificar } from '../componentes.js';
import { precioEquivalenteContado } from '../../core/engine.js';

const orden = {};
const filtro = { texto: '', modalidad: 'CONTADO', vista: 'modalidad' };

export const titulo = 'Comparador de canales';

/** Una fila por SKU, una columna por canal. */
const armarFilas = () => {
  const { productos, publicaciones, marketplaces, cfg } = obtener();
  const activos = marketplaces.filter((m) => m.activo === true || m.activo === 'true');

  return productos
    .filter((p) => p.estado !== 'INACTIVO')
    .map((prod) => {
      const fila = { sku: prod.sku, descripcion: prod.descripcion, marca: prod.marca, canales: {} };
      activos.forEach((mp) => {
        const contado = publicaciones.find((x) => x.sku === prod.sku && x.marketplace_id === mp.id && x.modalidad === 'CONTADO');
        if (!contado) return;

        if (filtro.vista === 'equivalente') {
          // Se toma cada publicación real y se la lleva a base contado.
          const propias = publicaciones.filter((x) => x.sku === prod.sku && x.marketplace_id === mp.id);
          const ref = propias[0];
          const eq = precioEquivalenteContado({ pvpConIva: ref.pvp_c_iva, cfg, marketplaceId: mp.id, modalidad: ref.modalidad });
          const r = simular({ sku: prod.sku, marketplaceId: mp.id, modalidad: ref.modalidad, pvpConIva: ref.pvp_c_iva });
          if (r) fila.canales[mp.id] = { ...r, precioMostrado: eq, modalidadReal: ref.modalidad };
          return;
        }

        const modalidad = filtro.modalidad;
        const soportadas = modalidades(mp.id).map(String);
        if (!soportadas.includes(String(modalidad))) return;

        const pub = publicaciones.find((x) => x.sku === prod.sku && x.marketplace_id === mp.id && String(x.modalidad) === String(modalidad));
        const variantes = mp.soporta_variantes_cuotas === true || mp.soporta_variantes_cuotas === 'true';
        // Si el canal usa precio único, se proyecta la modalidad sobre ese precio.
        if (!pub && variantes && modalidad !== 'CONTADO') return;

        const precio = pub ? pub.pvp_c_iva : contado.pvp_c_iva;
        const r = simular({ sku: prod.sku, marketplaceId: mp.id, modalidad, pvpConIva: precio });
        if (r) fila.canales[mp.id] = { ...r, precioMostrado: precio, proyectada: !pub };
      });
      return fila;
    })
    .filter((f) => Object.keys(f.canales).length > 0);
};

const columnas = () => {
  const { marketplaces } = obtener();
  const activos = marketplaces.filter((m) => m.activo === true || m.activo === 'true');
  const cols = [
    { clave: 'sku', titulo: 'SKU', mono: true, ancho: '74px' },
    { clave: 'descripcion', titulo: 'Producto', render: (f) => escapar(f.descripcion || '') },
  ];
  activos.forEach((mp) => {
    cols.push({
      clave: `mp_${mp.id}`,
      titulo: mp.nombre,
      ancho: '190px',
      valor: (f) => f.canales[mp.id]?.margenSobreFacturacionNeta ?? null,
      render: (f) => {
        const c = f.canales[mp.id];
        if (!c) return '<span class="celda-sin-dato" title="Este canal no ofrece esta modalidad">no aplica</span>';
        return `<div class="celda-canal">
          <div class="celda-canal__precio mono">${pesos(c.precioMostrado)}${c.proyectada ? '<span class="asterisco" title="Modalidad proyectada sobre el precio único del canal">*</span>' : ''}</div>
          ${barraMargen(c.margenSobreFacturacionNeta)}
          <div class="celda-canal__utilidad mono ${c.negativo ? 'cifra-perdida' : ''}">${pesosFirmado(c.utilidad)}</div>
        </div>`;
      },
    });
  });
  cols.push({
    clave: 'mejor',
    titulo: 'Mejor canal',
    ancho: '120px',
    valor: (f) => Math.max(...Object.values(f.canales).map((c) => c.margenSobreFacturacionNeta ?? -9)),
    render: (f) => {
      const pares = Object.entries(f.canales);
      if (!pares.length) return '—';
      const [id, c] = pares.reduce((a, b) => ((a[1].margenSobreFacturacionNeta ?? -9) > (b[1].margenSobreFacturacionNeta ?? -9) ? a : b));
      return `${chipMarketplace(id)} <span class="mono tenue">${porcentaje(c.margenSobreFacturacionNeta)}</span>`;
    },
  });
  return cols;
};

export const render = () => {
  let filas = armarFilas();
  if (filtro.texto) {
    const t = filtro.texto.toLowerCase();
    filas = filas.filter((f) => String(f.sku).includes(t) || String(f.descripcion || '').toLowerCase().includes(t));
  }

  const todasModalidades = [...new Set(obtener().marketplaces.flatMap((m) => modalidades(m.id).map(String)))]
    .sort((a, b) => (a === 'CONTADO' ? -1 : b === 'CONTADO' ? 1 : Number(a) - Number(b)));

  return `
    <div class="barra-herramientas">
      ${buscador(filtro.texto)}
      ${selector('vista', [
        { valor: 'modalidad', texto: 'Comparar por modalidad' },
        { valor: 'equivalente', texto: 'Comparar en equivalente contado' },
      ], filtro.vista)}
      ${filtro.vista === 'modalidad'
    ? selector('modalidad', todasModalidades.map((m) => ({ valor: m, texto: etiquetaModalidad(m) })), filtro.modalidad)
    : ''}
      <button class="btn btn--fantasma" id="exportar">Descargar CSV</button>
    </div>

    ${filtro.vista === 'modalidad'
    ? aviso(`Comparando <b>${escapar(etiquetaModalidad(filtro.modalidad))}</b> contra <b>${escapar(etiquetaModalidad(filtro.modalidad))}</b>. Los canales que no ofrecen esta modalidad quedan en blanco: nunca se cruzan condiciones comerciales distintas.`)
    : aviso('Cada precio se divide por el recargo de su modalidad para llevarlo a base contado. Sirve para detectar precios de vidriera desalineados entre canales.')}

    ${tabla(columnas(), filas, {
      id: 'comp',
      ...(orden.comp || { ordenPor: 'sku', ordenAsc: true }),
      vacio: 'Ningún producto tiene publicaciones en esta modalidad.',
    })}

    <p class="pie-nota">El asterisco marca una modalidad proyectada: el canal tiene un precio único y el margen se calcula sobre ese precio con el costo financiero del plazo elegido.</p>`;
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

  const vista = contenedor.querySelector('#vista');
  if (vista) vista.addEventListener('change', (e) => { filtro.vista = e.target.value; refrescar(); });

  const mod = contenedor.querySelector('#modalidad');
  if (mod) mod.addEventListener('change', (e) => { filtro.modalidad = e.target.value; refrescar(); });

  const exp = contenedor.querySelector('#exportar');
  if (exp) exp.addEventListener('click', () => {
    const { marketplaces } = obtener();
    const activos = marketplaces.filter((m) => m.activo === true || m.activo === 'true');
    const filas = armarFilas();
    const cab = ['SKU', 'Producto', ...activos.flatMap((m) => [`${m.id} precio`, `${m.id} margen %`, `${m.id} utilidad`])];
    descargarCsv(`comparador-${filtro.vista}-${filtro.modalidad}.csv`, cab,
      filas.map((f) => [f.sku, f.descripcion, ...activos.flatMap((m) => {
        const c = f.canales[m.id];
        return c
          ? [Math.round(c.precioMostrado), (c.margenSobreFacturacionNeta * 100).toFixed(2), Math.round(c.utilidad)]
          : ['', '', ''];
      })]));
    notificar('CSV descargado.');
  });
};
