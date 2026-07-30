/**
 * componentes.js — piezas de interfaz compartidas.
 *
 * La tabla es la pieza más usada del sistema: cinco pantallas la reutilizan con
 * distintas columnas. Ordena en memoria, sin volver al servidor.
 */

import { escapar } from './format.js';

/**
 * Tabla ordenable.
 *
 * @param columnas [{ clave, titulo, alinear, ancho, render, valor, ayuda }]
 *   - render(fila) devuelve HTML; valor(fila) devuelve el valor de orden.
 */
export const tabla = (columnas, filas, opciones = {}) => {
  const { ordenPor = null, ordenAsc = false, id = 'tabla', vacio = 'No hay datos para mostrar.' } = opciones;

  if (!filas.length) {
    return `<div class="vacio">${escapar(vacio)}</div>`;
  }

  const ordenadas = [...filas];
  if (ordenPor) {
    const col = columnas.find((c) => c.clave === ordenPor);
    if (col) {
      const valor = col.valor || ((f) => f[col.clave]);
      ordenadas.sort((a, b) => {
        const va = valor(a); const vb = valor(b);
        if (va === null || va === undefined) return 1;
        if (vb === null || vb === undefined) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return ordenAsc ? va - vb : vb - va;
        return ordenAsc
          ? String(va).localeCompare(String(vb), 'es')
          : String(vb).localeCompare(String(va), 'es');
      });
    }
  }

  const encabezado = columnas.map((c) => {
    const activo = c.clave === ordenPor;
    const flecha = activo ? (ordenAsc ? ' ↑' : ' ↓') : '';
    const estilo = c.ancho ? ` style="width:${c.ancho}"` : '';
    return `<th class="${c.alinear === 'der' ? 'der' : ''}${activo ? ' activo' : ''}"${estilo}
      data-orden="${escapar(c.clave)}" data-tabla="${escapar(id)}"
      ${c.ayuda ? `title="${escapar(c.ayuda)}"` : ''}>${escapar(c.titulo)}${flecha}</th>`;
  }).join('');

  const cuerpo = ordenadas.map((f) => {
    const clases = [f._clase || ''].filter(Boolean).join(' ');
    const celdas = columnas.map((c) => {
      const contenido = c.render ? c.render(f) : escapar(f[c.clave] ?? '');
      return `<td class="${c.alinear === 'der' ? 'der' : ''}${c.mono ? ' mono' : ''}">${contenido}</td>`;
    }).join('');
    return `<tr class="${clases}">${celdas}</tr>`;
  }).join('');

  return `<div class="tabla-scroll"><table class="tabla">
    <thead><tr>${encabezado}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
};

/** Conecta el click en los encabezados. Se llama una vez por render de vista. */
export const activarOrden = (contenedor, estadoOrden, volverARenderizar) => {
  contenedor.querySelectorAll('th[data-orden]').forEach((th) => {
    th.addEventListener('click', () => {
      const clave = th.dataset.orden;
      const id = th.dataset.tabla;
      const actual = estadoOrden[id] || {};
      estadoOrden[id] = {
        ordenPor: clave,
        ordenAsc: actual.ordenPor === clave ? !actual.ordenAsc : false,
      };
      volverARenderizar();
    });
  });
};

/** Fila de indicadores del encabezado de cada pantalla. */
export const indicadores = (items) => `<div class="indicadores">${items.map((i) => `
  <div class="indicador${i.alerta ? ' indicador--alerta' : ''}">
    <span class="indicador__etiqueta">${escapar(i.etiqueta)}</span>
    <span class="indicador__valor">${i.valor}</span>
    ${i.pie ? `<span class="indicador__pie">${escapar(i.pie)}</span>` : ''}
  </div>`).join('')}</div>`;

export const buscador = (valor, marcador = 'Buscar por SKU o producto') =>
  `<input type="search" class="buscador" id="buscador" value="${escapar(valor)}"
    placeholder="${escapar(marcador)}" autocomplete="off">`;

export const selector = (id, opciones, valor, etiqueta) => `
  <label class="campo-inline">
    ${etiqueta ? `<span>${escapar(etiqueta)}</span>` : ''}
    <select id="${escapar(id)}">
      ${opciones.map((o) => `<option value="${escapar(o.valor)}"${String(o.valor) === String(valor) ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}
    </select>
  </label>`;

export const aviso = (texto, tipo = 'info') =>
  `<div class="nota nota--${tipo}">${texto}</div>`;

/** Mensaje flotante. Desaparece solo; los errores se quedan hasta que se cierran. */
export const notificar = (texto, tipo = 'ok') => {
  let cont = document.getElementById('notificaciones');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'notificaciones';
    document.body.appendChild(cont);
  }
  const el = document.createElement('div');
  el.className = `notificacion notificacion--${tipo}`;
  el.innerHTML = `<span>${escapar(texto)}</span><button aria-label="Cerrar">×</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  cont.appendChild(el);
  if (tipo !== 'error') setTimeout(() => el.remove(), 4000);
};

/** Panel lateral para editar un registro. */
export const panel = (titulo, contenidoHtml, alGuardar) => {
  const fondo = document.createElement('div');
  fondo.className = 'panel-fondo';
  fondo.innerHTML = `<aside class="panel" role="dialog" aria-label="${escapar(titulo)}">
    <header class="panel__cabecera">
      <h2>${escapar(titulo)}</h2>
      <button class="panel__cerrar" aria-label="Cerrar">×</button>
    </header>
    <div class="panel__cuerpo">${contenidoHtml}</div>
    <footer class="panel__pie">
      <button class="btn btn--fantasma" data-accion="cancelar">Cancelar</button>
      <button class="btn btn--primario" data-accion="guardar">Guardar cambios</button>
    </footer>
  </aside>`;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', escape); };
  const escape = (e) => { if (e.key === 'Escape') cerrar(); };
  fondo.querySelector('.panel__cerrar').addEventListener('click', cerrar);
  fondo.querySelector('[data-accion="cancelar"]').addEventListener('click', cerrar);
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  document.addEventListener('keydown', escape);
  fondo.querySelector('[data-accion="guardar"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Guardando…';
    try {
      await alGuardar(fondo.querySelector('.panel__cuerpo'));
      cerrar();
    } catch (err) {
      notificar(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Guardar cambios';
    }
  });
  document.body.appendChild(fondo);
  const primero = fondo.querySelector('input, select');
  if (primero) primero.focus();
  return fondo;
};

export const campo = (etiqueta, nombre, valor, opciones = {}) => {
  const { tipo = 'number', paso = 'any', ayuda = '', sufijo = '', opcionesSelect = null } = opciones;
  const control = opcionesSelect
    ? `<select name="${escapar(nombre)}">${opcionesSelect.map((o) =>
      `<option value="${escapar(o.valor)}"${String(o.valor) === String(valor) ? ' selected' : ''}>${escapar(o.texto)}</option>`).join('')}</select>`
    : `<input type="${tipo}" name="${escapar(nombre)}" value="${escapar(valor)}" step="${escapar(paso)}">`;
  return `<label class="campo">
    <span class="campo__etiqueta">${escapar(etiqueta)}${sufijo ? ` <em>${escapar(sufijo)}</em>` : ''}</span>
    ${control}
    ${ayuda ? `<span class="campo__ayuda">${escapar(ayuda)}</span>` : ''}
  </label>`;
};

export const leerCampos = (cuerpo) => {
  const datos = {};
  cuerpo.querySelectorAll('input[name], select[name]').forEach((el) => {
    datos[el.name] = el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
  });
  return datos;
};

/** Descarga un CSV generado en el navegador. */
export const descargarCsv = (nombre, encabezados, filas) => {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const texto = [encabezados.join(';'), ...filas.map((f) => f.map(esc).join(';'))].join('\n');
  const url = URL.createObjectURL(new Blob([`\uFEFF${texto}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
};
