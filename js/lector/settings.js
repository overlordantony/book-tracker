/** settings.js — ajustes del lector (fuente, tamaño, tema, interlineado, ancho). */
(() => {
const FUENTES = {
  serif: 'Georgia,"Times New Roman",serif',
  sans: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  mono: 'ui-monospace,Menlo,Consolas,monospace',
};
const S = App.ajustes = { fuente: 'serif', tam: 19, lh: 1.7, ancho: 44, tema: 'claro', ...App.leer('aj', {}) };

/** Aplica los ajustes al vuelo; si cambia el layout, vuelve a paginar. */
function aplicar(repaginar) {
  const r = document.documentElement.style;
  r.setProperty('--fuente', FUENTES[S.fuente] || FUENTES.serif);
  r.setProperty('--tam', S.tam + 'px'); r.setProperty('--lh', S.lh); r.setProperty('--ancho', S.ancho + 'rem');
  document.body.dataset.tema = S.tema;
  App.guardar('aj', S);
  if (repaginar && App.Reader) App.Reader.paginar();
}
const mapa = { tam: 'a-tam', lh: 'a-lh', ancho: 'a-ancho', fuente: 'a-fuente', tema: 'a-tema' };
for (const k in mapa) {
  const e = App.$('#' + mapa[k]); e.value = S[k];
  e.oninput = () => { S[k] = e.type === 'range' ? +e.value : e.value; aplicar(true); };
}
aplicar(false);
App.abrirAjustes = () => { const a = App.$('#ajustes'); a.hidden = !a.hidden; };
App.$('#btn-aj').onclick = App.abrirAjustes;
})();
