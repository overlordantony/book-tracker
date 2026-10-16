// ======================================================================
// PIE DE PÁGINA FIJO — se inyecta en todas las páginas desde este archivo.
// Edita SOLO el objeto PIE de abajo; no hace falta tocar los HTML.
// ======================================================================

const PIE = {
  // Texto breve / descripción del proyecto.
  descripcion: "Bitácora de lectura — OverlordAntony",

  //  Enlace a GitHub.
  github: { texto: "GitHub", url: "https://github.com/overlordantony" },

  // Enlaces extra
  instagram: { texto: "", url: "https://www.instagram.com/overlordantony/" },
  x: { texto: "", url: "https://x.com/overlordantony" },
  instalacion: { texto: "Instalar App", url: "#", id: "btn-instalar" },

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
// Icono Instagram (cadena)
const ICONO_INSTAGRAM =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>';
// Icono X (cadena)
const ICONO_X =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
// Icono de instalación (Download)
const ICONO_DESCARGA =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';


function crearEnlace({ texto, url, id }, iconoSvg) {
  const a = document.createElement("a");
  a.className = "pie-enlace";
  // si lleva id (como el botón de instalación), lo añadimos al enlace
  if (id) a.id = id;
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
  nav.appendChild(crearEnlace(PIE.instalacion, ICONO_DESCARGA));
  nav.appendChild(crearEnlace(PIE.instagram, ICONO_INSTAGRAM));
  nav.appendChild(crearEnlace(PIE.x, ICONO_X));
  //(PIE.extras || []).slice(0, 2).forEach(e => nav.appendChild(crearEnlace(e, ICONO_INSTAGRAM)));

  pie.append(texto, nav);
  document.body.appendChild(pie);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", montarPie);
} else {
  montarPie();
}


/* =====================================================
   INSTALACIÓN PWA — MULTINAVEGADOR
   Chrome, Edge, Safari y Firefox
   Conserva el SVG y el diseño original del botón
===================================================== */

let deferredPrompt = null;

const esIOS =
  /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" &&
   navigator.maxTouchPoints > 1);

const esAndroid = /Android/i.test(navigator.userAgent);

const esSafari =
  /Safari/i.test(navigator.userAgent) &&
  !/Chrome|CriOS|Edg|EdgiOS|FxiOS|OPR/i.test(
    navigator.userAgent
  );

const esFirefox =
  /Firefox|FxiOS/i.test(navigator.userAgent);

// Comprobar si se ejecuta como aplicación instalada
function appInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

// Mostrar u ocultar el botón sin tocar su contenido
function actualizarBotonInstalar() {
  const btn = document.getElementById("btn-instalar");
  if (!btn) return;

  btn.hidden = appInstalada();
}

// Guardar el evento nativo de instalación
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  actualizarBotonInstalar();
});

// Capturar el clic incluso si el pie se inyecta después
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#btn-instalar");
  if (!btn) return;

  e.preventDefault();

  if (appInstalada()) return;

  // Chrome y Edge: instalación nativa
  if (deferredPrompt) {
    const promptActual = deferredPrompt;
    deferredPrompt = null;

    try {
      await promptActual.prompt();

      const { outcome } = await promptActual.userChoice;

      if (outcome === "accepted") {
        btn.hidden = true;
      }
    } catch (error) {
      console.error("Error al instalar:", error);
      mostrarGuiaInstalacion();
    }

    return;
  }

  // Safari, Firefox y navegadores sin prompt
  mostrarGuiaInstalacion();
});

// Guía alternativa de instalación
function mostrarGuiaInstalacion() {
  let mensaje = "";

  if (esIOS) {
    mensaje =
      "INSTALAR BITÁCORA\n\n" +
      "1. Abre la página en Safari.\n" +
      "2. Pulsa el botón Compartir.\n" +
      "3. Selecciona Añadir a pantalla de inicio.\n" +
      "4. Confirma pulsando Añadir.\n\n" +
      "¡Listo! Bitácora aparecerá entre tus apps.";
  } else if (esAndroid) {
    mensaje =
      "INSTALAR BITÁCORA\n\n" +
      "1. Abre el menú de tu navegador (⋮).\n" +
      "2. Selecciona Instalar aplicación o " +
      "Añadir a pantalla de inicio.\n" +
      "3. Confirma la instalación.";
  } else if (esSafari) {
    mensaje =
      "INSTALAR BITÁCORA\n\n" +
      "En Safari para macOS:\n" +
      "1. Abre el menú Archivo.\n" +
      "2. Selecciona Añadir al Dock.\n" +
      "3. Confirma la instalación.";
  } else if (esFirefox) {
    mensaje =
      "INSTALAR BITÁCORA\n\n" +
      "Busca la opción para añadir este sitio " +
      "como aplicación en la barra de direcciones " +
      "o en el menú de Firefox.\n\n" +
      "Esta función depende de tu versión " +
      "y sistema operativo.";
  } else {
    mensaje =
      "Para instalar Bitácora, abre el menú " +
      "del navegador y busca Instalar aplicación.";
  }

  alert(mensaje);
}

// Instalación confirmada
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  actualizarBotonInstalar();
});

// Actualizar al regresar a la página
window.addEventListener("pageshow", () => {
  actualizarBotonInstalar();
});

// Inicializar después de montar el pie
if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    actualizarBotonInstalar
  );
} else {
  actualizarBotonInstalar();
}

