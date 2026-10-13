import { vigilarSesion, logout } from "./auth.js";
import { iniciarToggleTema } from "./theme.js";
import { obtenerPerfil } from "./roles.js";
import { crearUsuario, obtenerUsuarios, actualizarUsuario } from "./admin.js";
import { exportarTodo } from "./exportar.js";
import { auth } from "./firebase-init.js";
import { confirmarAccion, negrita } from "./modal.js";

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

const ROL_LABEL = { Admin: "Admin", Lector: "Lector" };
const ESTADO_LABEL = { Activo: "Activo", Inactivo: "Inactivo", Pendiente: "Pendiente" };

async function cargarUsuarios() {
  const lista = document.getElementById("listaUsuarios");
  let usuarios;
  try {
    usuarios = await obtenerUsuarios();
  } catch (err) {
    lista.innerHTML = `<p class="vacio">No se pudo cargar la lista de usuarios: ${escapeHtml(err.message)}</p>`;
    return;
  }
  lista.innerHTML = "";

  if (!usuarios.length) {
    lista.innerHTML = `<p class="vacio">No hay usuarios registrados todavía.</p>`;
    return;
  }

  usuarios.forEach(u => {
    const div = document.createElement("div");
    div.className = "fila-libro" + (u.estado === "Pendiente" ? " estado-pausado" : u.estado === "Inactivo" ? " estado-descartado" : "");
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

    const esYo = u.id === auth.currentUser?.uid;

    const formEdicion = document.createElement("form");
    formEdicion.className = "formulario-mini";
    formEdicion.hidden = true;
    formEdicion.innerHTML = `
      <div class="fila">
        <input type="text" class="editNombreUsuario" placeholder="Nombre o apodo" value="${escapeHtml(u.nombre || "")}">
        <select class="editRolUsuario" ${esYo ? "disabled" : ""}>
          <option value="Lector" ${u.rol === "Lector" ? "selected" : ""}>Lector</option>
          <option value="Admin" ${u.rol === "Admin" ? "selected" : ""}>Admin</option>
        </select>
      </div>
      <select class="editEstadoUsuario" ${esYo ? "disabled" : ""}>
        <option value="Activo" ${u.estado === "Activo" ? "selected" : ""}>Activo</option>
        <option value="Inactivo" ${u.estado === "Inactivo" ? "selected" : ""}>Inactivo</option>
        <option value="Pendiente" ${u.estado === "Pendiente" ? "selected" : ""}>Pendiente</option>
      </select>
      ${esYo ? `<p class="meta">Esta es tu cuenta: tu rol y tu estado solo los puede cambiar otro administrador, para que nadie se bloquee a sí mismo.</p>` : ""}
      <p class="error error-usuario" role="alert" hidden></p>
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
      const errorUsuario = formEdicion.querySelector(".error-usuario");
      const btnGuardar = formEdicion.querySelector('button[type="submit"]');
      errorUsuario.hidden = true;

      const cambios = {
        nombre: formEdicion.querySelector(".editNombreUsuario").value.trim(),
        rol: formEdicion.querySelector(".editRolUsuario").value,
        estado: formEdicion.querySelector(".editEstadoUsuario").value
      };
      const falla = (texto) => { errorUsuario.textContent = texto; errorUsuario.hidden = false; };

      btnGuardar.disabled = true;
      try {
        // Protecciones en pantalla (las reglas de Firestore no las imponen; ver docs/FIREBASE.md).
        const cambiaAcceso = cambios.rol !== u.rol || cambios.estado !== u.estado;
        if (esYo && cambiaAcceso) {
          return falla("No puedes cambiar tu propio rol ni tu estado. Pídele a otro administrador que lo haga.");
        }
        const eraAdminActivo = u.rol === "Admin" && u.estado === "Activo";
        const seguiraAdminActivo = cambios.rol === "Admin" && cambios.estado === "Activo";
        if (eraAdminActivo && !seguiraAdminActivo) {
          const actuales = await obtenerUsuarios(); // lista fresca, por si otro admin cambió algo
          const otros = actuales.filter(x => x.id !== u.id && x.rol === "Admin" && x.estado === "Activo").length;
          if (!otros) return falla("Debe quedar al menos un administrador activo. Crea o activa otro administrador antes de hacer este cambio.");
        }

        if (cambios.estado !== u.estado && cambios.estado === "Inactivo") {
          const ok = await confirmarAccion({
            titulo: "Desactivar usuario",
            mensaje: [negrita(u.nombre || u.email), " no podrá usar la bitácora mientras esté inactivo. Sus libros y datos se conservan."],
            aviso: "Esto no elimina su cuenta de acceso (Firebase Authentication). Puedes reactivarlo cuando quieras.",
            textoConfirmar: "Desactivar"
          });
          if (!ok) return;
        }
        if (cambios.rol !== u.rol && cambios.rol === "Admin") {
          const ok = await confirmarAccion({
            titulo: "Dar permisos de administrador",
            mensaje: [negrita(u.nombre || u.email), " podrá ver las bibliotecas de todos los usuarios y administrar cuentas."],
            textoConfirmar: "Dar permisos",
            peligro: false
          });
          if (!ok) return;
        }

        await actualizarUsuario(u.id, cambios);
        cargarUsuarios();
      } catch (err) {
        falla("No se pudieron guardar los cambios: " + err.message);
      } finally {
        btnGuardar.disabled = false;
      }
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
