/**
 * api.js — única puerta de salida hacia el backend.
 *
 * Ninguna vista habla con la red directamente: piden datos al store y el store
 * los pide acá. Así cambiar de backend es tocar este archivo y nada más.
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN — lo único que hay que editar en este archivo
// ═══════════════════════════════════════════════════════════════════════════

/** URL /exec del Apps Script. */
export const API_URL = 'https://script.google.com/macros/s/AKfycbyWYqPteCdnbToWm6U-7VvxSHABE8WeNzSUgSt3jYTEul1pLKvvqKni0A9Z-mfEH4KC/exec';

/** Debe coincidir con WRITE_TOKEN en Code.gs. Sólo se usa para escribir. */
export const WRITE_TOKEN = 'bitek-2026-cambiar-esto';

/**
 * Datos de ejemplo para poder ver la app funcionando antes de desplegar el
 * Apps Script. Es el mismo dataset que siembra bootstrap(). Una vez desplegado,
 * poner en false.
 */
export const USAR_DATOS_LOCALES = true;

// ═══════════════════════════════════════════════════════════════════════════

const RUTA_DEMO = './data/demo.json';

/**
 * Apps Script no responde el preflight de CORS, así que las escrituras van como
 * text/plain: es un "simple request" y el navegador no lo pide.
 */
const postear = async (cuerpo) => {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...cuerpo, token: WRITE_TOKEN }),
    redirect: 'follow',
  });
  const texto = await resp.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El backend respondió algo que no es JSON. Revisá que la implementación esté en "Ejecutar como: Yo" y "Acceso: Cualquier persona".');
  }
  if (!datos.ok) throw new Error(datos.error || 'El backend rechazó la operación.');
  return datos;
};

/** Trae el dataset completo. Una sola llamada al arrancar. */
export const traerTodo = async () => {
  if (USAR_DATOS_LOCALES) {
    const resp = await fetch(RUTA_DEMO);
    if (!resp.ok) throw new Error(`No se encontró ${RUTA_DEMO}. Si ya desplegaste el Apps Script, poné USAR_DATOS_LOCALES en false.`);
    return { data: await resp.json(), fuente: 'local' };
  }
  const resp = await fetch(`${API_URL}?action=getAll`, { redirect: 'follow' });
  const texto = await resp.text();
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new Error('El backend no devolvió JSON. Verificá la URL /exec y los permisos de la implementación.');
  }
  if (!datos.ok) throw new Error(datos.error || 'El backend devolvió un error.');
  return { data: datos.data, fuente: 'remoto' };
};

export const guardar = (tab, rows, origen = 'app') => {
  if (USAR_DATOS_LOCALES) {
    return Promise.reject(new Error('Estás en modo datos locales: los cambios no se guardan. Desplegá el Apps Script y poné USAR_DATOS_LOCALES en false.'));
  }
  return postear({ action: 'upsert', tab, rows, origen });
};

export const eliminar = (tab, keys, origen = 'app') => postear({ action: 'remove', tab, keys, origen });

export const registrar = (evento) => postear({ action: 'log', ...evento });

export const guardarSnapshot = (rows) => postear({ action: 'snapshot', rows });

export const urlLogsCsv = (desde, hasta) => {
  const p = new URLSearchParams({ action: 'exportLogs' });
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  return `${API_URL}?${p.toString()}`;
};

export const traerLogs = async () => {
  if (USAR_DATOS_LOCALES) return [];
  const resp = await fetch(`${API_URL}?action=getTab&tab=Logs`, { redirect: 'follow' });
  const datos = await resp.json();
  return datos.ok ? datos.rows : [];
};
