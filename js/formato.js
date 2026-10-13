// Formato de texto enriquecido para notas, resúmenes, descripciones y citas.
//
// FORMATO PERSISTENTE: el texto se guarda en Firestore como una cadena normal
// (un subconjunto pequeño de Markdown). No se guarda HTML. Por eso:
//   - los textos antiguos (texto plano) se siguen leyendo igual, sin migración;
//   - los respaldos JSON y la guía HTML conservan las marcas;
//   - si algún día se quita el formato, el texto sigue siendo legible.
//
// Sintaxis admitida:
//   **negrita**   *cursiva*   ++subrayado++   ~~tachado~~   ==resaltado==
//   - elemento de lista        1. elemento de lista numerada
//   [texto](https://enlace)    (solo http, https y mailto)
//
// SEGURIDAD: renderizarHTML() escapa TODO el texto antes de aplicar las marcas y
// solo puede producir las etiquetas de esta lista: p, br, ul, ol, li, strong, em,
// u, del, mark y a. Los enlaces se validan con URL(); cualquier otro protocolo
// (javascript:, data:, etc.) se muestra como texto. Este archivo no toca el DOM
// salvo en montarEditor(), así que se puede probar con Node (tests/).

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

const PROTOCOLOS_SEGUROS = ["http:", "https:", "mailto:"];

// Devuelve la URL normalizada si es segura; si no, null.
export function urlSegura(valor) {
  try {
    const limpio = String(valor ?? "").trim();
    if (!limpio || /[\s<>"'`]/.test(limpio)) return null;
    const url = new URL(limpio);
    return PROTOCOLOS_SEGUROS.includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

const RE_ENLACE = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;

// Aplica las marcas sobre texto YA escapado (no contiene < ni >).
function marcas(html) {
  return html
    .replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?![*\w])/g, "$1<em>$2</em>")
    .replace(/==(\S(?:[^\n]*?\S)?)==/g, "<mark>$1</mark>")
    .replace(/~~(\S(?:[^\n]*?\S)?)~~/g, "<del>$1</del>")
    .replace(/\+\+(\S(?:[^\n]*?\S)?)\+\+/g, "<u>$1</u>");
}

function enLinea(crudo) {
  const enlaces = [];
  // Los enlaces válidos se sustituyen por marcadores para que las marcas
  // (p. ej. **[texto](url)**) funcionen alrededor de ellos.
  let texto = String(crudo).replace(/[\uE000\uE001]/g, "");
  texto = texto.replace(RE_ENLACE, (completo, etiqueta, destino) => {
    const url = urlSegura(destino);
    if (!url) return completo;
    enlaces.push({ etiqueta, url });
    return `\uE000${enlaces.length - 1}\uE001`;
  });
  return marcas(escaparHtml(texto)).replace(/\uE000(\d+)\uE001/g, (_, i) => {
    const e = enlaces[Number(i)];
    return `<a href="${escaparHtml(e.url)}" target="_blank" rel="noopener noreferrer nofollow">${marcas(escaparHtml(e.etiqueta))}</a>`;
  });
}

// Texto (con marcas) → cadena HTML segura.
export function renderizarHTML(texto) {
  const lineas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const bloques = [];
  let actual = null;
  const cerrar = () => { if (actual) { bloques.push(actual); actual = null; } };
  const abrir = (tipo) => { if (!actual || actual.tipo !== tipo) { cerrar(); actual = { tipo, lineas: [] }; } };

  for (const linea of lineas) {
    if (!linea.trim()) { cerrar(); continue; }
    let m;
    if ((m = /^\s*[-•]\s+(.*)$/.exec(linea))) { abrir("ul"); actual.lineas.push(m[1]); }
    else if ((m = /^\s*\d{1,3}[.)]\s+(.*)$/.exec(linea))) { abrir("ol"); actual.lineas.push(m[1]); }
    else { abrir("p"); actual.lineas.push(linea); }
  }
  cerrar();

  return bloques.map((b) => b.tipo === "p"
    ? `<p>${b.lineas.map(enLinea).join("<br>")}</p>`
    : `<${b.tipo}>${b.lineas.map((l) => `<li>${enLinea(l)}</li>`).join("")}</${b.tipo}>`
  ).join("");
}

// Texto (con marcas) → texto plano legible (búsquedas, copiar al portapapeles).
export function aTextoPlano(texto) {
  return String(texto ?? "").replace(/\r\n?/g, "\n")
    .replace(RE_ENLACE, (completo, etiqueta, destino) => (urlSegura(destino) ? `${etiqueta} (${destino})` : completo))
    .replace(/\*\*(\S(?:[^\n]*?\S)?)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*(\S(?:[^*\n]*?\S)?)\*(?![*\w])/g, "$1$2")
    .replace(/==(\S(?:[^\n]*?\S)?)==/g, "$1")
    .replace(/~~(\S(?:[^\n]*?\S)?)~~/g, "$1")
    .replace(/\+\+(\S(?:[^\n]*?\S)?)\+\+/g, "$1")
    .replace(/^\s*[-•]\s+/gm, "• ");
}

// ---------------------------------------------------------------------------
// Editor: barra de herramientas accesible sobre un <textarea> existente.
// El <textarea> sigue siendo el campo real del formulario (mismo id y .value),
// así que el resto del código no cambia. Pegar siempre inserta texto plano.
// ---------------------------------------------------------------------------

export function montarEditor(textarea) {
  if (!textarea || textarea.dataset.editorFormato) return;
  textarea.dataset.editorFormato = "1";

  const envoltorio = document.createElement("div");
  envoltorio.className = "editor-formato";
  textarea.parentNode.insertBefore(envoltorio, textarea);

  const barra = document.createElement("div");
  barra.className = "editor-barra";
  barra.setAttribute("role", "toolbar");
  barra.setAttribute("aria-label", "Formato de texto");
  if (textarea.id) barra.setAttribute("aria-controls", textarea.id);

  const vista = document.createElement("div");
  vista.className = "editor-vista texto-formato";
  vista.hidden = true;

  const ayuda = document.createElement("details");
  ayuda.className = "editor-ayuda";
  ayuda.innerHTML = `<summary>Ayuda de formato</summary>
    <p><code>**negrita**</code> · <code>*cursiva*</code> · <code>++subrayado++</code> · <code>~~tachado~~</code> · <code>==resaltado==</code></p>
    <p><code>- elemento</code> (lista) · <code>1. elemento</code> (lista numerada) · <code>[texto](https://…)</code> (enlace)</p>
    <p>Atajos: Ctrl/⌘ + B, I, U y K (enlace). El texto sin formato se muestra tal cual.</p>`;

  envoltorio.append(barra, textarea, vista, ayuda);

  function avisar() { textarea.dispatchEvent(new Event("input", { bubbles: true })); }

  function envolver(marca) {
    const { selectionStart: i, selectionEnd: f, value: v } = textarea;
    const seleccion = v.slice(i, f);
    const m = marca.length;
    // Para la cursiva (*), no confundir con los asteriscos de una negrita (**).
    const sinAsteriscoExtra = (pos) => marca !== "*" || v[pos] !== "*";
    const rodeado = v.slice(i - m, i) === marca && v.slice(f, f + m) === marca
      && sinAsteriscoExtra(i - m - 1) && sinAsteriscoExtra(f + m);

    if (rodeado) {
      textarea.setRangeText(seleccion, i - m, f + m, "end");
      textarea.setSelectionRange(i - m, i - m + seleccion.length);
    } else if (seleccion.length > 2 * m && seleccion.startsWith(marca) && seleccion.endsWith(marca)
        && !(marca === "*" && seleccion[m] === "*")) {
      const interior = seleccion.slice(m, -m);
      textarea.setRangeText(interior, i, f, "end");
      textarea.setSelectionRange(i, i + interior.length);
    } else if (seleccion) {
      textarea.setRangeText(marca + seleccion + marca, i, f, "end");
      textarea.setSelectionRange(i + m, i + m + seleccion.length);
    } else {
      textarea.setRangeText(marca + marca, i, f, "end");
      textarea.setSelectionRange(i + m, i + m);
    }
    textarea.focus();
    avisar();
  }

  function alternarLista(ordenada) {
    const v = textarea.value;
    const ini = v.lastIndexOf("\n", textarea.selectionStart - 1) + 1;
    let fin = v.indexOf("\n", textarea.selectionEnd);
    if (fin === -1) fin = v.length;
    const lineas = v.slice(ini, fin).split("\n");
    const reMarca = ordenada ? /^\s*\d{1,3}[.)]\s+/ : /^\s*[-•]\s+/;
    const reCualquiera = /^\s*(?:[-•]|\d{1,3}[.)])\s+/;
    const todasConMarca = lineas.every((l) => reMarca.test(l));
    const nuevas = lineas.map((l, n) => todasConMarca
      ? l.replace(reMarca, "")
      : (ordenada ? `${n + 1}. ` : "- ") + l.replace(reCualquiera, ""));
    textarea.setRangeText(nuevas.join("\n"), ini, fin, "select");
    textarea.focus();
    avisar();
  }

  function insertarEnlace() {
    const { selectionStart: i, selectionEnd: f, value: v } = textarea;
    const seleccion = v.slice(i, f);
    const destino = window.prompt("Dirección del enlace (https://…)", "https://");
    if (destino === null) return;
    const url = urlSegura(destino);
    if (!url) {
      window.alert("Enlace no válido. Solo se admiten direcciones http, https o mailto.");
      return;
    }
    const etiqueta = (seleccion || "texto del enlace").replace(/[\[\]\n]/g, " ");
    const nuevo = `[${etiqueta}](${url})`;
    textarea.setRangeText(nuevo, i, f, "end");
    textarea.focus();
    avisar();
  }

  const botones = [
    { html: "<strong>N</strong>", nombre: "Negrita", atajo: "Ctrl+B", accion: () => envolver("**") },
    { html: "<em>C</em>", nombre: "Cursiva", atajo: "Ctrl+I", accion: () => envolver("*") },
    { html: "<u>S</u>", nombre: "Subrayado", atajo: "Ctrl+U", accion: () => envolver("++") },
    { html: "<s>T</s>", nombre: "Tachado", accion: () => envolver("~~") },
    { html: "<mark>R</mark>", nombre: "Resaltado", accion: () => envolver("==") },
    { html: "•", nombre: "Lista con viñetas", accion: () => alternarLista(false) },
    { html: "1.", nombre: "Lista numerada", accion: () => alternarLista(true) },
    { html: "Enlace", nombre: "Insertar enlace", atajo: "Ctrl+K", accion: insertarEnlace }
  ];

  const botonesFormato = botones.map((b) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "editor-boton";
    el.innerHTML = b.html;
    el.setAttribute("aria-label", b.atajo ? `${b.nombre} (${b.atajo})` : b.nombre);
    el.title = b.atajo ? `${b.nombre} (${b.atajo})` : b.nombre;
    el.addEventListener("click", b.accion);
    barra.appendChild(el);
    return el;
  });

  const botonVista = document.createElement("button");
  botonVista.type = "button";
  botonVista.className = "editor-boton editor-boton-vista";
  botonVista.textContent = "Vista previa";
  botonVista.setAttribute("aria-pressed", "false");
  barra.appendChild(botonVista);

  function mostrarVista(activa) {
    botonVista.setAttribute("aria-pressed", String(activa));
    botonVista.textContent = activa ? "Editar" : "Vista previa";
    botonesFormato.forEach((b) => { b.disabled = activa; });
    textarea.hidden = activa;
    vista.hidden = !activa;
    if (activa) {
      vista.innerHTML = textarea.value.trim()
        ? renderizarHTML(textarea.value)
        : `<p class="meta">No hay nada que mostrar todavía.</p>`;
    }
  }
  botonVista.addEventListener("click", () => mostrarVista(botonVista.getAttribute("aria-pressed") !== "true"));
  textarea.form?.addEventListener("reset", () => mostrarVista(false));

  textarea.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const tecla = e.key.toLowerCase();
    const acciones = { b: () => envolver("**"), i: () => envolver("*"), u: () => envolver("++"), k: insertarEnlace };
    if (acciones[tecla]) { e.preventDefault(); acciones[tecla](); }
  });
}
