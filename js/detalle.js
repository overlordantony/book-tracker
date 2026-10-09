import { vigilarSesion, logout } from "./auth.js";
import { iniciarToggleTema } from "./theme.js";
import { auth } from "./firebase-init.js";
import { obtenerPerfil } from "./roles.js";
import { exportarGuia } from "./exportar.js";
import {
  obtenerLibro,
  actualizarLibro,
  crearItem,
  obtenerItems,
  actualizarItem,
  eliminarItem
} from "./db.js";

iniciarToggleTema();

const libroId = new URLSearchParams(window.location.search).get("id");
const uidParam = new URLSearchParams(window.location.search).get("uid");
if (!libroId) window.location.href = "app.html";

document.getElementById("linkVolver").href = uidParam
  ? `app.html?uid=${encodeURIComponent(uidParam)}`
  : "app.html";

document.getElementById("btnSalir").addEventListener("click", async () => {
  await logout();
  window.location.href = "index.html";
});

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function listaDesdeTexto(texto) {
  return texto.split(",").map(s => s.trim()).filter(Boolean);
}

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

  const libroActual = await obtenerLibro(libroId);
  if (!libroActual) {
    document.getElementById("tituloLibro").textContent = "Libro no encontrado";
    return;
  }

  const soloLectura = libroActual.propietarioUid !== usuario.uid;
  pintarCabecera(libroActual, soloLectura);
  configurarEdicionLibro(libroActual, soloLectura);
  configurarSubpestañas();

  document.getElementById("btnExportarGuia").addEventListener("click", async (e) => {
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
    form: document.getElementById("formCapitulo"),
    lista: document.getElementById("listaCapitulos"),
    campoOrden: "numero",
    btnCancelarId: "btnCancelarCapitulo",
    leerFormulario: () => ({
      numero: Number(document.getElementById("capNumero").value),
      titulo: document.getElementById("capTitulo").value.trim(),
      rangoPaginas: {
        inicio: Number(document.getElementById("capPagInicio").value) || null,
        fin: Number(document.getElementById("capPagFin").value) || null
      },
      resumen: document.getElementById("capResumen").value.trim(),
      puntosClave: listaDesdeTexto(document.getElementById("capPuntos").value)
    }),
    llenarFormulario: (cap) => {
      document.getElementById("capNumero").value = cap.numero || "";
      document.getElementById("capTitulo").value = cap.titulo || "";
      document.getElementById("capPagInicio").value = cap.rangoPaginas?.inicio || "";
      document.getElementById("capPagFin").value = cap.rangoPaginas?.fin || "";
      document.getElementById("capResumen").value = cap.resumen || "";
      document.getElementById("capPuntos").value = (cap.puntosClave || []).join(", ");
    },
    renderItem: (cap) => {
      const paginas = cap.rangoPaginas && (cap.rangoPaginas.inicio || cap.rangoPaginas.fin)
        ? `<span class="meta num">pág. ${cap.rangoPaginas.inicio ?? "?"}–${cap.rangoPaginas.fin ?? "?"}</span>`
        : "";
      return `
        <div class="item-sub-cabecera">
          <h4>Cap. ${cap.numero}${cap.titulo ? " — " + escapeHtml(cap.titulo) : ""}</h4>
          ${paginas}
        </div>
        ${cap.resumen ? `<p>${escapeHtml(cap.resumen)}</p>` : ""}
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
    form: document.getElementById("formPersonaje"),
    lista: document.getElementById("listaPersonajes"),
    campoOrden: "nombre",
    btnCancelarId: "btnCancelarPersonaje",
    leerFormulario: () => ({
      nombre: document.getElementById("perNombre").value.trim(),
      rol: document.getElementById("perRol").value.trim(),
      relevancia: document.getElementById("perRelevancia").value,
      alias: listaDesdeTexto(document.getElementById("perAlias").value),
      descripcion: document.getElementById("perDescripcion").value.trim(),
      conexiones: listaDesdeTexto(document.getElementById("perConexiones").value)
    }),
    llenarFormulario: (per) => {
      document.getElementById("perNombre").value = per.nombre || "";
      document.getElementById("perRol").value = per.rol || "";
      document.getElementById("perRelevancia").value = per.relevancia || "principal";
      document.getElementById("perAlias").value = (per.alias || []).join(", ");
      document.getElementById("perDescripcion").value = per.descripcion || "";
      document.getElementById("perConexiones").value = (per.conexiones || []).join(", ");
    },
    renderItem: (per) => `
      <div class="item-sub-cabecera">
        <h4>${escapeHtml(per.nombre)}${per.rol ? " · " + escapeHtml(per.rol) : ""}</h4>
        <span class="chip">${RELEVANCIA_LABEL[per.relevancia] || per.relevancia}</span>
      </div>
      ${per.alias?.length ? `<p class="meta">También: ${per.alias.map(escapeHtml).join(", ")}</p>` : ""}
      ${per.descripcion ? `<p>${escapeHtml(per.descripcion)}</p>` : ""}
      ${per.conexiones?.length ? `<p class="meta">Asócialo con: ${per.conexiones.map(escapeHtml).join(" → ")}</p>` : ""}
    `
  });

  crearApartado({
    coleccion: "citas", soloLectura,
    form: document.getElementById("formCita"),
    lista: document.getElementById("listaCitas"),
    campoOrden: null,
    btnCancelarId: "btnCancelarCita",
    leerFormulario: () => ({
      texto: document.getElementById("citaTexto").value.trim(),
      pagina: Number(document.getElementById("citaPagina").value) || null,
      etiqueta: document.getElementById("citaEtiqueta").value.trim(),
      nota: document.getElementById("citaNota").value.trim(),
      favorita: document.getElementById("citaFavorita").checked
    }),
    llenarFormulario: (cita) => {
      document.getElementById("citaTexto").value = cita.texto || "";
      document.getElementById("citaPagina").value = cita.pagina || "";
      document.getElementById("citaEtiqueta").value = cita.etiqueta || "";
      document.getElementById("citaNota").value = cita.nota || "";
      document.getElementById("citaFavorita").checked = !!cita.favorita;
    },
    renderItem: (cita) => `
      <div class="item-sub-cabecera">
        <p>"${escapeHtml(cita.texto)}"</p>
        ${cita.favorita ? `<span class="chip favorita">★ Favorita</span>` : ""}
      </div>
      <p class="meta">${cita.pagina ? "pág. " + cita.pagina + " · " : ""}${escapeHtml(cita.etiqueta || "")}</p>
      ${cita.nota ? `<p class="meta">${escapeHtml(cita.nota)}</p>` : ""}
      <button class="boton-fantasma btn-copiar" style="margin-top:.5rem">Copiar</button>
    `
  });

  document.getElementById("listaCitas").addEventListener("click", (e) => {
    if (!e.target.classList.contains("btn-copiar")) return;
    const texto = e.target.closest(".item-sub").querySelector("p").textContent;
    navigator.clipboard.writeText(texto);
  });

  crearApartado({
    coleccion: "conceptos", soloLectura,
    form: document.getElementById("formConcepto"),
    lista: document.getElementById("listaConceptos"),
    campoOrden: "nombre",
    btnCancelarId: "btnCancelarConcepto",
    leerFormulario: () => ({
      nombre: document.getElementById("conNombre").value.trim(),
      significado: document.getElementById("conSignificado").value.trim()
    }),
    llenarFormulario: (con) => {
      document.getElementById("conNombre").value = con.nombre || "";
      document.getElementById("conSignificado").value = con.significado || "";
    },
    renderItem: (con) => `
      <div class="item-sub-cabecera"><h4>${escapeHtml(con.nombre)}</h4></div>
      ${con.significado ? `<p>${escapeHtml(con.significado)}</p>` : ""}
    `
  });
});

function pintarCabecera(libro, soloLectura) {
  document.getElementById("tituloLibro").textContent = libro.titulo;
  document.getElementById("autorLibro").textContent = libro.autor;

  if (libro.totalPaginas) {
    const pct = Math.round((libro.paginaActual / libro.totalPaginas) * 100);
    document.getElementById("progresoLibro").textContent =
      `${libro.paginaActual} / ${libro.totalPaginas} páginas · ${pct}%`;
    document.getElementById("rellenoProgreso").style.width = `${Math.min(pct, 100)}%`;
  } else {
    document.getElementById("progresoLibro").textContent = "Sin total de páginas registrado";
  }

  const portada = document.getElementById("portadaLibro");
  if (libro.portadaUrl) {
    portada.src = libro.portadaUrl;
    portada.alt = `Portada de ${libro.titulo}`;
    portada.hidden = false;
    portada.onerror = () => { portada.hidden = true; };
  } else {
    portada.hidden = true;
  }

  const linkTienda = document.getElementById("linkTiendaLibro");
  if (libro.url) {
    linkTienda.href = libro.url;
    linkTienda.style.display = "inline-block";
  } else {
    linkTienda.style.display = "none";
  }

  if (soloLectura) {
    document.getElementById("avisoSoloLectura").hidden = false;
  }
}

function configurarEdicionLibro(libroInicial, soloLectura) {
  let libroActual = libroInicial;
  const btnEditarLibro = document.getElementById("btnEditarLibro");
  const formEditarLibro = document.getElementById("formEditarLibro");

  if (soloLectura) {
    btnEditarLibro.hidden = true;
    return;
  }

  btnEditarLibro.addEventListener("click", () => {
    document.getElementById("editTitulo").value = libroActual.titulo || "";
    document.getElementById("editAutor").value = libroActual.autor || "";
    document.getElementById("editPortadaUrl").value = libroActual.portadaUrl || "";
    document.getElementById("editUrl").value = libroActual.url || "";
    document.getElementById("editGeneros").value = (libroActual.generos || []).join(", ");
    document.getElementById("editEtiquetas").value = (libroActual.etiquetas || []).join(", ");
    document.getElementById("editEstado").value = libroActual.estado || "leyendo";
    document.getElementById("editFormato").value = libroActual.formato || "fisico";
    document.getElementById("editTotalPaginas").value = libroActual.totalPaginas || "";
    document.getElementById("editPaginaActual").value = libroActual.paginaActual || 0;
    document.getElementById("editFechaInicio").value = libroActual.fechaInicio || "";
    document.getElementById("editFechaFin").value = libroActual.fechaFin || "";
    document.getElementById("editCalificacion").value = libroActual.calificacion || "";
    document.getElementById("editNotas").value = libroActual.notas || "";
    document.getElementById("editObservaciones").value = libroActual.observaciones || "";
    formEditarLibro.hidden = false;
    btnEditarLibro.hidden = true;
  });

  document.getElementById("btnCancelarEditarLibro").addEventListener("click", () => {
    formEditarLibro.hidden = true;
    btnEditarLibro.hidden = false;
  });

  formEditarLibro.addEventListener("submit", async (e) => {
    e.preventDefault();
    await actualizarLibro(libroId, {
      titulo: document.getElementById("editTitulo").value.trim(),
      autor: document.getElementById("editAutor").value.trim(),
      portadaUrl: document.getElementById("editPortadaUrl").value.trim(),
      url: document.getElementById("editUrl").value.trim(),
      generos: listaDesdeTexto(document.getElementById("editGeneros").value),
      etiquetas: listaDesdeTexto(document.getElementById("editEtiquetas").value),
      estado: document.getElementById("editEstado").value,
      formato: document.getElementById("editFormato").value,
      totalPaginas: Number(document.getElementById("editTotalPaginas").value) || null,
      paginaActual: Number(document.getElementById("editPaginaActual").value) || 0,
      fechaInicio: document.getElementById("editFechaInicio").value || null,
      fechaFin: document.getElementById("editFechaFin").value || null,
      calificacion: Number(document.getElementById("editCalificacion").value) || null,
      notas: document.getElementById("editNotas").value.trim(),
      observaciones: document.getElementById("editObservaciones").value.trim()
    });
    const libroActualizado = await obtenerLibro(libroId);
    libroActual = libroActualizado;
    pintarCabecera(libroActualizado, false);
    formEditarLibro.hidden = true;
    btnEditarLibro.hidden = false;
  });
}

function configurarSubpestañas() {
  const pestañas = document.querySelectorAll(".subpestañas .pestaña");
  const vistas = {
    capitulos: document.getElementById("vistaCapitulos"),
    personajes: document.getElementById("vistaPersonajes"),
    citas: document.getElementById("vistaCitas"),
    conceptos: document.getElementById("vistaConceptos")
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
  const btnCancelar = document.getElementById(btnCancelarId);

  if (soloLectura) {
    form.hidden = true;
  } else {
    const btnSubmit = form.querySelector('button[type="submit"]');
    const textoOriginal = btnSubmit.textContent;
    let editandoId = null;

    function salirModoEdicion() {
      editandoId = null;
      form.reset();
      btnSubmit.textContent = textoOriginal;
      btnCancelar.hidden = true;
    }

    btnCancelar.addEventListener("click", salirModoEdicion);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const datos = leerFormulario();
      if (editandoId) {
        await actualizarItem(libroId, coleccion, editandoId, datos);
      } else {
        await crearItem(libroId, coleccion, datos);
      }
      salirModoEdicion();
      cargar();
    });

    var activarEdicion = (item) => {
      editandoId = item.id;
      llenarFormulario(item);
      btnSubmit.textContent = "Guardar cambios";
      btnCancelar.hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    };
  }

  async function cargar() {
    const items = await obtenerItems(libroId, coleccion, campoOrden);
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
        btnEliminar.className = "boton-fantasma";
        btnEliminar.style.marginTop = ".6rem";
        btnEliminar.addEventListener("click", async () => {
          if (!confirm("¿Eliminar este elemento?")) return;
          await eliminarItem(libroId, coleccion, item.id);
          cargar();
        });

        div.appendChild(btnEditar);
        div.appendChild(btnEliminar);
      }

      lista.appendChild(div);
    });
  }

  cargar();
}
