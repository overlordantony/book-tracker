import { vigilarSesion, logout } from "./auth.js";
import { iniciarToggleTema } from "./theme.js";
import { obtenerPerfil } from "./roles.js";
import { exportarGuia, exportarLibro } from "./exportar.js";
import {
  obtenerLibro,
  actualizarLibro,
  crearItem,
  obtenerItems,
  actualizarItem,
  eliminarItem,
  enPapelera,
  moverALaPapelera,
  restaurarDePapelera,
  eliminarLibroDefinitivo,
  contarContenido
} from "./db.js";
import { obtenerLecturaDeLibro } from "./lecturas.js";
import { confirmarAccion, negrita } from "./modal.js";
import { renderizarHTML, montarEditor } from "./formato.js";

iniciarToggleTema();

const libroId = new URLSearchParams(window.location.search).get("id");
const uidParam = new URLSearchParams(window.location.search).get("uid");
if (!libroId) window.location.href = "app.html";

const volverHref = uidParam ? `app.html?uid=${encodeURIComponent(uidParam)}` : "app.html";
document.getElementById("linkVolver").href = volverHref;

document.getElementById("btnSalir").addEventListener("click", async () => {
  await logout();
  window.location.href = "index.html";
});

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function listaDesdeTexto(texto) {
  return texto.split(",").map(s => s.trim()).filter(Boolean);
}

const ESTADO_LABEL = {
  pendiente: "Pendiente", leyendo: "Leyendo", pausado: "Pausado",
  terminado: "Terminado", descartado: "Descartado"
};
const FORMATO_LABEL = { fisico: "Físico", digital: "Digital", audiolibro: "Audiolibro" };

// Fecha corta a partir de un Timestamp de Firestore o de un "AAAA-MM-DD".
function fechaCorta(valor) {
  if (!valor) return null;
  if (typeof valor === "string") {
    const [a, m, d] = valor.split("-");
    return a && m && d ? `${d}/${m}/${a}` : valor;
  }
  const f = valor.toDate?.();
  return f && !isNaN(f) ? f.toLocaleDateString("es") : null;
}

// Editores con barra de formato (el <textarea> sigue siendo el mismo campo del formulario).
["editNotas", "editObservaciones", "capResumen", "perDescripcion", "citaNota", "conSignificado"]
  .forEach(id => montarEditor($(id)));

// Avisar si se intenta salir de la página con un formulario a medias.
const formsSucios = new Set();
function vigilarCambios(form) {
  form.addEventListener("input", () => formsSucios.add(form));
  form.addEventListener("reset", () => formsSucios.delete(form));
}
window.addEventListener("beforeunload", (e) => {
  if (formsSucios.size) { e.preventDefault(); e.returnValue = ""; }
});

// Estado de la página
let libroVigente = null;
let esPropietario = false;
const itemsCargados = { capitulos: [], personajes: [], citas: [], conceptos: [] };

vigilarSesion(async (usuario) => {
  if (!usuario) {
    window.location.href = "index.html";
    return;
  }

  const perfil = await obtenerPerfil(usuario.uid);
  if (!perfil || perfil.estado !== "Activo") {
    const aviso = $("cuentaInactiva");
    aviso.hidden = false;
    aviso.textContent = !perfil || perfil.estado === "Pendiente"
      ? "Tu cuenta está pendiente de aprobación por un administrador."
      : "Tu cuenta está inactiva. Contacta al administrador.";
    return;
  }
  $("contenidoApp").hidden = false;

  const libroActual = await obtenerLibro(libroId);
  if (!libroActual) {
    $("tituloLibro").textContent = "Libro no encontrado";
    return;
  }

  libroVigente = libroActual;
  esPropietario = libroActual.propietarioUid === usuario.uid;
  // Un libro en la papelera se ve, pero no se edita hasta restaurarlo.
  const soloLectura = !esPropietario || enPapelera(libroActual);

  pintarTodo();
  configurarPapelera();
  configurarEdicionLibro(soloLectura);
  configurarSubpestañas();
  if (esPropietario && !enPapelera(libroActual)) configurarLector();

  $("btnExportarLibro").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Preparando…";
    try {
      await exportarLibro(libroId);
    } catch (err) {
      alert("No se pudo exportar el libro: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });

  $("btnExportarGuia").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const textoOriginal = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando…";
    try {
      await exportarGuia(libroId);
    } catch (err) {
      alert("No se pudo generar la guía: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  });

  crearApartado({
    coleccion: "capitulos", soloLectura,
    form: $("formCapitulo"),
    lista: $("listaCapitulos"),
    campoOrden: "numero",
    btnCancelarId: "btnCancelarCapitulo",
    leerFormulario: () => ({
      numero: Number($("capNumero").value),
      titulo: $("capTitulo").value.trim(),
      rangoPaginas: {
        inicio: Number($("capPagInicio").value) || null,
        fin: Number($("capPagFin").value) || null
      },
      resumen: $("capResumen").value.trim(),
      puntosClave: listaDesdeTexto($("capPuntos").value)
    }),
    llenarFormulario: (cap) => {
      $("capNumero").value = cap.numero || "";
      $("capTitulo").value = cap.titulo || "";
      $("capPagInicio").value = cap.rangoPaginas?.inicio || "";
      $("capPagFin").value = cap.rangoPaginas?.fin || "";
      $("capResumen").value = cap.resumen || "";
      $("capPuntos").value = (cap.puntosClave || []).join(", ");
    },
    renderItem: (cap) => {
      const paginas = cap.rangoPaginas && (cap.rangoPaginas.inicio || cap.rangoPaginas.fin)
        ? `<span class="meta num">pág. ${cap.rangoPaginas.inicio ?? "?"}–${cap.rangoPaginas.fin ?? "?"}</span>`
        : "";
      return `
        <div class="item-sub-cabecera">
          <h4>Cap. ${escapeHtml(cap.numero)}${cap.titulo ? " — " + escapeHtml(cap.titulo) : ""}</h4>
          ${paginas}
        </div>
        ${cap.resumen ? `<div class="texto-formato">${renderizarHTML(cap.resumen)}</div>` : ""}
        ${cap.puntosClave?.length ? `<ul class="puntos">${cap.puntosClave.map(p => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
      `;
    }
  });

  const RELEVANCIA_LABEL = {
    principal: "Principal", secundario: "Secundario",
    menor: "Menor", mencionado: "Solo mencionado"
  };

  crearApartado({
    coleccion: "personajes", soloLectura,
    form: $("formPersonaje"),
    lista: $("listaPersonajes"),
    campoOrden: "nombre",
    btnCancelarId: "btnCancelarPersonaje",
    leerFormulario: () => ({
      nombre: $("perNombre").value.trim(),
      rol: $("perRol").value.trim(),
      relevancia: $("perRelevancia").value,
      alias: listaDesdeTexto($("perAlias").value),
      descripcion: $("perDescripcion").value.trim(),
      conexiones: listaDesdeTexto($("perConexiones").value)
    }),
    llenarFormulario: (per) => {
      $("perNombre").value = per.nombre || "";
      $("perRol").value = per.rol || "";
      $("perRelevancia").value = per.relevancia || "principal";
      $("perAlias").value = (per.alias || []).join(", ");
      $("perDescripcion").value = per.descripcion || "";
      $("perConexiones").value = (per.conexiones || []).join(", ");
    },
    renderItem: (per) => `
      <div class="item-sub-cabecera">
        <h4>${escapeHtml(per.nombre)}${per.rol ? " · " + escapeHtml(per.rol) : ""}</h4>
        <span class="chip">${escapeHtml(RELEVANCIA_LABEL[per.relevancia] || per.relevancia)}</span>
      </div>
      ${per.alias?.length ? `<p class="meta">También: ${per.alias.map(escapeHtml).join(", ")}</p>` : ""}
      ${per.descripcion ? `<div class="texto-formato">${renderizarHTML(per.descripcion)}</div>` : ""}
      ${per.conexiones?.length ? `<p class="meta">Asócialo con: ${per.conexiones.map(escapeHtml).join(" → ")}</p>` : ""}
    `
  });

  crearApartado({
    coleccion: "citas", soloLectura,
    form: $("formCita"),
    lista: $("listaCitas"),
    campoOrden: null,
    btnCancelarId: "btnCancelarCita",
    leerFormulario: () => ({
      texto: $("citaTexto").value.trim(),
      pagina: Number($("citaPagina").value) || null,
      etiqueta: $("citaEtiqueta").value.trim(),
      nota: $("citaNota").value.trim(),
      favorita: $("citaFavorita").checked
    }),
    llenarFormulario: (cita) => {
      $("citaTexto").value = cita.texto || "";
      $("citaPagina").value = cita.pagina || "";
      $("citaEtiqueta").value = cita.etiqueta || "";
      $("citaNota").value = cita.nota || "";
      $("citaFavorita").checked = !!cita.favorita;
    },
    renderItem: (cita) => `
      <div class="item-sub-cabecera">
        <p>"${escapeHtml(cita.texto)}"</p>
        ${cita.favorita ? `<span class="chip favorita">★ Favorita</span>` : ""}
      </div>
      <p class="meta">${cita.pagina ? "pág. " + escapeHtml(cita.pagina) + " · " : ""}${escapeHtml(cita.etiqueta || "")}</p>
      ${cita.nota ? `<div class="texto-formato meta">${renderizarHTML(cita.nota)}</div>` : ""}
      <button class="boton-fantasma btn-copiar" style="margin-top:.5rem">Copiar</button>
    `
  });

  $("listaCitas").addEventListener("click", async (e) => {
    const btn = e.target.closest(".btn-copiar");
    if (!btn) return;
    const texto = btn.closest(".item-sub").querySelector("p").textContent;
    try {
      await navigator.clipboard.writeText(texto);
      btn.textContent = "Copiado ✓";
    } catch {
      btn.textContent = "No se pudo copiar";
    }
    setTimeout(() => { btn.textContent = "Copiar"; }, 1500);
  });

  crearApartado({
    coleccion: "conceptos", soloLectura,
    form: $("formConcepto"),
    lista: $("listaConceptos"),
    campoOrden: "nombre",
    btnCancelarId: "btnCancelarConcepto",
    leerFormulario: () => ({
      nombre: $("conNombre").value.trim(),
      significado: $("conSignificado").value.trim()
    }),
    llenarFormulario: (con) => {
      $("conNombre").value = con.nombre || "";
      $("conSignificado").value = con.significado || "";
    },
    renderItem: (con) => `
      <div class="item-sub-cabecera"><h4>${escapeHtml(con.nombre)}</h4></div>
      ${con.significado ? `<div class="texto-formato">${renderizarHTML(con.significado)}</div>` : ""}
    `
  });
});

// ---------- Cabecera, resumen, notas y actividad ----------

// Botón "Leer en la app": abre el lector integrado (lector.html) en el contexto de este libro.
// Si ya hay una lectura vinculada (colección `lecturas`), muestra el avance y reanuda donde se dejó.
async function configurarLector() {
  const enlace = $("btnLeer");
  enlace.href = `lector.html?libro=${encodeURIComponent(libroId)}`;
  enlace.hidden = false;
  try {
    const lectura = await obtenerLecturaDeLibro(libroId);
    if (lectura) enlace.textContent = `Continuar leyendo (${lectura.pct || 0}%)`;
  } catch { /* sin conexión: queda el texto por defecto */ }
}

function pintarTodo() {
  pintarCabecera(libroVigente);
  pintarResumen(libroVigente);
  pintarNotas(libroVigente);
  pintarActividad(libroVigente);
}

function pintarCabecera(libro) {
  $("tituloLibro").textContent = libro.titulo;
  document.title = `${libro.titulo} — Bitácora de lectura`;
  $("autorLibro").textContent = libro.autor;

  if (libro.totalPaginas) {
    const pct = Math.round(((libro.paginaActual || 0) / libro.totalPaginas) * 100);
    $("progresoLibro").textContent = `${libro.paginaActual || 0} / ${libro.totalPaginas} páginas · ${pct}%`;
    $("rellenoProgreso").style.width = `${Math.min(pct, 100)}%`;
  } else {
    $("progresoLibro").textContent = "Sin total de páginas registrado";
    $("rellenoProgreso").style.width = "0";
  }

  const portada = $("portadaLibro");
  if (libro.portadaUrl) {
    portada.src = libro.portadaUrl;
    portada.alt = `Portada de ${libro.titulo}`;
    portada.hidden = false;
    portada.onerror = () => { portada.hidden = true; };
  } else {
    portada.hidden = true;
  }

  const linkTienda = $("linkTiendaLibro");
  if (libro.url) {
    linkTienda.href = libro.url;
    linkTienda.style.display = "inline-block";
  } else {
    linkTienda.style.display = "none";
  }

  // El aviso de solo lectura es para libros ajenos; el de la papelera tiene su propio cuadro.
  $("avisoSoloLectura").hidden = esPropietario;
}

function pintarResumen(libro) {
  const pct = libro.totalPaginas ? Math.round(((libro.paginaActual || 0) / libro.totalPaginas) * 100) : null;
  const inicio = fechaCorta(libro.fechaInicio);
  const fin = fechaCorta(libro.fechaFin);
  const tiles = [
    { valor: ESTADO_LABEL[String(libro.estado || "").toLowerCase()] || libro.estado || "—", etiqueta: "Estado" },
    { valor: pct !== null ? `${pct} %` : "—", etiqueta: "Progreso" },
    { valor: libro.calificacion ? `★ ${libro.calificacion}` : "Sin calificar", etiqueta: "Calificación" },
    { valor: FORMATO_LABEL[libro.formato] || "—", etiqueta: "Formato" }
  ];
  if (inicio || fin) {
    tiles.push({ valor: `${inicio || "?"} → ${fin || "…"}`, etiqueta: "Lectura (inicio → fin)" });
  }
  $("resumenTiles").innerHTML = `<div class="tiles">${tiles.map(t => `
    <div class="tile"><span class="tile-valor num">${escapeHtml(t.valor)}</span><span class="tile-etiqueta">${t.etiqueta}</span></div>`).join("")}
  </div>`;
}

function pintarNotas(libro) {
  const bloques = [["Notas", libro.notas], ["Observaciones", libro.observaciones]].filter(([, texto]) => texto);
  $("panelNotas").innerHTML = bloques.length
    ? bloques.map(([titulo, texto]) => `
        <h3 class="titulo-seccion">${titulo}</h3>
        <div class="texto-formato">${renderizarHTML(texto)}</div>`).join("")
    : `<p class="meta">Este libro todavía no tiene notas.${esPropietario && !enPapelera(libro) ? " Usa «Editar libro» para añadirlas." : ""}</p>`;
}

const SINGULAR = { capitulos: "capítulo", personajes: "personaje", citas: "cita", conceptos: "concepto" };

function pintarActividad(libro) {
  const n = (clave, uno, varios) => `${itemsCargados[clave].length} ${itemsCargados[clave].length === 1 ? uno : varios}`;
  const recientes = Object.entries(itemsCargados)
    .flatMap(([clave, lista]) => lista.map(i => ({ clave, fecha: i.creadoEn?.toDate?.() })))
    .filter(i => i.fecha && !isNaN(i.fecha))
    .sort((a, b) => b.fecha - a.fecha);
  const ultimo = recientes[0];
  const filas = [
    ["Contenido", `${n("capitulos", "capítulo", "capítulos")} · ${n("personajes", "personaje", "personajes")} · ${n("citas", "cita", "citas")} · ${n("conceptos", "concepto", "conceptos")}`],
    ultimo ? ["Último elemento añadido", `${SINGULAR[ultimo.clave]} · ${ultimo.fecha.toLocaleDateString("es")}`] : null,
    fechaCorta(libro.actualizadoEn) ? ["Última actualización del libro", fechaCorta(libro.actualizadoEn)] : null,
    fechaCorta(libro.creadoEn) ? ["Agregado a la bitácora", fechaCorta(libro.creadoEn)] : null
  ].filter(Boolean);
  $("panelActividad").innerHTML = `
    <h3 class="titulo-seccion">Actividad</h3>
    <dl class="actividad">${filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
}

// ---------- Papelera ----------

function mostrarErrorAccion(texto) {
  const el = $("errorAccionLibro");
  el.hidden = !texto;
  el.textContent = texto || "";
}

function configurarPapelera() {
  const enLaPapelera = enPapelera(libroVigente);
  $("avisoPapelera").hidden = !enLaPapelera;
  $("btnPapelera").hidden = !esPropietario || enLaPapelera;
  $("btnRestaurarLibro").hidden = !esPropietario;
  $("btnEliminarDefinitivo").hidden = !esPropietario;
  $("textoPapelera").textContent = esPropietario
    ? "Este libro está en la papelera: no aparece en tu biblioteca ni en las estadísticas. Restáuralo para volver a editarlo."
    : "Este libro está en la papelera de su dueño.";
  if (!esPropietario) return;

  $("btnPapelera").addEventListener("click", async () => {
    mostrarErrorAccion("");
    const ok = await confirmarAccion({
      titulo: "Mover a la papelera",
      mensaje: [
        negrita(libroVigente.titulo),
        " dejará de aparecer en tu biblioteca, estadísticas y citas. Sus capítulos, personajes, citas y conceptos se conservan y volverán contigo si lo restauras."
      ],
      aviso: formsSucios.size ? "Tienes cambios sin guardar en esta página; se perderán." : "",
      textoConfirmar: "Mover a la papelera",
      peligro: false,
      onConfirmar: () => moverALaPapelera(libroId)
    });
    if (ok) { formsSucios.clear(); window.location.href = volverHref; }
  });

  $("btnRestaurarLibro").addEventListener("click", async () => {
    mostrarErrorAccion("");
    try {
      await restaurarDePapelera(libroId);
      window.location.reload();
    } catch (err) {
      mostrarErrorAccion("No se pudo restaurar el libro: " + err.message);
    }
  });

  $("btnEliminarDefinitivo").addEventListener("click", async () => {
    mostrarErrorAccion("");
    let c;
    try {
      c = await contarContenido(libroId);
    } catch (err) {
      mostrarErrorAccion("No se pudo preparar la eliminación: " + err.message);
      return;
    }
    const plural = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
    const ok = await confirmarAccion({
      titulo: "Eliminar definitivamente",
      mensaje: [
        "Se eliminará ", negrita(libroVigente.titulo), " junto con su contenido: ",
        `${plural(c.capitulos, "capítulo", "capítulos")}, ${plural(c.personajes, "personaje", "personajes")}, `,
        `${plural(c.citas, "cita", "citas")} y ${plural(c.conceptos, "concepto", "conceptos")}.`
      ],
      aviso: "Esta acción no se puede deshacer. Si quieres conservar una copia, cancela y usa antes «Exportar guía» o «Descargar respaldo».",
      textoConfirmar: "Eliminar definitivamente",
      onConfirmar: (progreso) => eliminarLibroDefinitivo(libroId, progreso)
    });
    if (ok) window.location.href = volverHref;
  });
}

// ---------- Edición del libro ----------

function configurarEdicionLibro(soloLectura) {
  const btnEditarLibro = $("btnEditarLibro");
  const formEditarLibro = $("formEditarLibro");

  if (soloLectura) {
    btnEditarLibro.hidden = true;
    return;
  }
  vigilarCambios(formEditarLibro);
  const errorEl = $("errorEditarLibro");

  btnEditarLibro.addEventListener("click", () => {
    const l = libroVigente;
    $("editTitulo").value = l.titulo || "";
    $("editAutor").value = l.autor || "";
    $("editPortadaUrl").value = l.portadaUrl || "";
    $("editUrl").value = l.url || "";
    $("editGeneros").value = (l.generos || []).join(", ");
    $("editEtiquetas").value = (l.etiquetas || []).join(", ");
    $("editEstado").value = l.estado || "leyendo";
    $("editFormato").value = l.formato || "fisico";
    $("editTotalPaginas").value = l.totalPaginas || "";
    $("editPaginaActual").value = l.paginaActual || 0;
    $("editFechaInicio").value = l.fechaInicio || "";
    $("editFechaFin").value = l.fechaFin || "";
    $("editCalificacion").value = l.calificacion || "";
    $("editNotas").value = l.notas || "";
    $("editObservaciones").value = l.observaciones || "";
    errorEl.hidden = true;
    formsSucios.delete(formEditarLibro);
    formEditarLibro.hidden = false;
    btnEditarLibro.hidden = true;
  });

  function cerrarEdicion() {
    formsSucios.delete(formEditarLibro);
    formEditarLibro.hidden = true;
    btnEditarLibro.hidden = false;
  }
  $("btnCancelarEditarLibro").addEventListener("click", cerrarEdicion);

  formEditarLibro.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const btn = formEditarLibro.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await actualizarLibro(libroId, {
        titulo: $("editTitulo").value.trim(),
        autor: $("editAutor").value.trim(),
        portadaUrl: $("editPortadaUrl").value.trim(),
        url: $("editUrl").value.trim(),
        generos: listaDesdeTexto($("editGeneros").value),
        etiquetas: listaDesdeTexto($("editEtiquetas").value),
        estado: $("editEstado").value,
        formato: $("editFormato").value,
        totalPaginas: Number($("editTotalPaginas").value) || null,
        paginaActual: Number($("editPaginaActual").value) || 0,
        fechaInicio: $("editFechaInicio").value || null,
        fechaFin: $("editFechaFin").value || null,
        calificacion: Number($("editCalificacion").value) || null,
        notas: $("editNotas").value.trim(),
        observaciones: $("editObservaciones").value.trim()
      });
      libroVigente = await obtenerLibro(libroId);
      pintarTodo();
      cerrarEdicion();
    } catch (err) {
      errorEl.textContent = "No se pudieron guardar los cambios: " + err.message;
      errorEl.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

function configurarSubpestañas() {
  const pestañas = document.querySelectorAll(".subpestañas .pestaña");
  const vistas = {
    capitulos: $("vistaCapitulos"),
    personajes: $("vistaPersonajes"),
    citas: $("vistaCitas"),
    conceptos: $("vistaConceptos")
  };
  pestañas.forEach(btn => {
    btn.addEventListener("click", () => {
      pestañas.forEach(b => b.classList.remove("activa"));
      btn.classList.add("activa");
      Object.values(vistas).forEach(v => v.hidden = true);
      vistas[btn.dataset.vista].hidden = false;
    });
  });
}

// Utilidad genérica para armar un apartado con crear + editar + eliminar
// (o solo lectura, si soloLectura es true: oculta el formulario y los
// botones de editar/eliminar).
function crearApartado({ coleccion, soloLectura, form, lista, campoOrden, leerFormulario, llenarFormulario, renderItem, btnCancelarId }) {
  const btnCancelar = $(btnCancelarId);
  let activarEdicion = null;

  if (soloLectura) {
    form.hidden = true;
  } else {
    vigilarCambios(form);
    const btnSubmit = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.textContent;
    let editandoId = null;

    const errorEl = document.createElement("p");
    errorEl.className = "error";
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;
    form.insertBefore(errorEl, form.lastElementChild); // antes de los botones

    function salirModoEdicion() {
      editandoId = null;
      form.reset();
      errorEl.hidden = true;
      btnSubmit.textContent = textoOriginal;
      btnCancelar.hidden = true;
    }

    btnCancelar.addEventListener("click", salirModoEdicion);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      errorEl.hidden = true;
      btnSubmit.disabled = true;
      try {
        const datos = leerFormulario();
        if (editandoId) {
          await actualizarItem(libroId, coleccion, editandoId, datos);
        } else {
          await crearItem(libroId, coleccion, datos);
        }
        salirModoEdicion();
        cargar();
      } catch (err) {
        errorEl.textContent = "No se pudo guardar: " + err.message;
        errorEl.hidden = false;
      } finally {
        btnSubmit.disabled = false;
      }
    });

    activarEdicion = (item) => {
      editandoId = item.id;
      llenarFormulario(item);
      formsSucios.delete(form);
      btnSubmit.textContent = "Guardar cambios";
      btnCancelar.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  async function cargar() {
    let items;
    try {
      items = await obtenerItems(libroId, coleccion, campoOrden);
    } catch (err) {
      lista.innerHTML = `<p class="vacio">No se pudo cargar esta sección: ${escapeHtml(err.message)}</p>`;
      return;
    }
    itemsCargados[coleccion] = items;
    pintarActividad(libroVigente);

    lista.innerHTML = "";
    if (!items.length) {
      lista.innerHTML = `<p class="vacio">Todavía no hay nada aquí.</p>`;
      return;
    }
    items.forEach(item => {
      const div = document.createElement("div");
      div.className = "item-sub";
      div.innerHTML = renderItem(item);

      if (!soloLectura) {
        const btnEditar = document.createElement("button");
        btnEditar.textContent = "Editar";
        btnEditar.className = "boton-fantasma";
        btnEditar.style.marginTop = ".6rem";
        btnEditar.style.marginRight = ".5rem";
        btnEditar.addEventListener("click", () => activarEdicion(item));

        const btnEliminar = document.createElement("button");
        btnEliminar.textContent = "Eliminar";
        btnEliminar.className = "boton-fantasma boton-borrar";
        btnEliminar.style.marginTop = ".6rem";
        btnEliminar.addEventListener("click", async () => {
          const ok = await confirmarAccion({
            titulo: "Eliminar elemento",
            mensaje: "Se eliminará este elemento del libro.",
            aviso: "Esta acción no se puede deshacer.",
            textoConfirmar: "Eliminar",
            onConfirmar: () => eliminarItem(libroId, coleccion, item.id)
          });
          if (ok) cargar();
        });

        div.appendChild(btnEditar);
        div.appendChild(btnEliminar);
      }

      lista.appendChild(div);
    });
  }

  cargar();
}
