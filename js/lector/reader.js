/** reader.js — render del capítulo, paginación por columnas y persistencia de posición. */
(() => {
const cont = App.$('#contenido'), pag = App.$('#pagina');
const estilo = document.head.appendChild(App.el('style'));
const S = { libro: null, cap: 0, pag: 0, npag: 1, frac: 0, w: 0, gap: 48, pct: 0, tok: 0, abriendo: false };
const R = App.Reader = { S };

/** Guarda la posición en IndexedDB (al instante) y en la nube (nube.js, con retardo). */
const guardarPos = App.debounce(() => {
  const r = App.rec; if (!r) return;
  r.pos = { cap: S.cap, frac: S.frac }; r.pct = S.pct; r.posTs = Date.now();
  App.db.put('libros', r); App.Nube.programar(r, 'pos');
}, 400);

/** Recalcula las páginas del capítulo (al cargar, rotar, redimensionar o cambiar ajustes). */
const recargarPdf = App.debounce(() => R.recargar(), 150);
R.paginar = ya => {
  if (!S.libro) return;
  if (S.libro.pdf && ya !== true) return recargarPdf(); // PDF: se re-renderiza a la nueva escala
  const w = pag.clientWidth, h = pag.clientHeight; if (!w) return;
  S.w = w;
  Object.assign(cont.style, { width: w + 'px', height: h + 'px', columnWidth: w + 'px', columnGap: S.gap + 'px', columnFill: 'auto' });
  S.npag = Math.max(1, Math.round((cont.scrollWidth + S.gap) / (w + S.gap)));
  S.pag = Math.min(S.npag - 1, Math.floor(S.frac * S.npag + 1e-6));
  S.libro.paginas[S.cap] = S.npag;
  // Repaginar (rotar, redimensionar, cambiar ajustes) o restaurar la posición al abrir NO es
  // navegar: guardar ahí movería la posición por el redondeo a página y, al alternar entre
  // dispositivos con distinta paginación, la lectura retrocedería poco a poco.
  R.mover(false, ya === true && !S.abriendo);
};
/** Desplaza a la pantalla actual (con transición suave si `anim`). */
R.mover = (anim = true, guardar = true) => {
  cont.style.transition = anim ? '' : 'none';
  cont.style.transform = `translateX(${-S.pag * (S.w + S.gap)}px)`;
  S.frac = S.pag / S.npag; R.estado(); if (guardar) guardarPos();
};
R.estado = () => {
  const n = S.libro.capitulos.length, p = (S.cap + (S.pag + 1) / S.npag) / n;
  S.pct = Math.round(100 * p);
  App.$('#est').textContent = S.libro.pdf ? `Página ${S.cap + 1}/${n} · ${S.pct}%` : `Cap. ${S.cap + 1}/${n} · Pág. ${S.pag + 1}/${S.npag} · ${S.pct}%`;
  App.$('#prog-fill').style.width = S.pct + '%'; App.$('#prog-txt').textContent = S.pct + '%';
  App.$('#barra').value = Math.round(1000 * (S.cap + S.pag / S.npag) / n);
};
/** Página (columna) en la que está un elemento del capítulo. */
R.pagDe = el => {
  const r = el.getClientRects()[0] || el.getBoundingClientRect();
  return Math.max(0, Math.min(S.npag - 1, Math.floor((r.left - cont.getBoundingClientRect().left + 1) / (S.w + S.gap))));
};
R.mostrar = el => { if (el) { S.pag = R.pagDe(el); R.mover(); } };

/** Abre el capítulo `cap` en la fracción `frac` (0..1); `despues` se ejecuta tras paginar. */
R.ir = async (cap, frac = 0, despues) => {
  const L = S.libro; if (!L) return;
  cap = Math.max(0, Math.min(L.capitulos.length - 1, cap));
  const t = ++S.tok, { frag, css } = await App.Epub.cargar(L, cap);
  if (t !== S.tok) return; // llegó una navegación más reciente
  S.cap = cap; S.frac = frac; estilo.textContent = css;
  App.limpiar(cont); cont.append(frag);
  App.Ann.aplicar(cap); App.Nav.marcarBusqueda();
  const rep = App.debounce(R.paginar, 100);
  cont.querySelectorAll('img').forEach(i => i.addEventListener('load', rep));
  App.$('#cab').textContent = L.capitulos[cap].titulo;
  R.paginar(true); App.Nav.resaltarIndice(); App.Ann.panel();
  if (despues) despues();
};
R.recargar = () => R.ir(S.cap, S.frac);
R.sig = () => { if (!S.libro) return; if (S.pag < S.npag - 1) { S.pag++; R.mover(); } else if (S.cap < S.libro.capitulos.length - 1) R.ir(S.cap + 1); };
R.ant = () => { if (!S.libro) return; if (S.pag > 0) { S.pag--; R.mover(); } else if (S.cap > 0) R.ir(S.cap - 1, 1); };

/** Abre un EPUB/PDF (File/Blob) y reconcilia la copia local con la de la nube (por huella del archivo).
 *  `hint` (opcional): entrada del estante, solo para reutilizar su id.
 *  `vincular`: si se eligió el archivo a mano dentro de ?libro=, lo enlaza con ese libro de la bitácora. */
R.abrir = async (archivo, hint, { vincular = false } = {}) => {
  try {
    const esPdf = /\.pdf$/i.test(archivo.name) || archivo.type === 'application/pdf';
    const L = esPdf ? await App.Pdf.abrir(archivo) : await App.Epub.abrir(archivo);
    const id = hint ? hint.id : await App.huellaDe(archivo);

    const local = await App.db.get('libros', id);
    let remoto = null, nubeOk = true;
    try { remoto = await App.Nube.obtener(id); } catch (e) { nubeOk = false; console.warn('Sin acceso a la nube:', e); }

    const meta = { id, titulo: L.titulo, autor: L.autor, formato: esPdf ? 'pdf' : 'epub', tamano: archivo.size, nombreArchivo: archivo.name };
    const ahora = Date.now(), subir = [];
    let rec;
    if (!local && !remoto) {            // libro nuevo
      rec = { ...meta, portada: L.portada, mini: await App.miniatura(L.portada), libroId: null,
        pos: { cap: 0, frac: 0 }, pct: 0, posTs: ahora, ann: [], annTs: ahora };
      subir.push('todo', 'pos', 'ann'); if (nubeOk) subir.push('crear');
    } else {                            // ya conocido: gana la parte más reciente (local o nube)
      const r = App.Sync.reconciliar(local, remoto);
      rec = { ...meta, portada: (local && local.portada) || L.portada,
        mini: (local && local.mini) || (remoto && remoto.portadaMini) || await App.miniatura(L.portada),
        libroId: (local && local.libroId) || (remoto && remoto.libroId) || null,
        pos: r.pos, pct: r.pct, posTs: r.posTs, ann: r.ann, annTs: r.annTs };
      if (r.subirPos) subir.push('pos');
      if (r.subirAnn) subir.push('ann');
      if (!remoto) { subir.push('todo'); if (nubeOk) subir.push('crear'); }
    }
    if (vincular && App.libroId && rec.libroId !== App.libroId) { rec.libroId = App.libroId; subir.push('pos'); }

    await App.db.put('libros', rec);
    try { if (!(await App.db.get('archivos', id))) await App.db.put('archivos', { id, archivo }); } catch (e) { console.warn('No se pudo guardar el archivo en este dispositivo:', e); }
    if (subir.length) App.Nube.programar(rec, ...subir);

    App.rec = rec; S.libro = L; App.Ann.lista = rec.ann;
    App.$('#titulo').textContent = L.titulo; App.$('#autor').textContent = L.autor;
    const im = App.$('#portada');
    if (im.src.startsWith('blob:')) URL.revokeObjectURL(im.src);
    if (L.portada) { im.src = URL.createObjectURL(L.portada); im.hidden = false; } else im.hidden = true;
    App.Nav.cache = {}; App.Nav.q = ''; App.Nav.indice(L);
    App.$('#vacio').hidden = true;
    S.abriendo = true;
    try { await R.ir(rec.pos.cap, rec.pos.frac); } finally { S.abriendo = false; }
  } catch (e) { alert('No se pudo abrir el archivo: ' + e.message); }
};

/** Libro conocido en la cuenta pero cuyo archivo no está en este dispositivo (p. ej. otro equipo). */
R.pendiente = e => {
  S.libro = null; App.rec = null; App.Ann.lista = []; App.limpiar(cont);
  App.$('#titulo').textContent = e.titulo; App.$('#autor').textContent = e.autor || '';
  App.$('#prog-fill').style.width = (e.pct || 0) + '%'; App.$('#prog-txt').textContent = (e.pct || 0) + '%';
  App.$('#cab').textContent = ''; App.$('#est').textContent = '';
  App.vacio(`«${e.titulo}» · ${e.pct || 0}% leído`,
    'Tu posición y tus anotaciones están guardadas en tu cuenta.',
    'Selecciona el archivo del libro en este dispositivo («Abrir libro») para continuar donde lo dejaste.');
};

/** Primer paso al entrar: reabre el libro de ?libro=<id> o, si no hay, el último leído en cualquier dispositivo. */
R.iniciar = async () => {
  const { lista } = await App.Nube.estante();   // ya viene ordenada: la lectura más reciente primero
  const e = App.libroId ? lista.find(x => x.libroId === App.libroId) : lista[0];
  if (!e) {
    App.vacio(...(App.libro
      ? [`Aún no has abierto «${App.libro.titulo}» en el lector.`, 'Usa «Abrir libro» y elige su archivo .epub o .pdf: quedará vinculado a este libro de tu bitácora.']
      : ['Arrastra un .epub o .pdf aquí o usa «Abrir libro»']));
    return;
  }
  const a = e.local ? await App.db.get('archivos', e.id) : null;
  if (a) R.abrir(a.archivo, e); else R.pendiente(e);
};
// Reaccionar a rotación, redimensionado y cambios del sidebar
new ResizeObserver(App.debounce(R.paginar, 120)).observe(pag);
})();
