import {
  obtenerLibros,
  obtenerLibro,
  obtenerTodosLosLibros,
  obtenerSubcolecciones
} from "./db.js";
import { renderizarHTML } from "./formato.js";

// Convierte Timestamps de Firestore (y cualquier estructura anidada)
// a algo que JSON.stringify pueda escribir bien.
function limpiar(valor) {
  if (valor && typeof valor.toDate === "function") return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(limpiar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpiar(v)]));
  }
  return valor;
}

function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}

async function armarRespaldo(libros) {
  const completos = await Promise.all(
    libros.map(async (l) => ({ ...l, ...(await obtenerSubcolecciones(l.id)) }))
  );
  return { app: "bitacora-de-lectura", version: 1, exportadoEn: new Date().toISOString(), libros: limpiar(completos) };
}

// Respaldo .json de una biblioteca (la propia, o la de uidObjetivo si eres admin).
export async function exportarBiblioteca(uidObjetivo) {
  const libros = await obtenerLibros(uidObjetivo || undefined);
  const respaldo = await armarRespaldo(libros);
  descargar(`respaldo-bitacora-${fechaHoy()}.json`, JSON.stringify(respaldo, null, 2), "application/json");
}

// Respaldo de TODOS los usuarios (solo admin).
export async function exportarTodo() {
  const libros = await obtenerTodosLosLibros();
  const respaldo = await armarRespaldo(libros);
  descargar(`respaldo-completo-bitacora-${fechaHoy()}.json`, JSON.stringify(respaldo, null, 2), "application/json");
}

// ---------- Guía de repaso exportable (HTML autónomo) ----------

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const RELEVANCIA = { principal: "Principal", secundario: "Secundario", menor: "Menor", mencionado: "Solo mencionado" };
const ORDEN_RELEVANCIA = ["principal", "secundario", "menor", "mencionado"];

// Tema con el que se abre la guía: el que tengas activo en la app al exportar.
// La guía incluye ambos temas y un botón para alternarlos.
function temaActual() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

function htmlGuia(libro, sub, tema = "dark") {
  const pct = libro.totalPaginas ? Math.round((libro.paginaActual / libro.totalPaginas) * 100) : null;

  const capitulos = sub.capitulos.map(c => `
    <article class="card">
      <span class="badge">Capítulo ${esc(c.numero)}${c.rangoPaginas && (c.rangoPaginas.inicio || c.rangoPaginas.fin) ? ` · pág. ${esc(c.rangoPaginas.inicio ?? "?")}–${esc(c.rangoPaginas.fin ?? "?")}` : ""}</span>
      <h3>${esc(c.titulo || "Capítulo " + c.numero)}</h3>
      ${c.resumen ? `<div class="fmt">${renderizarHTML(c.resumen)}</div>` : ""}
      ${c.puntosClave?.length ? `<ul>${c.puntosClave.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
    </article>`).join("");

  const personajesOrdenados = [...sub.personajes].sort(
    (a, b) => ORDEN_RELEVANCIA.indexOf(a.relevancia) - ORDEN_RELEVANCIA.indexOf(b.relevancia)
  );
  const personajes = personajesOrdenados.map(p => `
    <article class="card persona rel-${esc(p.relevancia)}">
      <span class="badge">${esc(RELEVANCIA[p.relevancia] || p.relevancia || "")}</span>
      <h3>${esc(p.nombre)}${p.rol ? ` <small>· ${esc(p.rol)}</small>` : ""}</h3>
      ${p.alias?.length ? `<p class="meta">También: ${p.alias.map(esc).join(", ")}</p>` : ""}
      ${p.descripcion ? `<div class="fmt">${renderizarHTML(p.descripcion)}</div>` : ""}
      ${p.conexiones?.length ? `<p class="meta">${p.conexiones.map(esc).join(" → ")}</p>` : ""}
    </article>`).join("");

  const conceptos = sub.conceptos.map(c => `
    <article class="card">
      <h3>${esc(c.nombre)}</h3>
      ${c.significado ? `<div class="fmt">${renderizarHTML(c.significado)}</div>` : ""}
    </article>`).join("");

  const citas = sub.citas.map(c => `
    <blockquote class="${c.favorita ? "fav" : ""}">
      <p>“${esc(c.texto)}”</p>
      <footer>${c.pagina ? `pág. ${esc(c.pagina)}` : ""}${c.pagina && c.etiqueta ? " · " : ""}${esc(c.etiqueta || "")}${c.favorita ? " ★" : ""}</footer>
      ${c.nota ? `<div class="fmt nota-cita">${renderizarHTML(c.nota)}</div>` : ""}
    </blockquote>`).join("");

  const seccion = (titulo, contenido, clase = "grid") =>
    contenido ? `<section><h2>${titulo}</h2><div class="${clase}">${contenido}</div></section>` : "";

  return `<!DOCTYPE html>
<html lang="es" data-theme="${tema}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guía — ${esc(libro.titulo)}</title>
<style>
:root,:root[data-theme="light"]{color-scheme:light;--bg:#f4f6fa;--card:#fff;--text:#161a20;--muted:#677086;--line:#dde1e9;--accent:#3f6fd1;--accent-soft:rgba(63,111,209,.1);--oro:#b5791a}
:root[data-theme="dark"]{color-scheme:dark;--bg:#12151a;--card:#1b1f27;--text:#e7eaf0;--muted:#8992a3;--line:#2b303c;--accent:#5b8def;--accent-soft:rgba(91,141,239,.16);--oro:#e8b339}
.tema{position:fixed;top:.8rem;right:.8rem;z-index:10;font:inherit;font-size:.8rem;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:999px;padding:.4rem .9rem;cursor:pointer}
.tema:hover,.tema:focus-visible{border-color:var(--accent);outline:none}
@media print{:root,:root[data-theme="dark"]{color-scheme:light;--bg:#fff;--card:#fff;--text:#161a20;--muted:#677086;--line:#dde1e9;--accent:#3f6fd1;--accent-soft:rgba(63,111,209,.1);--oro:#b5791a}.tema{display:none}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
header{padding:2rem 1.2rem 1.2rem;max-width:1000px;margin:0 auto;border-bottom:1px solid var(--line)}
header h1{margin:0 0 .2rem;font-size:1.7rem}
header p{margin:.15rem 0;color:var(--muted)}
.barra{height:6px;background:var(--line);border-radius:999px;overflow:hidden;margin-top:.8rem;max-width:420px}
.barra div{height:100%;background:var(--accent)}
main{max-width:1000px;margin:0 auto;padding:0 1.2rem 3rem}
section{margin-top:2rem}
h2{font-size:1.15rem;margin:0 0 .8rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1rem}
.card{background:var(--card);border:1px solid var(--line);border-top:4px solid var(--accent);border-radius:12px;padding:1rem 1.1rem}
.card h3{margin:.2rem 0 .5rem;font-size:1.02rem}
.card h3 small{color:var(--muted);font-weight:500}
.card p{margin:.4rem 0;font-size:.9rem}
.card ul{margin:.4rem 0 0;padding-left:1.1rem;font-size:.88rem}
.badge{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.meta{color:var(--muted)}
.rel-menor,.rel-mencionado{opacity:.7}
blockquote{margin:0 0 .8rem;padding:.9rem 1.1rem;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:10px}
blockquote.fav{border-left-color:var(--oro)}
blockquote p{margin:0 0 .4rem;font-size:1rem}
blockquote footer{font-size:.78rem;color:var(--muted)}
.notas{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1rem 1.1rem;font-size:.92rem}
.notas h3{margin:.8rem 0 .3rem;font-size:.95rem}.notas h3:first-child{margin-top:0}
.fmt p{margin:.4rem 0}.fmt ul,.fmt ol{margin:.4rem 0;padding-left:1.3rem;font-size:.9rem}.fmt li{margin:.15rem 0}
.fmt mark{background:rgba(232,179,57,.38);color:inherit;padding:0 .15em;border-radius:3px}
.fmt a{color:var(--accent)}
.nota-cita{margin-top:.5rem;font-size:.85rem;color:var(--muted)}
footer.pie{text-align:center;color:var(--muted);font-size:.75rem;padding:1rem}
</style>
</head>
<body>
<button type="button" id="tema" class="tema" aria-label="${tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}">${tema === "dark" ? "☀️ Claro" : "🌙 Oscuro"}</button>
<header>
  <h1>${esc(libro.titulo)}</h1>
  <p>${esc(libro.autor)}${libro.generos?.length ? " · " + libro.generos.map(esc).join(", ") : ""}</p>
  ${pct !== null ? `<p>${esc(libro.paginaActual)} / ${esc(libro.totalPaginas)} páginas · ${pct}%</p><div class="barra"><div style="width:${Math.min(pct, 100)}%"></div></div>` : ""}
</header>
<main>
  ${seccion("Capítulos", capitulos)}
  ${seccion("Personajes", personajes)}
  ${seccion("Conceptos", conceptos)}
  ${seccion("Citas", citas, "")}
  ${libro.notas || libro.observaciones ? `<section><h2>Notas</h2><div class="notas">${libro.notas ? `<h3>Notas</h3><div class="fmt">${renderizarHTML(libro.notas)}</div>` : ""}${libro.observaciones ? `<h3>Observaciones</h3><div class="fmt">${renderizarHTML(libro.observaciones)}</div>` : ""}</div></section>` : ""}
</main>
<footer class="pie">Generado el ${fechaHoy()} desde Bitácora de lectura</footer>
<script>(function(){var r=document.documentElement,b=document.getElementById("tema");function ap(t){r.setAttribute("data-theme",t);b.textContent=t==="dark"?"☀️ Claro":"🌙 Oscuro";b.setAttribute("aria-label",t==="dark"?"Cambiar a tema claro":"Cambiar a tema oscuro");}b.addEventListener("click",function(){ap(r.getAttribute("data-theme")==="dark"?"light":"dark");});})();</script>
</body>
</html>`;
}

export async function exportarGuia(libroId) {
  const [libro, sub] = await Promise.all([obtenerLibro(libroId), obtenerSubcolecciones(libroId)]);
  if (!libro) throw new Error("Libro no encontrado");
  const nombre = libro.titulo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "libro";
  descargar(`guia-${nombre}.html`, htmlGuia(limpiar(libro), limpiar(sub), temaActual()), "text/html");
}
