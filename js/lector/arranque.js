// arranque.js — el lector solo se abre con sesión iniciada y cuenta "Activo"
// (igual que app.html y detalle.html); las reglas de Firestore lo exigen también.
import { vigilarSesion } from "../auth.js";
import { obtenerPerfil } from "../roles.js";
import { obtenerLibro } from "../db.js";

const App = window.App;
const puerta = document.getElementById("puerta");
const mensaje = document.getElementById("puerta-msg");
const volver = document.getElementById("volver");
let iniciado = false;

function bloquear(texto) {
  mensaje.textContent = texto;
  document.getElementById("puerta-volver").hidden = false;
}

vigilarSesion(async (usuario) => {
  if (!usuario) {
    window.location.href = "index.html";
    return;
  }
  if (iniciado) return;   // la sesión ya está en uso: no reiniciar el lector
  iniciado = true;

  const perfil = await obtenerPerfil(usuario.uid).catch(() => null);
  if (!perfil || perfil.estado !== "Activo") {
    bloquear(!perfil || perfil.estado === "Pendiente"
      ? "Tu cuenta está pendiente de aprobación por un administrador."
      : "Tu cuenta está inactiva. Contacta al administrador.");
    return;
  }

  // Todo lo local (IndexedDB) se separa por cuenta para no mezclar datos entre usuarios.
  App.uid = usuario.uid;

  // ?libro=<id>: abrir el lector en el contexto de un libro de la bitácora.
  const libroId = new URLSearchParams(window.location.search).get("libro");
  if (libroId) {
    try {
      const libro = await obtenerLibro(libroId);
      if (libro && libro.propietarioUid === usuario.uid) {
        App.libroId = libro.id;
        App.libro = { titulo: libro.titulo || "", autor: libro.autor || "" };
      }
    } catch { /* sin conexión: el lector funciona igual, sin vínculo */ }
  }
  volver.href = App.libroId ? `detalle.html?id=${encodeURIComponent(App.libroId)}` : "app.html";
  volver.title = App.libroId ? "Volver al libro" : "Volver a la bitácora";

  puerta.hidden = true;
  await App.Reader.iniciar();
});
