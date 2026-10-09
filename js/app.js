import { vigilarSesion, logout } from "./auth.js";
import { crearLibro, obtenerLibros, obtenerCitasDeLibros } from "./db.js";
import { iniciarToggleTema } from "./theme.js";
import { obtenerPerfil } from "./roles.js";
import { renderEstadisticas } from "./estadisticas.js";
import { exportarBiblioteca } from "./exportar.js";
import { prepararRespaldo, restaurarRespaldo } from "./importar.js";

iniciarToggleTema();

// Si viene ?uid=... estamos viendo la biblioteca de otra persona
// (solo posible para un admin; las reglas de Firestore lo hacen cumplir).
const uidObjetivo = new URLSearchParams(window.location.search).get("uid");
const sufijoUid = uidObjetivo ? `&uid=${encodeURIComponent(uidObjetivo)}` : "";

let todosLosLibros = [];
let citasCache = null;

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
  });
});

// ---------- Formulario: agregar libro ----------
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

// ---------- Biblioteca: carga, filtros y orden ----------
const listaLibros = document.getElementById("listaLibros");
const bibliotecaVacia = document.getElementById("bibliotecaVacia");
const buscador = document.getElementById("buscador");
const filtroEstado = document.getElementById("filtroEstado");
const filtroEtiqueta = document.getElementById("filtroEtiqueta");
const selectOrden = document.getElementById("orden");
const contador = document.getElementById("contadorLibros");

const ESTADO_LABEL = {
  pendiente: "Pendiente", leyendo: "Leyendo", pausado: "Pausado",
  terminado: "Terminado", descartado: "Descartado"
};

async function cargarLibros() {
  try {
    todosLosLibros = await obtenerLibros(uidObjetivo || undefined);
    citasCache = null;
    poblarFiltroEtiquetas();
    renderBiblioteca();
  } catch (err) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = "No se pudo cargar la biblioteca: " + err.message;
  }
}

function poblarFiltroEtiquetas() {
  const actual = filtroEtiqueta.value;
  const unicas = new Set();
  todosLosLibros.forEach(l => [...(l.generos || []), ...(l.etiquetas || [])].forEach(x => unicas.add(x)));
  const ordenadas = [...unicas].sort((a, b) => a.localeCompare(b, "es"));
  filtroEtiqueta.innerHTML = `<option value="">Géneros y etiquetas</option>` +
    ordenadas.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
  if (ordenadas.includes(actual)) filtroEtiqueta.value = actual;
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

function renderBiblioteca() {
  const texto = norm(buscador.value);
  const estado = filtroEstado.value;
  const etiqueta = filtroEtiqueta.value;

  const filtrados = todosLosLibros.filter(l => {
    if (estado && l.estado !== estado) return false;
    if (etiqueta && ![...(l.generos || []), ...(l.etiquetas || [])].includes(etiqueta)) return false;
    if (texto) {
      const pajar = norm([l.titulo, l.autor, ...(l.generos || []), ...(l.etiquetas || [])].join(" "));
      if (!pajar.includes(texto)) return false;
    }
    return true;
  });

  const lista = aplicarOrden(filtrados);
  listaLibros.innerHTML = "";
  contador.textContent = `${lista.length} de ${todosLosLibros.length}`;

  if (!todosLosLibros.length) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = uidObjetivo
      ? "Esta persona todavía no ha agregado libros."
      : 'Todavía no has agregado ningún libro. Ve a "Agregar libro" para empezar tu bitácora.';
    return;
  }
  if (!lista.length) {
    bibliotecaVacia.hidden = false;
    bibliotecaVacia.textContent = "Ningún libro coincide con los filtros.";
    return;
  }
  bibliotecaVacia.hidden = true;
  lista.forEach(libro => listaLibros.appendChild(filaLibro(libro)));
}

[buscador].forEach(el => el.addEventListener("input", renderBiblioteca));
[filtroEstado, filtroEtiqueta, selectOrden].forEach(el => el.addEventListener("change", renderBiblioteca));

function filaLibro(libro) {
  const pct = porcentaje(libro);
  const inicial = escapeHtml((libro.titulo || "?").trim().charAt(0).toUpperCase());

  const div = document.createElement("div");
  div.className = `fila-libro estado-${libro.estado}`;
  div.addEventListener("click", () => {
    window.location.href = `detalle.html?id=${libro.id}${sufijoUid}`;
  });
  div.innerHTML = `
    <div class="portada-mini">
      ${libro.portadaUrl
        ? `<img src="${escapeHtml(libro.portadaUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : `<span>${inicial}</span>`}
    </div>
    <div class="fila-libro-principal">
      <h3>${escapeHtml(libro.titulo)}</h3>
      <p class="autor">${escapeHtml(libro.autor)}</p>
      ${(libro.generos || []).length ? `<p class="generos">${libro.generos.map(escapeHtml).join(" · ")}</p>` : ""}
    </div>
    <div class="fila-libro-datos">
      <span class="etiqueta-estado">${ESTADO_LABEL[libro.estado] || escapeHtml(libro.estado)}</span>
      ${pct !== null ? `<span class="num progreso">${libro.paginaActual || 0}/${libro.totalPaginas} · ${pct}%</span>` : ""}
      ${libro.calificacion ? `<span class="num calificacion">★ ${libro.calificacion}</span>` : ""}
    </div>
  `;

  // Si la portada no carga (URL rota o bloqueada), vuelve a la inicial.
  const img = div.querySelector(".portada-mini img");
  if (img) {
    img.addEventListener("error", () => {
      img.parentElement.innerHTML = `<span>${inicial}</span>`;
    });
  }
  return div;
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
    Ahora tienes <strong>${todosLosLibros.length}</strong> libro${todosLosLibros.length === 1 ? "" : "s"}.
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
    if (texto && !norm([c.texto, c.nota, c.etiqueta, c.libroTitulo, c.libroAutor].join(" ")).includes(texto)) return false;
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
      ${c.nota ? `<p class="meta">${escapeHtml(c.nota)}</p>` : ""}
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
