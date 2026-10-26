/* tema.js — gestor de modo (dark/light/sepia) y paleta. Módulo ES, sin dependencias.
 *
 * HTML mínimo:
 *   <html lang="es" data-modos="dark,light">          ← bitácora  (lector: data-modos="dark,light,sepia")
 *   <select id="sel-paleta"></select>                  ← se rellena solo
 *   <button data-modo="dark|light|sepia">…</button>    ← opcional, cualquier botón con data-modo
 *
 * Compatibilidad con el lector: si tu código ya hace  document.body.dataset.tema = 'oscuro'|'claro'|'sepia',
 * el observer lo detecta y sincroniza; y viceversa (se escribe body[data-tema]).
 */
import { PALETAS, PALETA_POR_DEFECTO, MODO_POR_DEFECTO } from './paletas.js';

const K_MODO = 'tema:modo', K_PALETA = 'tema:paleta';
const ES_A_EN = { oscuro: 'dark', claro: 'light', sepia: 'sepia' };
const EN_A_ES = { dark: 'oscuro', light: 'claro', sepia: 'sepia' };
const COLOR_BARRA = { dark: '#071310', light: '#ECF6F2', sepia: '#F1EED4' }; // fallback; se refina leyendo --t-bg

const raiz = document.documentElement;
const modosPermitidos = (raiz.dataset.modos || 'dark,light,sepia').split(',').map(s => s.trim());
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

let modo = store.get(K_MODO) || MODO_POR_DEFECTO;     // preferencia guardada (puede ser sepia aunque aquí no exista)
let paleta = store.get(K_PALETA) || PALETA_POR_DEFECTO;
if (!PALETAS.some(p => p.id === paleta)) paleta = PALETA_POR_DEFECTO;

const efectivo = m => (modosPermitidos.includes(m) ? m : 'light'); // sepia → claro si la página no lo ofrece

/* ---------- el DOM es la fuente de verdad del modo ---------- */
function leerModoDelDOM() {
  const m = raiz.dataset.theme || ES_A_EN[document.body?.dataset.tema];
  if (['dark', 'light', 'sepia'].includes(m)) modo = m;
}

/* ---------- aplicar al DOM ---------- */
function aplicar({ animar = true } = {}) {
  const m = efectivo(modo);
  if (animar) {                                   // transición suave solo al cambiar, nunca al cargar
    raiz.classList.add('tema-anima');
    clearTimeout(aplicar._t);
    aplicar._t = setTimeout(() => raiz.classList.remove('tema-anima'), 250);
  }
  raiz.dataset.theme = m;
  raiz.dataset.palette = paleta;
  if (document.body) document.body.dataset.tema = EN_A_ES[m];   // lector (sin disparar bucle: ver observer)

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(raiz).getPropertyValue('--t-bg').trim() || COLOR_BARRA[m];

  document.querySelectorAll('[data-modo]').forEach(b => {
    const on = b.dataset.modo === m;
    b.setAttribute('aria-pressed', on);
    b.hidden = !modosPermitidos.includes(b.dataset.modo);
  });
  pintarMuestras();
  document.dispatchEvent(new CustomEvent('tema:cambio', { detail: { modo: m, paleta } }));
}

/* ---------- API pública ---------- */
export function setModo(m) {
  m = ES_A_EN[m] || m;
  if (!['dark', 'light', 'sepia'].includes(m)) return;
  modo = m; store.set(K_MODO, m); aplicar();
}
export function setPaleta(id) {
  if (!PALETAS.some(p => p.id === id)) return;
  paleta = id; store.set(K_PALETA, id);
  const sel = document.getElementById('sel-paleta'); if (sel) sel.value = id;
  leerModoDelDOM();          // el modo actual manda: se lee del DOM, no de la variable interna
  aplicar();
}
export const getTema = () => ({ modo: efectivo(modo), paleta });

/* ---------- <select> + muestras ---------- */
function montarSelect() {
  const sel = document.getElementById('sel-paleta');
  if (!sel) return;
  if (!sel.options.length) {
    sel.append(...PALETAS.map(p => new Option(p.nombre, p.id)));
  }
  sel.value = paleta;
  sel.addEventListener('change', () => setPaleta(sel.value));
}
function pintarMuestras() {                       // tira de 4 puntos junto al select, siempre del modo activo
  const caja = document.getElementById('muestras-paleta');
  if (!caja) return;
  const p = PALETAS.find(x => x.id === paleta);
  const m = efectivo(modo);
  caja.replaceChildren(...p.muestras[m].map(c => Object.assign(document.createElement('i'), { style: `background:${c}` })));
}

/* ---------- escuchar cambios de modo ---------- */
function enlazar() {
  document.addEventListener('click', e => {       // delegación: botones con data-modo
    const b = e.target.closest('[data-modo]'); if (b) setModo(b.dataset.modo);
  });
  // Sincroniza con código existente del lector que cambie body[data-tema]
  new MutationObserver(() => {
    const m = ES_A_EN[document.body.dataset.tema];
    if (m && m !== efectivo(modo)) { modo = m; store.set(K_MODO, m); aplicar(); }
  }).observe(document.body, { attributes: true, attributeFilter: ['data-tema'] });
  new MutationObserver(() => {
    const m = raiz.dataset.theme;
    if (['dark', 'light', 'sepia'].includes(m) && m !== efectivo(modo)) { modo = m; store.set(K_MODO, m); aplicar(); }
  }).observe(raiz, { attributes: true, attributeFilter: ['data-theme'] });
  // Otra pestaña (bitácora ↔ lector) cambia el tema → reflejarlo aquí
  window.addEventListener('storage', e => {
    if (e.key === K_MODO && e.newValue) { modo = e.newValue; aplicar({ animar: false }); }
    if (e.key === K_PALETA && PALETAS.some(p => p.id === e.newValue)) {
      paleta = e.newValue; const s = document.getElementById('sel-paleta'); if (s) s.value = paleta; aplicar({ animar: false });
    }
  });
}

function iniciar() { montarSelect(); enlazar(); aplicar({ animar: false }); }
document.body ? iniciar() : document.addEventListener('DOMContentLoaded', iniciar, { once: true });
