/**
 * Logs — auditoría de cambios.
 *
 * Se registran cambios de datos y de configuración, altas, bajas y errores. Los
 * cálculos no se registran: con ~1.200 evaluaciones por recálculo la hoja se
 * llenaría en días sin aportar nada, y el margen de cualquier momento se puede
 * reconstruir desde el precio y los parámetros vigentes.
 */

import { traerLogs, urlLogsCsv, USAR_DATOS_LOCALES } from '../../data/api.js';
import { escapar } from '../format.js';
import { tabla, activarOrden, buscador, selector, aviso, notificar, descargarCsv } from '../componentes.js';

const orden = {};
const filtro = { texto: '', tipo: 'TODOS' };
let cache = null;
let cargando = false;

export const titulo = 'Auditoría';

const fecha = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v ?? '') : d.toLocaleString('es-AR');
};

const columnas = () => [
  { clave: 'timestamp', titulo: 'Fecha y hora', mono: true, ancho: '160px', render: (f) => escapar(fecha(f.timestamp)), valor: (f) => new Date(f.timestamp).getTime() },
  { clave: 'tipo', titulo: 'Tipo', ancho: '110px', render: (f) => `<span class="chip${f.tipo === 'ERROR' ? ' chip--alerta' : ''}">${escapar(f.tipo)}</span>` },
  { clave: 'entidad', titulo: 'Dónde', ancho: '150px' },
  { clave: 'entidad_id', titulo: 'Registro', mono: true, ancho: '150px' },
  { clave: 'campo', titulo: 'Campo', mono: true, ancho: '130px' },
  { clave: 'valor_anterior', titulo: 'Antes', alinear: 'der', mono: true, ancho: '110px', render: (f) => escapar(String(f.valor_anterior ?? '')) },
  { clave: 'valor_nuevo', titulo: 'Después', alinear: 'der', mono: true, ancho: '110px', render: (f) => escapar(String(f.valor_nuevo ?? '')) },
  { clave: 'detalle', titulo: 'Detalle', render: (f) => escapar(f.detalle || '') },
  { clave: 'origen', titulo: 'Origen', ancho: '80px' },
];

export const render = () => {
  if (USAR_DATOS_LOCALES) {
    return aviso('La auditoría se lee del Apps Script. Estás en modo datos locales, así que todavía no hay nada que mostrar. Desplegá el backend y poné <code>USAR_DATOS_LOCALES</code> en <code>false</code> en <code>src/data/api.js</code>.', 'info');
  }
  if (cargando) return '<div class="vacio">Trayendo el registro…</div>';
  if (cache === null) return '<div class="vacio">Trayendo el registro…</div>';

  let filas = cache;
  if (filtro.tipo !== 'TODOS') filas = filas.filter((f) => f.tipo === filtro.tipo);
  if (filtro.texto) {
    const t = filtro.texto.toLowerCase();
    filas = filas.filter((f) => Object.values(f).some((v) => String(v ?? '').toLowerCase().includes(t)));
  }

  const tipos = [...new Set(cache.map((f) => f.tipo).filter(Boolean))].sort();

  return `
    <div class="barra-herramientas">
      ${buscador(filtro.texto, 'Buscar en el registro')}
      ${selector('tipo', [{ valor: 'TODOS', texto: 'Todos los tipos' }, ...tipos.map((t) => ({ valor: t, texto: t }))], filtro.tipo)}
      <button class="btn btn--fantasma" id="recargar">Actualizar</button>
      <button class="btn btn--fantasma" id="exportar">Descargar CSV</button>
      <a class="btn btn--fantasma" href="${urlLogsCsv()}" target="_blank" rel="noopener">CSV completo del servidor</a>
    </div>
    ${tabla(columnas(), filas, {
      id: 'logs',
      ...(orden.logs || { ordenPor: 'timestamp', ordenAsc: false }),
      vacio: 'No hay eventos registrados con estos filtros.',
    })}
    <p class="pie-nota">${filas.length} de ${cache.length} eventos.</p>`;
};

export const activar = async (contenedor, refrescar) => {
  if (USAR_DATOS_LOCALES) return;

  if (cache === null && !cargando) {
    cargando = true;
    try {
      cache = await traerLogs();
    } catch (err) {
      cache = [];
      notificar(`No se pudo leer la auditoría: ${err.message}`, 'error');
    }
    cargando = false;
    refrescar();
    return;
  }

  activarOrden(contenedor, orden, refrescar);

  const busc = contenedor.querySelector('#buscador');
  if (busc) busc.addEventListener('input', (e) => {
    filtro.texto = e.target.value;
    refrescar();
    const n = document.querySelector('#buscador');
    if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  });

  const tipo = contenedor.querySelector('#tipo');
  if (tipo) tipo.addEventListener('change', (e) => { filtro.tipo = e.target.value; refrescar(); });

  const rec = contenedor.querySelector('#recargar');
  if (rec) rec.addEventListener('click', async () => {
    cache = null;
    refrescar();
  });

  const exp = contenedor.querySelector('#exportar');
  if (exp) exp.addEventListener('click', () => {
    descargarCsv('auditoria.csv',
      ['Fecha', 'Tipo', 'Donde', 'Registro', 'Campo', 'Antes', 'Despues', 'Detalle', 'Origen'],
      (cache || []).map((f) => [fecha(f.timestamp), f.tipo, f.entidad, f.entidad_id, f.campo,
        f.valor_anterior, f.valor_nuevo, f.detalle, f.origen]));
    notificar('CSV descargado.');
  });
};
