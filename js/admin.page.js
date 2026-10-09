import { vigilarSesion, logout } from "./auth.js";
import { iniciarToggleTema } from "./theme.js";
import { obtenerPerfil } from "./roles.js";
import { crearUsuario, obtenerUsuarios, actualizarUsuario } from "./admin.js";
import { exportarTodo } from "./exportar.js";

iniciarToggleTema();

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
  if (!perfil || perfil.rol !== "Admin" || perfil.estado !== "Activo") {
    document.getElementById("bloqueado").hidden = false;
    return;
  }
  document.getElementById("contenidoAdmin").hidden = false;
  cargarUsuarios();
});

const form = document.getElementById("formUsuario");
const errorEl = document.getElementById("errorUsuario");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const nombre = document.getElementById("nuevoNombre").value.trim();
  const email = document.getElementById("nuevoEmail").value.trim();
  const password = document.getElementById("nuevaPassword").value;
  const rol = document.getElementById("nuevoRol").value;

  try {
    await crearUsuario(email, password, rol, nombre);
    form.reset();
    cargarUsuarios();
  } catch (err) {
    errorEl.textContent = "No se pudo crear: " + err.message;
    errorEl.hidden = false;
  }
});

const ROL_LABEL = { admin: "Admin", lector: "Lector" };
const ESTADO_LABEL = { activo: "Activo", inactivo: "Inactivo", pendiente: "Pendiente" };

async function cargarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  const usuarios = await obtenerUsuarios();
  lista.innerHTML = "";

  if (!usuarios.length) {
    lista.innerHTML = `<p class="vacio">No hay usuarios registrados todavía.</p>`;
    return;
  }

  usuarios.forEach(u => {
    const div = document.createElement("div");
    div.className = "fila-libro" + (u.estado === "Pendiente" ? " estado-pausado" : u.estado === "inactivo" ? " estado-descartado" : "");
    div.innerHTML = `
      <div>
        <h3>${escapeHtml(u.nombre) || escapeHtml(u.email)}</h3>
        <p class="autor">${escapeHtml(u.email)} · ${ROL_LABEL[u.rol] || u.rol}</p>
      </div>
      <div class="acciones">
        <span class="chip${u.estado === "Pendiente" ? " favorita" : ""}">${ESTADO_LABEL[u.estado] || u.estado || "—"}</span>
        <button type="button" class="boton-fantasma btn-editar-usuario">Editar</button>
        <a class="boton-fantasma" style="text-decoration:none" href="app.html?uid=${encodeURIComponent(u.id)}">
          Ver biblioteca
        </a>
      </div>
    `;

    const formEdicion = document.createElement("form");
    formEdicion.className = "formulario-mini";
    formEdicion.hidden = true;
    formEdicion.innerHTML = `
      <div class="fila">
        <input type="text" class="editNombreUsuario" placeholder="Nombre o apodo" value="${escapeHtml(u.nombre || "")}">
        <select class="editRolUsuario">
          <option value="Lector" ${u.rol === "Lector" ? "selected" : ""}>Lector</option>
          <option value="Admin" ${u.rol === "Admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>
      <select class="editEstadoUsuario">
        <option value="Activo" ${u.estado === "Activo" ? "selected" : ""}>Activo</option>
        <option value="inactivo" ${u.estado === "inactivo" ? "selected" : ""}>Inactivo</option>
        <option value="Pendiente" ${u.estado === "Pendiente" ? "selected" : ""}>Pendiente</option>
      </select>
      <div style="display:flex;gap:.6rem">
        <button type="submit" class="boton-principal">Guardar</button>
        <button type="button" class="boton-fantasma btn-cancelar-usuario">Cancelar</button>
      </div>
    `;

    div.querySelector(".btn-editar-usuario").addEventListener("click", () => {
      formEdicion.hidden = !formEdicion.hidden;
    });
    formEdicion.querySelector(".btn-cancelar-usuario").addEventListener("click", () => {
      formEdicion.hidden = true;
    });
    formEdicion.addEventListener("submit", async (e) => {
      e.preventDefault();
      await actualizarUsuario(u.id, {
        nombre: formEdicion.querySelector(".editNombreUsuario").value.trim(),
        rol: formEdicion.querySelector(".editRolUsuario").value,
        estado: formEdicion.querySelector(".editEstadoUsuario").value
      });
      cargarUsuarios();
    });

    const contenedor = document.createElement("div");
    contenedor.appendChild(div);
    contenedor.appendChild(formEdicion);
    lista.appendChild(contenedor);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

document.getElementById("btnRespaldoTotal").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Preparando…";
  try {
    await exportarTodo();
  } catch (err) {
    alert("No se pudo generar el respaldo: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
});
