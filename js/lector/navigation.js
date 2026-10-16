/** navigation.js — sidebar, índice, salto, búsqueda, estante, teclado, drag & drop. */
(() => {
const N = App.Nav = { cache: {}, q: '' };
const R = App.Reader, S = R.S, side = App.$('#sidebar'), cont = App.$('#contenido');
const menu = v => document.body.classList.toggle('menu', v);
const cerrar = () => innerWidth < 768 && menu(false);
App.$('#btn-menu').onclick = () => menu();
App.$('#overlay').onclick = () => menu(false);

N.tab = t => {
  for (const b of App.$('#tabs').children) b.classList.toggle('on', b.dataset.t === t);
  for (const s of side.querySelectorAll('section')) s.hidden = s.id !== 't-' + t;
  if (t === 'estante') N.estante(); else if (t === 'notas') App.Ann.panel(); else if (t === 'buscar') App.$('#q').focus();
};
App.$('#tabs').onclick = e => e.target.dataset.t && N.tab(e.target.dataset.t);

/** Árbol colapsable tomos → capítulos. */
N.indice = L => {
  const p = App.$('#t-indice'); App.limpiar(p);
  L.tomos.forEach((t, i) => {
    const d = App.el('details', { open: i === 0 }, App.el('summary', { textContent: t.titulo }));
    t.caps.forEach(c => d.append(App.el('button', { className: 'cap', textContent: L.capitulos[c].titulo, 'data-c': c, onclick: () => { R.ir(c); cerrar(); } })));
    p.append(d);
  });
};
N.resaltarIndice = () => {
  for (const b of App.$('#t-indice').querySelectorAll('.cap')) {
    const on = +b.dataset.c === S.cap; b.classList.toggle('on', on);
    if (on) b.parentElement.open = true;
  }
};
App.$('#btn-ir').onclick = () => {
  if (!S.libro) return;
  const n = parseInt(prompt(`Ir al capítulo (1-${S.libro.capitulos.length}):`), 10);
  if (n) { R.ir(n - 1); cerrar(); }
};
/** Salta a una anotación guardada. */
N.irAnn = a => { R.ir(a.cap, 0, () => R.mostrar(cont.querySelector(`mark[data-id="${a.id}"]`))); cerrar(); };

/* ---- Búsqueda de texto ---- */
N.marcarBusqueda = () => {
  if (!N.q) return;
  const t = cont.textContent.toLowerCase(), q = N.q.toLowerCase();
  for (let i = t.indexOf(q), k = 0; i >= 0; i = t.indexOf(q, i + q.length), k++)
    App.Ann.envolver(i, i + q.length, () => App.el('mark', { className: 'busq', 'data-k': k }));
};
N.buscar = async q => {
  const L = S.libro, out = App.$('#res'); App.limpiar(out); N.q = q;
  if (!L) return;
  if (q.length < 2) { N.q = ''; return; }
  const ql = q.toLowerCase(); let total = 0;
  for (let i = 0; i < L.capitulos.length && total < 200; i++) {
    if (N.q !== q) return;
    const t = N.cache[i] ??= (await App.Epub.cargar(L, i, true)).frag.textContent, tl = t.toLowerCase();
    for (let p = tl.indexOf(ql), k = 0; p >= 0 && k < 5; p = tl.indexOf(ql, p + ql.length), k++, total++) {
      const kk = k;
      out.append(App.el('button', { onclick: () => { R.ir(i, 0, () => R.mostrar(App.$(`mark.busq[data-k="${kk}"]`))); cerrar(); } },
        App.el('b', { textContent: L.capitulos[i].titulo }), App.el('small', { textContent: '…' + t.slice(Math.max(0, p - 30), p + q.length + 40) + '…' })));
    }
  }
  if (!total) out.append(App.el('small', { textContent: 'Sin resultados' }));
};
App.$('#q').onkeydown = e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim(); N.buscar(q);
  if (!q && S.libro) R.recargar(); // quita el resaltado
};

/* ---- Estante de libros (viene de tu cuenta; el archivo puede estar o no en este dispositivo) ---- */
N.estante = async () => {
  const p = App.$('#t-estante'); App.limpiar(p);
  p.append(App.el('small', { textContent: 'Cargando…' }));
  const { lista, nubeOk } = await App.Nube.estante(); App.limpiar(p);
  if (!nubeOk) p.append(App.el('small', { textContent: 'Sin conexión con tu cuenta: solo se muestran los libros de este dispositivo.' }));
  if (!lista.length) p.append(App.el('p', { textContent: 'Tu estante está vacío. Abre un EPUB o PDF.' }));
  for (const l of lista) {
    const img = l.portada ? URL.createObjectURL(l.portada) : l.mini;
    p.append(App.el('div', { className: 'libro' },
      img ? App.el('img', { src: img, alt: '' }) : App.el('span'),
      App.el('div', { onclick: async () => {
        const a = l.local ? await App.db.get('archivos', l.id) : null;
        if (a) { await R.abrir(a.archivo, l); N.tab('indice'); } else R.pendiente(l);
        cerrar();
      } },
        App.el('b', { textContent: l.titulo }),
        App.el('small', { textContent: `${l.autor || ''} · ${l.pct || 0}%` }),
        l.local ? '' : App.el('small', { textContent: 'Falta el archivo en este dispositivo' })),
      App.el('button', { textContent: '✕', title: 'Quitar libro', onclick: async () => {
        if (!confirm('¿Quitar este libro y sus anotaciones? También se borrarán de tu cuenta, en todos tus dispositivos.')) return;
        try { await App.Nube.borrar(l.id); } catch (e) { return alert('No se pudo quitar de tu cuenta: ' + e.message + '\nComprueba la conexión e inténtalo de nuevo.'); }
        if (App.rec && App.rec.id === l.id) App.rec = null;
        await App.db.del('libros', l.id); await App.db.del('archivos', l.id); N.estante();
      } })));
  }
};

/* ---- Abrir archivo y drag & drop ---- */
const abrirArchivo = f => { if (!f) return; if (/\.(epub|pdf)$/i.test(f.name)) R.abrir(f, null, { vincular: true }).then(() => N.tab('indice')); else alert('Selecciona un archivo .epub o .pdf'); };
App.$('#archivo').onchange = e => { abrirArchivo(e.target.files[0]); e.target.value = ''; };
addEventListener('dragover', e => { e.preventDefault(); document.body.classList.add('drag'); });
addEventListener('dragleave', e => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
addEventListener('drop', e => { e.preventDefault(); document.body.classList.remove('drag'); abrirArchivo(e.dataTransfer.files[0]); });

/* ---- Navegación: botones, barra, teclado, swipe, enlaces internos ---- */
['ant', 'f-ant'].forEach(i => App.$('#' + i).onclick = R.ant);
['sig', 'f-sig'].forEach(i => App.$('#' + i).onclick = R.sig);
App.$('#barra').onchange = e => {
  const n = S.libro && S.libro.capitulos.length; if (!n) return;
  const v = e.target.value / 1000 * n, c = Math.min(n - 1, Math.floor(v));
  R.ir(c, v - c); e.target.blur();
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { menu(false); App.$('#ajustes').hidden = true; return; }
  if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (e.key === 'ArrowRight') R.sig();
  else if (e.key === 'ArrowLeft') R.ant();
  else if (e.ctrlKey && k === 'e') { e.preventDefault(); App.abrirAjustes(); }
  else if (e.ctrlKey && k === 'f' && S.libro) { e.preventDefault(); menu(true); N.tab('buscar'); }
});
let x0 = null;
const vp = App.$('#viewport');
vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
vp.addEventListener('touchend', e => {
  if (x0 === null || !getSelection().isCollapsed) return;
  const dx = e.changedTouches[0].clientX - x0; x0 = null;
  if (Math.abs(dx) > 50) dx < 0 ? R.sig() : R.ant();
});
cont.addEventListener('click', e => {
  const a = e.target.closest('a'); if (!a || !a.dataset.ruta) return;
  e.preventDefault();
  const i = S.libro.capitulos.findIndex(c => c.path === a.dataset.ruta); if (i < 0) return;
  const f = a.dataset.frag, ir = () => f && R.mostrar(document.getElementById('x-' + f));
  i === S.cap ? ir() : R.ir(i, 0, ir);
});

})();
