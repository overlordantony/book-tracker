import { vigilarSesion, logout } from "./auth.js";
import {
  crearLibro,
  obtenerLibros,
  obtenerCitasDeLibros,
  restaurarDePapelera,
  eliminarLibroDefinitivo,
  contarContenido
} from "./db.js";
import { iniciarToggleTema } from "./theme.js";
import { obtenerPerfil } from "./roles.js";
import { renderEstadisticas } from "./estadisticas.js";
import { exportarBiblioteca } from "./exportar.js";
import { prepararRespaldo, restaurarRespaldo } from "./importar.js";
import { confirmarAccion, negrita } from "./modal.js";
import { renderizarHTML, aTextoPlano, montarEditor } from "./formato.js";

iniciarToggleTema();

// Si viene ?uid=... estamos viendo la biblioteca de otra persona
// (solo posible para un admin; las reglas de Firestore lo hacen cumplir).
const uidObjetivo = new URLSearchParams(window.location.search).get("uid");
const sufijoUid = uidObjetivo ? `&uid=${encodeURIComponent(uidObjetivo)}` : "";

let todosLosLibros = [];   // libros activos (sin los de la papelera)
let librosPapelera = [];   // libros movidos a la papelera
let citasCache = null;

// Preferencias de visualización (solo comodidad; si el navegador bloquea el
// almacenamiento, la app funciona igual con los valores por defecto).
function leerPref(clave) { try { return localStorage.getItem(clave); } catch { return null; } }
function guardarPref(clave, valor) { try { localStorage.setItem(clave, valor); } catch { /* sin almacenamiento */ } }

// ---------- Utilidades ----------
function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}
function norm(s) {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function listaDesdeTexto(texto) {
  return texto.split(",").map(s => s.trim()).filter(Boolean);
}
function porcentaje(libro) {
  return libro.totalPaginas ? Math.round(((libro.paginaActual || 0) / libro.totalPaginas) * 100) : null;
}

// ---------- Sesión ----------
document.getElementById("btnSalir").addEventListener("click", async () => {
  await logout();
  window.location.href = "index.html";
});

vigilarSesion(async (usuario) => {
  if (!usuario) {
    window.location.href = "index.html";
    return;
  }

  const perfil = await obtenerPerfil(usuario.uid);
  if (!perfil || perfil.estado !== "Activo") {
    const aviso = document.getElementById("cuentaInactiva");
    aviso.hidden = false;
    aviso.textContent = !perfil || perfil.estado === "Pendiente"
      ? "Tu cuenta está pendiente de aprobación por un administrador."
      : "Tu cuenta está inactiva. Contacta al administrador.";
    return;
  }
  document.getElementById("contenidoApp").hidden = false;

  if (perfil.rol === "Admin") {
    document.getElementById("linkAdmin").style.display = "inline-block";
  }

  if (uidObjetivo && uidObjetivo !== usuario.uid) {
    document.getElementById("pestañaAgregar").style.display = "none";
    document.getElementById("btnCargarRespaldo").hidden = true; // restaurar solo sobre la propia biblioteca
    document.getElementById("pestañaPapelera").style.display = "none"; // la papelera es solo del dueño
    const aviso = document.getElementById("avisoVistaAjena");
    aviso.hidden = false;
    aviso.textContent = "Estás viendo la biblioteca de otro usuario, en modo solo lectura.";
  }

  await cargarLibros();
});

// ---------- Pestañas ----------
const pestañas = document.querySelectorAll(".pestañas .pestaña");
const vistas = {
  biblioteca: document.getElementById("vistaBiblioteca"),
  estadisticas: document.getElementById("vistaEstadisticas"),
  citas: document.getElementById("vistaCitas"),
  papelera: document.getElementById("vistaPapelera"),
  agregar: document.getElementById("vistaAgregar")
};

pestañas.forEach(btn => {
  btn.addEventListener("click", () => {
    pestañas.forEach(b => b.classList.remove("activa"));
    btn.classList.add("activa");
    Object.values(vistas).forEach(v => v.hidden = true);
    const vista = btn.dataset.vista;
    vistas[vista].hidden = false;

    if (vista === "estadisticas") {
      renderEstadisticas(todosLosLibros, document.getElementById("contenedorEstadisticas"));
    }
    if (vista === "citas") cargarCitas();
    if (vista === "papelera") renderPapelera();
  });
});

// ---------- Formulario: agregar libro ----------
montarEditor(document.getElementById("notas"));
montarEditor(document.getElementById("observaciones"));

const form = document.getElementById("formLibro");
const formError = document.getElementById("formError");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const datos = {
    titulo: document.getElementById("titulo").value.trim(),
    autor: document.getElementById("autor").value.trim(),
    portadaUrl: document.getElementById("portadaUrl").value.trim(),
    url: document.getElementById("url").value.trim(),
    generos: listaDesdeTexto(document.getElementById("generos").value),
    etiquetas: listaDesdeTexto(document.getElementById("etiquetas").value),
    estado: document.getElementById("estado").value,
    formato: document.getElementById("formato").value,
    totalPaginas: Number(document.getElementById("totalPaginas").value) || null,
    paginaActual: Number(document.getElementById("paginaActual").value) || 0,
    fechaInicio: document.getElementById("fechaInicio").value || null,
    fechaFin: document.getElementById("fechaFin").value || null,
    calificacion: Number(document.getElementById("calificacion").value) || null,
    notas: document.getElementById("notas").value.trim(),
    observaciones: document.getElementById("observaciones").value.trim()
  };

  try {
    await crearLibro(datos);
    form.reset();
    citasCache = null;
    await cargarLibros();
    document.querySelector('.pestañas .pestaña[data-vista="biblioteca"]').click();
  } catch (err) {
    formError.textContent = "No se pudo guardar: " + err.message;
    formError.hidden = false;
  }
});

// ---------- Biblioteca: carga, filtros, orden y vistas ----------
const listaLibros = document.getElementById("listaLibros");
const bibliotecaVacia = document.getElementById("bibliotecaVacia");
const buscador = document.getElementById("buscador");
const selectOrden = document.getElementById("orden");
const contador = document.getElementById("contadorLibros");
const btnMasLibros = document.getElementById("btnMasLibros");
const panelFiltros = document.getElementById("panelFiltros");
const contadorFiltros = document.getElementById("contadorFiltros");
const filtrosActivos = document.getElementById("filtrosActivos");
const btnVistaLista = document.getElementById("btnVistaLista");
const btnVistaCuadricula = document.getElementById("btnVistaCuadricula");

const FILTROS = {
  estado: document.getElementById("filtroEstado"),
  genero: document.getElementById("filtroGenero"),
  etiqueta: document.getElementById("filtroEtiqueta"),
  formato: document.getElementById("filtroFormato"),
  calificacion: document.getElementById("filtroCalificacion"),
  progreso: document.getElementById("filtroProgreso")
};
const NOMBRE_FILTRO = {
  estado: "Estado", genero: "Género", etiqueta: "Etiqueta",
  formato: "Formato", calificacion: "Calificación", progreso: "Progreso"
};

const ESTADO_LABEL = {
  pendiente: "Pendiente", leyendo: "Leyendo", pausado: "Pausado",
  terminado: "Terminado", descartado: "Descartado"
};
const POR_PAGINA = 24;
let visibles = POR_PAGINA;
let modoVista = leerPref("bitacora.vista") === "cuadricula" ? "cuadricula" : "lista";
if (["reciente", "titulo", "autor", "progreso", "calificacion"].includes(leerPref("bitacora.orden"))) {
  selectOrden.value = leerPref("bitacora.orden");
}
panelFiltros.open = window.innerWidth > 640;

function etiquetaEstado(estado) {
  return ESTADO_LABEL[String(estado || "").toLowerCase()] || estado || "—";
}

async function cargarLibros() {
  try {
    const todos = await obtenerLibros(uidObjetivo || undefined);
    todosLosLibros = todos.filter(l => !l.eliminadoEn);
    librosPapelera = todos.filter(l => l.eliminadoEn)
      .sort((a, b) => (b.eliminadoEn?.toMillis?.() || 0) - (a.eliminadoEn?.toMillis?.() || 0));
    citasCache = null;
    poblarFiltros();
    actualizarContadorPapelera();
    renderBiblioteca();
    if (!vistas.papelera.hidden) renderPapelera();
  } catch (err) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = "No se pudo cargar la biblioteca: " + err.message;
  }
}

function llenarSelect(select, primeraOpcion, valores) {
  const actual = select.value;
  select.innerHTML = `<option value="">${primeraOpcion}</option>` +
    valores.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if (valores.includes(actual)) select.value = actual;
}

function poblarFiltros() {
  const unicos = (campo) => [...new Set(todosLosLibros.flatMap(l => l[campo] || []))]
    .sort((a, b) => a.localeCompare(b, "es"));
  llenarSelect(FILTROS.genero, "Todos", unicos("generos"));
  llenarSelect(FILTROS.etiqueta, "Todas", unicos("etiquetas"));
}

function aplicarOrden(lista) {
  const modo = selectOrden.value;
  const copia = [...lista];
  const ms = (l) => l.creadoEn?.toMillis?.() || 0;
  if (modo === "titulo") copia.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "es"));
  else if (modo === "autor") copia.sort((a, b) => (a.autor || "").localeCompare(b.autor || "", "es"));
  else if (modo === "progreso") copia.sort((a, b) => (porcentaje(b) ?? -1) - (porcentaje(a) ?? -1));
  else if (modo === "calificacion") copia.sort((a, b) => (b.calificacion ?? -1) - (a.calificacion ?? -1));
  else copia.sort((a, b) => ms(b) - ms(a));
  return copia;
}

function coincideProgreso(libro, filtro) {
  const pct = porcentaje(libro);
  if (filtro === "sin-total") return pct === null;
  if (pct === null) return false;
  if (filtro === "no-iniciado") return pct === 0;
  if (filtro === "en-curso") return pct > 0 && pct < 100;
  if (filtro === "completo") return pct >= 100;
  return true;
}

function coincideCalificacion(libro, filtro) {
  const c = libro.calificacion || 0;
  if (filtro === "sin") return !c;
  if (filtro === "5") return c === 5;
  if (filtro === "4+") return c >= 4;
  if (filtro === "3+") return c >= 3;
  return true;
}

// Todos los filtros son combinables (se cumplen a la vez).
function pasaFiltros(l, texto) {
  const f = Object.fromEntries(Object.entries(FILTROS).map(([k, el]) => [k, el.value]));
  if (f.estado && l.estado !== f.estado) return false;
  if (f.genero && !(l.generos || []).includes(f.genero)) return false;
  if (f.etiqueta && !(l.etiquetas || []).includes(f.etiqueta)) return false;
  if (f.formato && l.formato !== f.formato) return false;
  if (f.calificacion && !coincideCalificacion(l, f.calificacion)) return false;
  if (f.progreso && !coincideProgreso(l, f.progreso)) return false;
  if (texto) {
    const pajar = norm([l.titulo, l.autor, ...(l.generos || []), ...(l.etiquetas || [])].join(" "));
    if (!pajar.includes(texto)) return false;
  }
  return true;
}

function filtrosEnUso() {
  const lista = Object.entries(FILTROS)
    .filter(([, el]) => el.value)
    .map(([clave, el]) => ({
      etiqueta: `${NOMBRE_FILTRO[clave]}: ${el.options[el.selectedIndex].textContent}`,
      quitar: () => { el.value = ""; }
    }));
  if (buscador.value.trim()) {
    lista.unshift({ etiqueta: `Búsqueda: “${buscador.value.trim()}”`, quitar: () => { buscador.value = ""; } });
  }
  return lista;
}

function pintarFiltrosActivos() {
  const activos = filtrosEnUso();
  const nFiltros = activos.filter(a => !a.etiqueta.startsWith("Búsqueda")).length;
  contadorFiltros.hidden = !nFiltros;
  contadorFiltros.textContent = nFiltros;
  filtrosActivos.hidden = !activos.length;
  filtrosActivos.innerHTML = "";
  if (!activos.length) return;
  activos.forEach(a => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip-filtro";
    b.textContent = a.etiqueta + " ×";
    b.setAttribute("aria-label", `Quitar filtro ${a.etiqueta}`);
    b.addEventListener("click", () => { a.quitar(); cambioFiltros(); });
    filtrosActivos.appendChild(b);
  });
  const limpiar = document.createElement("button");
  limpiar.type = "button";
  limpiar.className = "enlace-boton";
  limpiar.textContent = "Limpiar filtros";
  limpiar.addEventListener("click", () => { activos.forEach(a => a.quitar()); cambioFiltros(); });
  filtrosActivos.appendChild(limpiar);
}

// Cualquier cambio de búsqueda, filtro u orden vuelve a la primera página.
function cambioFiltros() {
  visibles = POR_PAGINA;
  renderBiblioteca();
}

function renderBiblioteca() {
  const texto = norm(buscador.value);
  const lista = aplicarOrden(todosLosLibros.filter(l => pasaFiltros(l, texto)));
  pintarFiltrosActivos();

  listaLibros.innerHTML = "";
  listaLibros.className = "lista-libros" + (modoVista === "cuadricula" ? " vista-cuadricula" : "");
  btnVistaLista.classList.toggle("activo", modoVista === "lista");
  btnVistaLista.setAttribute("aria-pressed", String(modoVista === "lista"));
  btnVistaCuadricula.classList.toggle("activo", modoVista === "cuadricula");
  btnVistaCuadricula.setAttribute("aria-pressed", String(modoVista === "cuadricula"));

  const mostrados = Math.min(visibles, lista.length);
  contador.textContent = lista.length === todosLosLibros.length
    ? `${mostrados} de ${todosLosLibros.length}`
    : `${mostrados} de ${lista.length} coincidencias · ${todosLosLibros.length} en total`;
  btnMasLibros.hidden = lista.length <= visibles;
  btnMasLibros.textContent = `Mostrar más (${Math.max(lista.length - visibles, 0)} restantes)`;

  if (!todosLosLibros.length) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = uidObjetivo
      ? "Esta persona todavía no ha agregado libros."
      : librosPapelera.length
        ? 'No tienes libros activos. Los que eliminaste están en la pestaña "Papelera".'
        : 'Todavía no has agregado ningún libro. Ve a "Agregar libro" para empezar tu bitácora.';
    return;
  }
  if (!lista.length) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = "Ningún libro coincide con los filtros.";
    return;
  }
  bibliotecaVacia.hidden = true;
  lista.slice(0, visibles).forEach(libro => listaLibros.appendChild(tarjetaLibro(libro)));
}

buscador.addEventListener("input", cambioFiltros);
Object.values(FILTROS).forEach(el => el.addEventListener("change", cambioFiltros));
selectOrden.addEventListener("change", () => { guardarPref("bitacora.orden", selectOrden.value); cambioFiltros(); });

btnMasLibros.addEventListener("click", () => {
  const antes = Math.min(visibles, listaLibros.children.length);
  visibles += POR_PAGINA;
  renderBiblioteca();
  listaLibros.children[antes]?.focus(); // el foco pasa al primer libro nuevo (teclado / lector de pantalla)
});

function cambiarVista(modo) {
  modoVista = modo;
  guardarPref("bitacora.vista", modo);
  renderBiblioteca();
}
btnVistaLista.addEventListener("click", () => cambiarVista("lista"));
btnVistaCuadricula.addEventListener("click", () => cambiarVista("cuadricula"));

function portadaHtml(libro, inicial) {
  return libro.portadaUrl
    ? `<img src="${escapeHtml(libro.portadaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<span>${inicial}</span>`;
}

function enlazarFallbackPortada(contenedor, inicial) {
  // Si la portada no carga (URL rota o bloqueada), vuelve a la inicial.
  const img = contenedor.querySelector(".portada-mini img");
  if (img) img.addEventListener("error", () => { img.parentElement.innerHTML = `<span>${inicial}</span>`; });
}

// Tarjeta de libro: es un enlace real (accesible con teclado) y sirve para
// las dos vistas; el CSS decide si se ve como fila o como tarjeta.
function tarjetaLibro(libro) {
  const pct = porcentaje(libro);
  const inicial = escapeHtml((libro.titulo || "?").trim().charAt(0).toUpperCase());
  const a = document.createElement("a");
  a.className = `fila-libro tarjeta-libro estado-${String(libro.estado || "").toLowerCase()}`;
  a.href = `detalle.html?id=${encodeURIComponent(libro.id)}${sufijoUid}`;
  a.innerHTML = `
    <div class="portada-mini">${portadaHtml(libro, inicial)}</div>
    <div class="fila-libro-principal">
      <h3>${escapeHtml(libro.titulo)}</h3>
      <p class="autor">${escapeHtml(libro.autor)}</p>
      ${(libro.generos || []).length ? `<p class="generos">${libro.generos.map(escapeHtml).join(" · ")}</p>` : ""}
    </div>
    <div class="fila-libro-datos">
      <span class="etiqueta-estado">${escapeHtml(etiquetaEstado(libro.estado))}</span>
      ${pct !== null ? `
        <span class="num progreso">${libro.paginaActual || 0}/${libro.totalPaginas} · ${pct}%</span>
        <div class="barra-progreso mini-progreso" role="progressbar" aria-label="Progreso de lectura"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(pct, 100)}">
          <div class="barra-progreso-relleno" style="width:${Math.min(pct, 100)}%"></div>
        </div>` : ""}
      ${libro.calificacion ? `<span class="num calificacion" aria-label="Calificación ${libro.calificacion} de 5">★ ${libro.calificacion}</span>` : ""}
    </div>
  `;
  enlazarFallbackPortada(a, inicial);
  return a;
}

// ---------- Papelera ----------
const listaPapelera = document.getElementById("listaPapelera");
const papeleraVacia = document.getElementById("papeleraVacia");
const estadoPapelera = document.getElementById("estadoPapelera");
const contadorPapelera = document.getElementById("contadorPapelera");

function actualizarContadorPapelera() {
  contadorPapelera.hidden = !librosPapelera.length;
  contadorPapelera.textContent = librosPapelera.length;
}

function avisarPapelera(texto, esError = false) {
  estadoPapelera.hidden = !texto;
  estadoPapelera.textContent = texto || "";
  estadoPapelera.classList.toggle("error", esError);
}

function renderPapelera() {
  listaPapelera.innerHTML = "";
  papeleraVacia.hidden = librosPapelera.length > 0;
  librosPapelera.forEach(libro => {
    const inicial = escapeHtml((libro.titulo || "?").trim().charAt(0).toUpperCase());
    const fecha = libro.eliminadoEn?.toDate?.().toLocaleDateString("es");
    const div = document.createElement("div");
    div.className = "fila-libro";
    div.innerHTML = `
      <div class="portada-mini">${portadaHtml(libro, inicial)}</div>
      <div class="fila-libro-principal">
        <h3>${escapeHtml(libro.titulo)}</h3>
        <p class="autor">${escapeHtml(libro.autor)}</p>
        ${fecha ? `<p class="generos">En la papelera desde el ${escapeHtml(fecha)}</p>` : ""}
      </div>
      <div class="fila-libro-datos acciones-papelera">
        <button type="button" class="boton-fantasma btn-restaurar">Restaurar</button>
        <button type="button" class="boton-fantasma boton-borrar btn-eliminar-def">Eliminar definitivamente</button>
      </div>`;
    enlazarFallbackPortada(div, inicial);
    div.querySelector(".btn-restaurar").addEventListener("click", () => restaurarLibro(libro));
    div.querySelector(".btn-eliminar-def").addEventListener("click", () => eliminarDefinitivamente(libro));
    listaPapelera.appendChild(div);
  });
}

async function restaurarLibro(libro) {
  avisarPapelera("");
  try {
    await restaurarDePapelera(libro.id);
    await cargarLibros();
    avisarPapelera(`«${libro.titulo}» volvió a tu biblioteca.`);
  } catch (err) {
    avisarPapelera("No se pudo restaurar: " + err.message, true);
  }
}

async function eliminarDefinitivamente(libro) {
  avisarPapelera("");
  let c;
  try {
    c = await contarContenido(libro.id);
  } catch (err) {
    avisarPapelera("No se pudo preparar la eliminación: " + err.message, true);
    return;
  }
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  const ok = await confirmarAccion({
    titulo: "Eliminar definitivamente",
    mensaje: [
      "Se eliminará ", negrita(libro.titulo), " junto con su contenido: ",
      `${plural(c.capitulos, "capítulo", "capítulos")}, ${plural(c.personajes, "personaje", "personajes")}, `,
      `${plural(c.citas, "cita", "citas")} y ${plural(c.conceptos, "concepto", "conceptos")}.`
    ],
    aviso: "Esta acción no se puede deshacer. Si quieres conservar una copia, cancela y usa antes «Descargar respaldo» en la biblioteca.",
    textoConfirmar: "Eliminar definitivamente",
    onConfirmar: (progreso) => eliminarLibroDefinitivo(libro.id, progreso)
  });
  if (!ok) return;
  await cargarLibros();
  avisarPapelera(`«${libro.titulo}» se eliminó definitivamente.`);
}

// ---------- Respaldo ----------
document.getElementById("btnRespaldo").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparando…";
  try {
    await exportarBiblioteca(uidObjetivo || undefined);
  } catch (err) {
    alert("No se pudo generar el respaldo: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});

// ---------- Cargar respaldo (restaurar) ----------
const btnCargarRespaldo = document.getElementById("btnCargarRespaldo");
const inputRespaldo = document.getElementById("inputRespaldo");
const modalRestaurar = document.getElementById("modalRestaurar");
const modalResumen = document.getElementById("modalRestaurarResumen");
const modalError = document.getElementById("modalRestaurarError");
const btnConfirmarRestaurar = document.getElementById("btnConfirmarRestaurar");
const btnCancelarRestaurar = document.getElementById("btnCancelarRestaurar");
const btnCopiaActual = document.getElementById("btnCopiaActual");

let respaldoPendiente = null;
let restaurando = false;

function cerrarModalRestaurar() {
  if (restaurando) return; // no se puede cerrar a mitad de la restauración
  modalRestaurar.hidden = true;
  respaldoPendiente = null;
  btnCargarRespaldo.focus();
}

btnCargarRespaldo.addEventListener("click", () => inputRespaldo.click());

inputRespaldo.addEventListener("change", async () => {
  const archivo = inputRespaldo.files[0];
  inputRespaldo.value = ""; // así se puede volver a elegir el mismo archivo
  if (!archivo) return;

  try {
    respaldoPendiente = await prepararRespaldo(archivo);
  } catch (err) {
    alert("No se pudo leer el respaldo: " + err.message);
    return;
  }

  const r = respaldoPendiente.resumen;
  const fecha = r.exportadoEn ? new Date(r.exportadoEn) : null;
  const fechaTxt = fecha && !isNaN(fecha) ? fecha.toLocaleString("es") : null;
  modalResumen.innerHTML = `
    El archivo <strong>${escapeHtml(archivo.name)}</strong>${fechaTxt ? ` (exportado el ${escapeHtml(fechaTxt)})` : ""}
    contiene <strong>${r.totalLibros}</strong> libro${r.totalLibros === 1 ? "" : "s"}
    y <strong>${r.totalItems}</strong> elementos (capítulos, personajes, citas y conceptos).
    Ahora tienes <strong>${todosLosLibros.length + librosPapelera.length}</strong> libro${todosLosLibros.length + librosPapelera.length === 1 ? "" : "s"}${librosPapelera.length ? ` (${librosPapelera.length} en la papelera)` : ""}.
    ${r.omitidos ? `<br><small>Se omitirán ${r.omitidos} libro${r.omitidos === 1 ? "" : "s"} de otros usuarios que vienen en el archivo.</small>` : ""}`;
  modalError.hidden = true;
  btnConfirmarRestaurar.disabled = false;
  btnConfirmarRestaurar.textContent = "Sí, sobrescribir";
  btnCancelarRestaurar.disabled = false;
  modalRestaurar.hidden = false;
  btnCancelarRestaurar.focus(); // el foco empieza en la opción segura
});

btnCancelarRestaurar.addEventListener("click", cerrarModalRestaurar);
modalRestaurar.addEventListener("click", (e) => { if (e.target === modalRestaurar) cerrarModalRestaurar(); });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modalRestaurar.hidden) cerrarModalRestaurar();
});

// Atajo dentro del modal: bajar una copia de lo actual antes de sobrescribir.
btnCopiaActual.addEventListener("click", async () => {
  const texto = btnCopiaActual.textContent;
  btnCopiaActual.disabled = true;
  btnCopiaActual.textContent = "Preparando…";
  try {
    await exportarBiblioteca(uidObjetivo || undefined);
  } catch (err) {
    alert("No se pudo generar la copia: " + err.message);
  } finally {
    btnCopiaActual.disabled = false;
    btnCopiaActual.textContent = texto;
  }
});

btnConfirmarRestaurar.addEventListener("click", async () => {
  if (!respaldoPendiente || restaurando) return;
  restaurando = true;
  modalError.hidden = true;
  btnConfirmarRestaurar.disabled = true;
  btnCancelarRestaurar.disabled = true;
  btnConfirmarRestaurar.textContent = "Restaurando…";
  try {
    const res = await restaurarRespaldo(respaldoPendiente, (hechas, total) => {
      btnConfirmarRestaurar.textContent = `Restaurando… ${hechas}/${total}`;
    });
    restaurando = false;
    cerrarModalRestaurar();
    citasCache = null;
    await cargarLibros();
    document.querySelector('.pestañas .pestaña[data-vista="biblioteca"]').click();
    alert(`Respaldo restaurado: ${res.libros} libro${res.libros === 1 ? "" : "s"}.`);
  } catch (err) {
    restaurando = false;
    modalError.textContent = "No se pudo restaurar: " + err.message +
      " Si se interrumpió a medias, puedes repetir la restauración con el mismo archivo.";
    modalError.hidden = false;
    btnConfirmarRestaurar.disabled = false;
    btnCancelarRestaurar.disabled = false;
    btnConfirmarRestaurar.textContent = "Reintentar";
    await cargarLibros(); // refleja lo que haya quedado escrito
  }
});

// ---------- Citas de todos los libros ----------
const buscadorCitas = document.getElementById("buscadorCitas");
const filtroEtiquetaCita = document.getElementById("filtroEtiquetaCita");
const soloFavoritas = document.getElementById("soloFavoritas");
const listaCitasGlobal = document.getElementById("listaCitasGlobal");

async function cargarCitas() {
  if (!citasCache) {
    listaCitasGlobal.innerHTML = `<p class="vacio">Cargando citas…</p>`;
    try {
      citasCache = await obtenerCitasDeLibros(todosLosLibros);
    } catch (err) {
      listaCitasGlobal.innerHTML = `<p class="vacio">No se pudieron cargar las citas: ${escapeHtml(err.message)}</p>`;
      return;
    }
    const actual = filtroEtiquetaCita.value;
    const etiquetas = [...new Set(citasCache.map(c => (c.etiqueta || "").trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"));
    filtroEtiquetaCita.innerHTML = `<option value="">Todas las etiquetas</option>` +
      etiquetas.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
    if (etiquetas.includes(actual)) filtroEtiquetaCita.value = actual;
  }
  renderCitas();
}

function renderCitas() {
  const texto = norm(buscadorCitas.value);
  const etiqueta = filtroEtiquetaCita.value;
  const favoritas = soloFavoritas.checked;

  const lista = citasCache.filter(c => {
    if (favoritas && !c.favorita) return false;
    if (etiqueta && (c.etiqueta || "").trim() !== etiqueta) return false;
    if (texto && !norm([c.texto, aTextoPlano(c.nota), c.etiqueta, c.libroTitulo, c.libroAutor].join(" ")).includes(texto)) return false;
    return true;
  });

  listaCitasGlobal.innerHTML = "";
  if (!citasCache.length) {
    listaCitasGlobal.innerHTML = `<p class="vacio">Todavía no hay citas guardadas.</p>`;
    return;
  }
  if (!lista.length) {
    listaCitasGlobal.innerHTML = `<p class="vacio">Ninguna cita coincide con los filtros.</p>`;
    return;
  }

  lista.forEach(c => {
    const div = document.createElement("div");
    div.className = "item-sub cita-global" + (c.favorita ? " es-favorita" : "");
    div.innerHTML = `
      <p class="cita-texto">“${escapeHtml(c.texto)}”</p>
      <p class="meta">
        <a class="enlace-libro" href="detalle.html?id=${c.libroId}${sufijoUid}">${escapeHtml(c.libroTitulo)}</a>
        · ${escapeHtml(c.libroAutor)}${c.pagina ? " · pág. " + c.pagina : ""}${c.etiqueta ? " · " + escapeHtml(c.etiqueta) : ""}
        ${c.favorita ? `<span class="chip favorita">★</span>` : ""}
      </p>
      ${c.nota ? `<div class="texto-formato meta">${renderizarHTML(c.nota)}</div>` : ""}
      <button type="button" class="boton-fantasma btn-copiar">Copiar</button>
    `;
    div.querySelector(".btn-copiar").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const formateada = `“${c.texto}”\n— ${c.libroAutor}, ${c.libroTitulo}${c.pagina ? ", p. " + c.pagina : ""}`;
      try {
        await navigator.clipboard.writeText(formateada);
        btn.textContent = "Copiado ✓";
      } catch {
        btn.textContent = "No se pudo copiar";
      }
      setTimeout(() => { btn.textContent = "Copiar"; }, 1500);
    });
    listaCitasGlobal.appendChild(div);
  });
}

buscadorCitas.addEventListener("input", () => citasCache && renderCitas());
filtroEtiquetaCita.addEventListener("change", () => citasCache && renderCitas());
soloFavoritas.addEventListener("change", () => citasCache && renderCitas());
