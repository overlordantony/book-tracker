/** epub-parser.js — ZIP en memoria (DecompressionStream), OPF, TOC y saneado del XHTML. */
(() => {
const td = new TextDecoder();
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };
const TAGS = new Set('p div span h1 h2 h3 h4 h5 h6 em strong i b u s sub sup br hr ul ol li blockquote pre code a img figure figcaption table thead tbody tr td th section article aside cite small dl dt dd'.split(' '));
const ATTRS = ['alt', 'title', 'colspan', 'rowspan'];
const DESCARTAR = /^(script|style|iframe|object|embed|form|link|meta|svg|math|head|title|button|input|select|textarea|audio|video|base)$/;
/** Resuelve `href` relativo al archivo `base` dentro del ZIP. */
const res = (base, href) => decodeURIComponent(new URL(href, 'http://x/' + base).pathname.slice(1));
const xml = (t, tipo = 'application/xml') => new DOMParser().parseFromString(t, tipo);
/** Parsea XHTML como XML estricto (respeta <title/>, <a id=".."/>, etc.). Si falla (p. ej. entidades
 *  HTML como &nbsp;), cae a HTML arreglando antes las etiquetas autocerradas que HTML no entiende. */
const xhtml = t => {
  const d = xml(t, 'application/xhtml+xml');
  if (!d.getElementsByTagName('parsererror').length && d.body) return d;
  return xml(t.replace(/<(title|script|style|textarea)\b([^>]*?)\/>/gi, '<$1$2></$1>'), 'text/html');
};

/** Lee el directorio central de un ZIP. @returns {{get(nombre):Promise<Uint8Array|null>, img:Object}} */
function leerZip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), idx = {};
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('No es un ZIP válido');
  let p = dv.getUint32(e + 16, true);
  for (let i = 0, n = dv.getUint16(e + 10, true); i < n; i++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    idx[td.decode(u8.subarray(p + 46, p + 46 + nl))] = { m: dv.getUint16(p + 10, true), cs: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) };
    p += 46 + nl + xl + cl;
  }
  const get = async nombre => {
    const f = idx[nombre]; if (!f) return null;
    const s = f.off + 30 + dv.getUint16(f.off + 26, true) + dv.getUint16(f.off + 28, true);
    const datos = u8.subarray(s, s + f.cs);
    if (f.m === 0) return datos;
    const st = new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  };
  return { get, img: {} };
}

/** Abre un .epub y devuelve el objeto de libro. @param {File|Blob} archivo */
async function abrir(archivo) {
  const zip = leerZip(await archivo.arrayBuffer());
  const txt = async p => { const d = await zip.get(p); if (!d) throw new Error('Falta ' + p); return td.decode(d); };
  const opfPath = xml(await txt('META-INF/container.xml')).querySelector('rootfile').getAttribute('full-path');
  const opf = xml(await txt(opfPath)), R = h => res(opfPath, h);
  const val = t => { const e = opf.getElementsByTagName(t)[0]; return e ? e.textContent.trim() : ''; };
  const man = {};
  for (const it of opf.querySelectorAll('manifest > item'))
    man[it.getAttribute('id')] = { path: R(it.getAttribute('href')), tipo: it.getAttribute('media-type') || '', props: it.getAttribute('properties') || '' };

  // Portada
  let cov = Object.values(man).find(m => m.props.includes('cover-image'));
  if (!cov) { const m = opf.querySelector('meta[name=cover]'); if (m) cov = man[m.getAttribute('content')]; }
  let portada = null;
  if (cov) { const d = await zip.get(cov.path); if (d) portada = new Blob([d], { type: MIME[cov.path.split('.').pop().toLowerCase()] || 'image/jpeg' }); }

  // Spine y tabla de contenido (nav.xhtml o toc.ncx)
  const spine = [...opf.querySelectorAll('spine > itemref')].map(i => man[i.getAttribute('idref')]).filter(m => m && /html/.test(m.tipo));
  if (!spine.length) throw new Error('El libro no tiene capítulos');
  const hoja = (a, base) => { const [p, f] = a.split('#'); return { href: p ? res(base, p) : base, frag: f || '' }; };
  const navI = Object.values(man).find(m => m.props.split(' ').includes('nav'));
  const spEl = opf.querySelector('spine');
  const ncxI = man[spEl && spEl.getAttribute('toc')] || Object.values(man).find(m => m.tipo === 'application/x-dtbncx+xml');
  let toc = [];
  if (navI) {
    const d = xhtml(await txt(navI.path));
    const nav = [...d.querySelectorAll('nav')].find(n => (n.getAttribute('epub:type') || n.getAttribute('type') || '').includes('toc')) || d.querySelector('nav');
    const ol = o => [...o.children].filter(l => l.localName === 'li').map(l => {
      const a = l.querySelector('a, span'), sub = [...l.children].find(c => c.localName === 'ol'), h = a && a.getAttribute('href');
      return { titulo: a ? a.textContent.trim().replace(/\s+/g, ' ') : '', ...(h ? hoja(h, navI.path) : { href: '', frag: '' }), hijos: sub ? ol(sub) : [] };
    });
    const o = nav && nav.querySelector('ol'); toc = o ? ol(o) : [];
  } else if (ncxI) {
    const np = p => [...p.children].filter(n => n.localName === 'navPoint').map(n => ({
      titulo: n.querySelector('navLabel').textContent.trim(), ...hoja(n.querySelector('content').getAttribute('src'), ncxI.path), hijos: np(n) }));
    toc = np(xml(await txt(ncxI.path)).querySelector('navMap'));
  }

  // Tomos = entradas de primer nivel con subentradas; si no hay jerarquía, un único tomo
  const tomos = [], tomoDe = {}, titulos = {};
  const walk = (l, t) => l.forEach(e => {
    if (e.href && !(e.href in titulos)) titulos[e.href] = e.titulo;
    if (e.href && !(e.href in tomoDe)) tomoDe[e.href] = t;
    walk(e.hijos, t);
  });
  if (toc.some(e => e.hijos.length)) toc.forEach(e => { tomos.push({ titulo: e.titulo, caps: [] }); walk([e], tomos.length - 1); });
  else { tomos.push({ titulo: 'Capítulos', caps: [] }); walk(toc, 0); }
  let ult = 0;
  const capitulos = spine.map((m, i) => {
    if (m.path in tomoDe) ult = tomoDe[m.path];
    tomos[ult].caps.push(i);
    return { path: m.path, titulo: titulos[m.path] || 'Sección ' + (i + 1), tomo: ult };
  });
  return { titulo: val('dc:title') || archivo.name || 'Sin título', autor: val('dc:creator'), portada, tomos, capitulos, paginas: capitulos.map(() => 0), _zip: zip };
}

/** Sanea recursivamente: solo etiquetas/atributos permitidos, imágenes a blob:, sin scripts ni eventos. */
async function sanear(src, base, zip, out) {
  for (const n of src.childNodes) {
    if (n.nodeType === 3) { out.append(n.nodeValue); continue; }
    if (n.nodeType !== 1) continue;
    const t = n.localName;
    if (!TAGS.has(t)) { if (!DESCARTAR.test(t)) await sanear(n, base, zip, out); continue; }
    const c = document.createElement(t);
    for (const a of ATTRS) if (n.hasAttribute(a)) c.setAttribute(a, n.getAttribute(a));
    if (n.id) c.id = 'x-' + n.id; // prefijo: evita choques con los ids de la app
    const cl = (n.getAttribute('class') || '').split(/\s+/).filter(Boolean); // y con las clases (.nota, .libro, .btn…)
    if (cl.length) c.className = cl.map(k => 'x-' + k).join(' ');
    if (t === 'img') {
      const s = n.getAttribute('src');
      if (s && !/^(https?:|data:|\/\/)/i.test(s)) {
        const p = res(base, s);
        if (!zip.img[p]) { const b = await zip.get(p); if (b) zip.img[p] = URL.createObjectURL(new Blob([b], { type: MIME[p.split('.').pop().toLowerCase()] || 'image/png' })); }
        if (zip.img[p]) c.src = zip.img[p];
      }
    }
    if (t === 'a') {
      const h = n.getAttribute('href') || '';
      if (/^https?:/i.test(h)) { c.href = h; c.target = '_blank'; c.rel = 'noopener noreferrer'; }
      else if (h) { const [p, f] = h.split('#'); c.dataset.ruta = p ? res(base, p) : base; c.dataset.frag = f || ''; }
    }
    await sanear(n, base, zip, c);
    out.append(c);
  }
}

/** Limita el CSS del libro a #contenido: prefija clases/ids, descarta fuente/color/saltos de página
 *  y las reglas de html/body (el lector controla el contenedor raíz). */
const scope = css => css.replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/@[^{;]+(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|;)/g, '')
  .replace(/url\([^)]*\)/gi, 'none')
  .replace(/(^|[{;\s])(font-family|font-size|line-height|color|background(?:-color)?|(?:page-)?break-(?:before|after|inside))\s*:[^;}]*;?/gi, '$1')
  .replace(/(^|\})\s*([^{}]+)\{/g, (m, a, s) => a + s.split(',').map(x => /^(html|body)$/i.test(x.trim()) ? '#contenido .x-raiz' : '#contenido ' + x.trim().replace(/^(html|body)\s+/i, '').replace(/([.#])(-?[_a-zA-Z][\w-]*)/g, '$1x-$2')).join(',') + '{');

/** Carga un capítulo: devuelve {frag, css} ya saneados. */
async function cargar(libro, i, solo) {
  if (libro.pdf) return App.Pdf.cargar(libro, i, solo); // PDF: cada página es un "capítulo"
  const c = libro.capitulos[i], zip = libro._zip;
  const d = xhtml(td.decode(await zip.get(c.path) || new Uint8Array()));
  const frag = document.createDocumentFragment();
  await sanear(d.body, c.path, zip, frag);
  let css = '';
  for (const l of d.querySelectorAll('link[rel~=stylesheet]')) {
    const b = await zip.get(res(c.path, l.getAttribute('href')));
    if (b) css += scope(td.decode(b));
  }
  for (const s of d.querySelectorAll('style')) css += scope(s.textContent);
  return { frag, css };
}

App.Epub = { abrir, cargar };
})();
