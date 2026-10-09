// ======================================================================
// PIE DE PÁGINA FIJO — se inyecta en todas las páginas desde este archivo.
// Edita SOLO el objeto PIE de abajo; no hace falta tocar los HTML.
// ======================================================================

const PIE = {
  // ✏️ PLACEHOLDER EDITABLE: texto breve / descripción del proyecto.
  descripcion: "Texto breve del proyecto — edítalo en js/pie.js",

  // ✏️ PLACEHOLDER EDITABLE: enlace a GitHub.
  // Sustituye "#" por la URL real (equivale a {{url_github}}).
  github: { texto: "GitHub", url: "#" },

  // ✏️ PLACEHOLDERS EDITABLES: enlaces extra (puedes dejar 1 o 2; borra uno si sobra).
  // Sustituye "#" por la URL real ({{url_extra_1}}, {{url_extra_2}}) y cambia el texto.
  extras: [
    { texto: "Enlace 1", url: "#" },
    { texto: "Enlace 2", url: "#" }
  ]
};

// ---------------------------- Iconos (SVG en línea) ----------------------------
const ICONO_GITHUB =
  '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>';
// Icono genérico de enlace (cadena)
const ICONO_ENLACE =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

function crearEnlace({ texto, url }, iconoSvg) {
  const a = document.createElement("a");
  a.className = "pie-enlace";
  a.href = url || "#";
  // Con "#" (placeholder) no abrimos pestaña nueva; con una URL real sí.
  if (a.getAttribute("href") !== "#") {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  a.innerHTML = iconoSvg; // SVG fijo definido arriba (no viene de datos del usuario)
  const span = document.createElement("span");
  span.textContent = texto;
  a.appendChild(span);
  return a;
}

function montarPie() {
  if (document.querySelector(".pie-fijo")) return;

  const pie = document.createElement("footer");
  pie.className = "pie-fijo";

  const texto = document.createElement("p");
  texto.className = "pie-texto";
  texto.textContent = PIE.descripcion;
  texto.title = PIE.descripcion; // en móvil se recorta; el título muestra el texto completo

  const nav = document.createElement("nav");
  nav.className = "pie-enlaces";
  nav.setAttribute("aria-label", "Enlaces del proyecto");
  nav.appendChild(crearEnlace(PIE.github, ICONO_GITHUB));
  (PIE.extras || []).slice(0, 2).forEach(e => nav.appendChild(crearEnlace(e, ICONO_ENLACE)));

  pie.append(texto, nav);
  document.body.appendChild(pie);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", montarPie);
} else {
  montarPie();
}
