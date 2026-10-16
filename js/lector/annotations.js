/** annotations.js — subrayados, notas, panel y exportar/importar. */
(() => {
const A = App.Ann = { lista: [], rango: null };
const cont = App.$('#contenido'), barra = App.$('#colores');

/** Envuelve el texto entre los offsets [ini, fin) del capítulo; `fn` crea cada <mark>. */
A.envolver = (ini, fin, fn) => {
  const w = document.createTreeWalker(cont, NodeFilter.SHOW_TEXT), nodos = [];
  for (let pos = 0; w.nextNode();) {
    const n = w.currentNode, l = n.nodeValue.length;
    if (pos + l > ini && pos < fin) nodos.push([n, Math.max(0, ini - pos), Math.min(l, fin - pos)]);
    pos += l;
  }
  nodos.forEach(([n, a, b]) => {
    let t = n;
    if (a > 0) t = t.splitText(a);
    if (b - a < t.nodeValue.length) t.splitText(b - a);
    const m = fn(); t.replaceWith(m); m.append(t);
  });
};
const marca = a => App.el('mark', { className: 'ann', style: 'background:' + a.color, title: a.nota || '', 'data-id': a.id });
/** Re-aplica los subrayados del capítulo `cap`. */
A.aplicar = cap => A.lista.filter(a => a.cap === cap).forEach(a => A.envolver(a.ini, a.fin, () => marca(a)));
/** Guarda las anotaciones en IndexedDB (al instante) y en la nube (nube.js, con retardo). */
A.guardar = () => {
  const r = App.rec; if (!r) return;
  r.ann = A.lista; r.annTs = Date.now();
  App.db.put('libros', r); App.Nube.programar(r, 'ann');
};

const off = (n, o) => { const r = document.createRange(); r.selectNodeContents(cont); r.setEnd(n, o); return r.toString().length; };
const ocultar = () => { barra.hidden = true; };
/** Muestra el menú de colores al seleccionar texto (doble clic, arrastre o táctil). */
function mostrar() {
  if (barra.contains(document.activeElement)) return;
  const s = getSelection();
  if (!s.rangeCount || s.isCollapsed || !cont.contains(s.anchorNode) || !cont.contains(s.focusNode)) return ocultar();
  const r = s.getRangeAt(0), ini = off(r.startContainer, r.startOffset), fin = off(r.endContainer, r.endOffset);
  if (fin <= ini) return ocultar();
  A.rango = { ini, fin, texto: r.toString().trim().slice(0, 160) };
  const b = r.getBoundingClientRect(); barra.hidden = false;
  barra.style.top = Math.max(8, b.top - barra.offsetHeight - 8) + 'px';
  barra.style.left = Math.min(innerWidth - barra.offsetWidth - 8, Math.max(8, b.left)) + 'px';
}
document.addEventListener('selectionchange', App.debounce(mostrar, 250));
barra.addEventListener('pointerdown', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); }); // conserva la selección
barra.onclick = e => {
  const color = e.target.dataset.c; if (!color || !A.rango) return;
  if (A.lista.length >= App.Sync.MAX_ANOTACIONES) return alert('Llegaste al máximo de anotaciones por libro (' + App.Sync.MAX_ANOTACIONES + ').');
  const a = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5), cap: App.Reader.S.cap, ...A.rango, color, nota: App.$('#nota').value.trim(), fecha: new Date().toISOString() };
  A.lista.push(a); A.envolver(a.ini, a.fin, () => marca(a));
  getSelection().removeAllRanges(); App.$('#nota').value = ''; A.rango = null; ocultar(); A.guardar(); A.panel();
};

/** Elimina anotaciones por id y redibuja el capítulo. */
A.borrar = ids => { A.lista = A.lista.filter(a => !ids.includes(a.id)); A.guardar(); App.Reader.recargar(); A.panel(); };

/** Panel "Mis anotaciones". */
A.panel = () => {
  const p = App.$('#t-notas'), cap = App.Reader.S.cap; App.limpiar(p);
  p.append(App.el('button', { textContent: 'Borrar las de este capítulo', onclick: () => confirm('¿Borrar todas las anotaciones del capítulo?') && A.borrar(A.lista.filter(a => a.cap === cap).map(a => a.id)) }));
  if (!A.lista.length) p.append(App.el('p', { textContent: 'Aún no hay anotaciones. Selecciona texto para subrayar.' }));
  [...A.lista].sort((a, b) => a.cap - b.cap || a.ini - b.ini).forEach(a => p.append(App.el('div', { className: 'nota' },
    App.el('i', { style: 'background:' + a.color }),
    App.el('div', { onclick: () => App.Nav.irAnn(a) }, App.el('b', { textContent: '“' + a.texto + '”' }), App.el('small', { textContent: a.nota || '' })),
    App.el('button', { textContent: '✕', title: 'Eliminar', onclick: () => A.borrar([a.id]) }))));
};

/** Exporta a JSON lo que hay en tu cuenta: posición y anotaciones de todos tus libros del lector. */
A.exportar = async () => {
  try {
    const datos = await App.Nube.exportar();
    const u = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' }));
    App.el('a', { href: u, download: 'lector-bitacora.json' }).click(); setTimeout(() => URL.revokeObjectURL(u), 1000);
  } catch (e) { alert('No se pudo exportar: ' + e.message); }
};
/** Importa un JSON exportado y lo guarda en tu cuenta (fusiona: no borra nada de lo que ya tienes). */
A.importar = async f => {
  try {
    const r = await App.Nube.importar(JSON.parse(await f.text()));
    alert(`Importación lista.\nActualizados: ${r.actualizados} · Nuevos: ${r.nuevos} · Omitidos: ${r.omitidos}` +
      (r.omitidos ? '\n\nLos omitidos son libros de un archivo antiguo que todavía no están en tu estante: ábrelos una vez y vuelve a importar.' : ''));
    location.reload();
  } catch (e) { alert('No se pudo importar: ' + e.message); }
};
App.$('#exp').onclick = A.exportar;
App.$('#imp').onchange = e => { if (e.target.files[0]) A.importar(e.target.files[0]); };
})();
