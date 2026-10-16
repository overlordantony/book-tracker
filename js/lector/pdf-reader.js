/** pdf-reader.js — soporte de PDF: PDF.js (CDN, carga diferida) + capa de texto propia.
 *  Cada página del PDF se trata como un "capítulo" de una sola pantalla, así que
 *  progreso, estante, anotaciones, búsqueda y persistencia funcionan igual que en EPUB. */
(() => {
// PDF.js local: pdf.min.mjs y pdf.worker.min.mjs deben estar en la misma carpeta que este archivo (js/).
// Se resuelven desde la URL de este script, así no dependen de dónde esté index.html.
const AQUI = document.currentScript.src;
const RUTA = f => new URL(f, AQUI).href;
let lib;
const ctx = document.createElement('canvas').getContext('2d'); // para medir el ancho del texto

/** Carga PDF.js desde archivos locales, solo al abrir el primer PDF. */
async function cargarLib() {
  if (lib) return lib;
  let l;
  try { l = await import(RUTA('pdf.min.mjs')); }
  catch (e) { throw new Error('No se pudo cargar js/pdf.min.mjs. Revisa que el archivo exista y que abras la app con un servidor (http://localhost), no con file://.'); }
  l.GlobalWorkerOptions.workerSrc = RUTA('pdf.worker.min.mjs');
  return (lib = l);
}
/** Multiplicación de matrices 2D de PDF (equivale a Util.transform de PDF.js). */
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

/** Convierte el esquema (outline) del PDF en {titulo, idx de página, hijos}. */
const resolver = (pdf, items) => Promise.all(items.map(async o => {
  let idx = -1;
  try {
    let d = o.dest; if (typeof d === 'string') d = await pdf.getDestination(d);
    if (Array.isArray(d)) idx = typeof d[0] === 'object' ? await pdf.getPageIndex(d[0]) : d[0];
  } catch {}
  return { titulo: o.title, idx, hijos: await resolver(pdf, o.items || []) };
}));

/** Abre un PDF y devuelve un objeto de libro compatible con el de EPUB. */
async function abrir(archivo) {
  const l = await cargarLib();
  const pdf = await l.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()), isEvalSupported: false }).promise;
  const n = pdf.numPages;
  let info = {}; try { info = (await pdf.getMetadata()).info || {}; } catch {}
  let portada = null; // miniatura de la página 1 para el estante
  try {
    const p = await pdf.getPage(1), vp = p.getViewport({ scale: 340 / p.getViewport({ scale: 1 }).height });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    portada = await new Promise(r => c.toBlob(r, 'image/jpeg', .8));
  } catch {}
  const capitulos = Array.from({ length: n }, (_, i) => ({ path: '', titulo: 'Página ' + (i + 1), tomo: 0 }));
  let tomos = [], esquema = [];
  try { esquema = await resolver(pdf, (await pdf.getOutline()) || []); } catch {}
  const titulados = new Set();
  const marcar = (items, t) => items.forEach(e => {
    if (e.idx >= 0 && e.idx < n) {
      if (!titulados.has(e.idx) && e.titulo) { capitulos[e.idx].titulo = e.titulo; titulados.add(e.idx); }
      if (!tomos[t].caps.includes(e.idx)) tomos[t].caps.push(e.idx);
    }
    marcar(e.hijos, t);
  });
  if (esquema.some(e => e.hijos.length)) esquema.forEach(e => { tomos.push({ titulo: e.titulo || 'Sección', caps: [] }); marcar([e], tomos.length - 1); });
  else if (esquema.length) { tomos.push({ titulo: 'Contenido', caps: [] }); marcar(esquema, 0); }
  if (!tomos.some(t => t.caps.length)) { // sin esquema: grupos de 20 páginas
    tomos = [];
    for (let a = 0; a < n; a += 20) tomos.push({ titulo: `Páginas ${a + 1}–${Math.min(n, a + 20)}`, caps: Array.from({ length: Math.min(20, n - a) }, (_, k) => a + k) });
  }
  return { titulo: info.Title || archivo.name.replace(/\.pdf$/i, ''), autor: info.Author || '', portada, tomos, capitulos, paginas: Array(n).fill(1), pdf: true, _pdf: pdf };
}

/** Renderiza la página `i`: canvas + capa de texto transparente (para seleccionar y subrayar).
 *  Con `solo` devuelve únicamente el texto (para la búsqueda). */
async function cargar(L, i, solo) {
  const p = await L._pdf.getPage(i + 1), tc = await p.getTextContent();
  if (solo) { const f = document.createDocumentFragment(); f.append(tc.items.map(t => t.str || '').join('')); return { frag: f, css: '' }; }
  const caja = App.$('#pagina'), v1 = p.getViewport({ scale: 1 });
  const esc = Math.min(caja.clientWidth / v1.width, caja.clientHeight / v1.height) || 1;
  const vp = p.getViewport({ scale: esc }), dpr = devicePixelRatio || 1;
  const cv = App.el('canvas', { width: Math.floor(vp.width * dpr), height: Math.floor(vp.height * dpr) });
  cv.style.width = vp.width + 'px'; cv.style.height = vp.height + 'px';
  await p.render({ canvasContext: cv.getContext('2d'), viewport: vp, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;
  const capa = App.el('div', { className: 'pdftxt' });
  for (const it of tc.items) {
    if (!it.str) continue;
    const st = tc.styles[it.fontName] || {}, tx = mul(vp.transform, it.transform);
    const fs = Math.hypot(tx[2], tx[3]), ang = Math.atan2(tx[1], tx[0]), fam = st.fontFamily || 'sans-serif';
    const asc = st.ascent ? st.ascent * fs : st.descent ? (1 + st.descent) * fs : fs;
    ctx.font = `${fs}px ${fam}`;
    const w = ctx.measureText(it.str).width, sx = w > 0 && it.width > 0 ? it.width * vp.scale / w : 1;
    const s = App.el('span', { textContent: it.str });
    Object.assign(s.style, { left: tx[4] + asc * Math.sin(ang) + 'px', top: tx[5] - asc * Math.cos(ang) + 'px', fontSize: fs + 'px', fontFamily: fam, transform: `rotate(${ang}rad) scaleX(${sx})` });
    capa.append(s);
  }
  const frag = document.createDocumentFragment();
  frag.append(App.el('div', { className: 'pdfpag', style: `width:${vp.width}px;height:${vp.height}px` }, cv, capa));
  return { frag, css: '' };
}
App.Pdf = { abrir, cargar };
})();
