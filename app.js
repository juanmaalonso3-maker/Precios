/**
 * app.js — arranque y navegación.
 *
 * Router por hash, sin dependencias. Cada vista expone render() y activar():
 * render devuelve HTML y activar conecta los eventos. Volver a renderizar es
 * regenerar el HTML y reconectar, que a esta escala es instantáneo y elimina
 * toda una clase de errores de estado desincronizado.
 */

import { cargar, obtener, suscribir } from '../data/store.js';
import { USAR_DATOS_LOCALES } from '../data/api.js';
import { escapar, pesos, porcentaje } from './format.js';
import { notificar } from './componentes.js';

import * as dashboard from './views/dashboard.js';
import * as rentabilidad from './views/rentabilidad.js';
import * as comparador from './views/comparador.js';
import * as productos from './views/productos.js';
import * as configuracion from './views/configuracion.js';
import * as logs from './views/logs.js';

const VISTAS = {
  panel: dashboard,
  rentabilidad,
  comparador,
  productos,
  configuracion,
  auditoria: logs,
};

let rutaActual = 'panel';

const nombreVista = (vista) => (typeof vista.titulo === 'function' ? vista.titulo() : vista.titulo);

const pintarNavegacion = () => {
  const { marketplaces } = obtener();
  const activos = marketplaces.filter((m) => m.activo === true || m.activo === 'true');
  const item = (ruta, texto, extra = '') =>
    `<a href="#${ruta}" class="nav__item${rutaActual === ruta ? ' nav__item--activo' : ''}">${escapar(texto)}${extra}</a>`;

  document.getElementById('nav').innerHTML = `
    <div class="nav__grupo">
      ${item('panel', 'Panel general')}
      ${item('comparador', 'Comparador')}
    </div>
    <div class="nav__grupo">
      <span class="nav__titulo">Rentabilidad por canal</span>
      ${activos.map((m) => {
    const ruta = `rentabilidad/${m.id}`;
    const enPerdida = obtener().resultados.filter((r) => r.marketplaceId === m.id && r.negativo).length;
    return `<a href="#${ruta}" class="nav__item${rutaActual === ruta ? ' nav__item--activo' : ''}">
        ${escapar(m.nombre)}${enPerdida ? `<span class="nav__marca" title="${enPerdida} en pérdida">${enPerdida}</span>` : ''}
      </a>`;
  }).join('')}
    </div>
    <div class="nav__grupo">
      <span class="nav__titulo">Administración</span>
      ${item('productos', 'Base maestra')}
      ${item('configuracion', 'Configuración')}
      ${item('auditoria', 'Auditoría')}
    </div>`;
};

const pintarEncabezado = (vista) => {
  const { cfg, fuente, horaCarga } = obtener();
  document.getElementById('titulo-vista').textContent = nombreVista(vista);
  document.getElementById('estado-datos').innerHTML = `
    <span class="estado__dato" title="Tipo de cambio aplicado a todo el catálogo">TC ${pesos(cfg.tc)}</span>
    <span class="estado__dato">IVA ${porcentaje(cfg.iva, 0)}</span>
    <span class="estado__dato">IIBB ${porcentaje(cfg.iibbPct, 0)}</span>
    <span class="estado__fuente estado__fuente--${fuente}">
      ${fuente === 'local' ? 'datos de ejemplo' : 'conectado'}
      <em>${horaCarga ? horaCarga.toLocaleTimeString('es-AR') : ''}</em>
    </span>`;
};

const pintar = () => {
  const [base, param] = rutaActual.split('/');
  const vista = VISTAS[base] || VISTAS.panel;
  if (base === 'rentabilidad' && param) rentabilidad.fijarMarketplace(param);

  const contenedor = document.getElementById('vista');
  pintarEncabezado(vista);
  pintarNavegacion();
  contenedor.innerHTML = vista.render();
  contenedor.scrollTop = 0;
  if (vista.activar) vista.activar(contenedor, pintar);
};

const irA = () => {
  const hash = location.hash.replace(/^#/, '') || 'panel';
  const base = hash.split('/')[0];
  rutaActual = VISTAS[base] ? hash : 'panel';
  pintar();
};

const mostrarError = (mensaje) => {
  const caja = document.getElementById('cargando');
  if (!caja) return;
  caja.innerHTML = `
    <div class="arranque__error">
      <h1>No se pudieron cargar los datos</h1>
      <p>${escapar(mensaje)}</p>
      <ol>
        <li>Verificá que <code>bootstrap()</code> se haya ejecutado en el Apps Script.</li>
        <li>Revisá que la implementación esté en <b>Ejecutar como: Yo</b> y <b>Acceso: Cualquier persona</b>.</li>
        <li>Confirmá la URL <code>/exec</code> en <code>src/data/api.js</code>.</li>
      </ol>
      <p>Mientras tanto podés poner <code>USAR_DATOS_LOCALES = true</code> en
      <code>src/data/api.js</code> para ver la aplicación con datos de ejemplo.</p>
    </div>`;
};

const arrancar = async () => {
  // Le avisa al diagnóstico de index.html que los módulos sí se ejecutaron, así
  // no pisa el mensaje de error con uno genérico.
  window.__appArranco = true;
  try {
    await cargar();
    const caja = document.getElementById('cargando');
    if (caja) caja.remove();
    document.getElementById('aplicacion').hidden = false;
    if (USAR_DATOS_LOCALES) {
      notificar('Modo datos de ejemplo: podés navegar todo, pero los cambios no se guardan.', 'aviso');
    }
    suscribir(() => {
      const marca = document.getElementById('nav');
      if (marca) pintarNavegacion();
    });
    window.addEventListener('hashchange', irA);
    irA();
  } catch (err) {
    mostrarError(err.message);
  }
};

arrancar();
