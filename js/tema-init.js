/* tema-init.js — SCRIPT CLÁSICO, va en <head> ANTES de las hojas de estilo (sin defer/async/module).
   Aplica modo y paleta guardados antes del primer pintado → cero parpadeo. */
(function () {
  var d = document.documentElement, modo = 'dark', paleta = 'viridian';
  try {
    modo   = localStorage.getItem('tema:modo')    || modo;
    paleta = localStorage.getItem('tema:paleta')  || paleta;
  } catch (e) {}
  // La bitácora no tiene sepia: se ve en claro sin tocar lo guardado.
  if (d.hasAttribute('data-modos') && d.getAttribute('data-modos').split(',').indexOf(modo) < 0) modo = 'light';
  d.setAttribute('data-theme', modo);
  d.setAttribute('data-palette', paleta);
  var m = document.querySelector('meta[name="theme-color"]');
  if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  m.content = modo === 'dark' ? '#071310' : modo === 'sepia' ? '#F1EED4' : '#ECF6F2';
})();
