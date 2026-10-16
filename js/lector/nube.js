// nube.js — puente entre el lector (scripts clásicos, espacio de nombres `App`) y Firestore.
//
// Estrategia "local primero": el lector sigue guardando al instante en IndexedDB
// (por cuenta) y este módulo replica a la colección `lecturas` con un pequeño retardo.
// Si no hay red, los cambios quedan en la cola y en IndexedDB; al abrir el libro se
// reconcilian por marca de tiempo (ver sincronia.js), así que nada se pierde.
import { serverTimestamp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth } from "../firebase-init.js";
import { listarLecturas, obtenerLectura, guardarLectura, borrarLectura } from "../lecturas.js";
import { obtenerLibros } from "../db.js";
import * as S from "./sincronia.js";

const App = window.App;
App.Sync = S;
App.huellaDe = async (archivo) => S.huella(await archivo.arrayBuffer());

const conTiempo = (promesa, ms) => Promise.race([
  promesa,
  new Promise((_, no) => setTimeout(() => no(new Error("Tiempo de espera agotado")), ms))
]);

// ---------- Indicador de estado ----------

const TEXTOS = {
  ok: ["Sincronizado", "Tus lecturas están guardadas en tu cuenta."],
  guardando: ["Guardando…", "Enviando cambios a tu cuenta."],
  offline: ["Sin conexión", "Sin conexión: los cambios se enviarán al reconectar."],
  error: ["Error · Reintentar", "No se pudo guardar en tu cuenta. Pulsa para reintentar."]
};
function marcar(estado) {
  const e = document.getElementById("sync");
  if (!e) return;
  e.dataset.estado = estado;
  e.textContent = TEXTOS[estado][0];
  e.title = TEXTOS[estado][1];
}

// ---------- Cola de escritura ----------

const sucio = new Map();   // huella -> { rec, pos, ann, todo, crear }
let temporizador = 0;
let enCurso = 0;

const metaDe = (r) => ({
  huella: r.id,
  titulo: String(r.titulo ?? "Sin título").slice(0, 300),
  autor: String(r.autor ?? "").slice(0, 300),
  formato: r.formato === "pdf" ? "pdf" : "epub",
  tamano: r.tamano || 0,
  nombreArchivo: String(r.nombreArchivo ?? "").slice(0, 300),
  libroId: r.libroId || null,
  version: S.VERSION_ESQUEMA
});

function datosDe(r, s) {
  const d = metaDe(r);
  if (s.crear) d.creadoEn = serverTimestamp();
  if (s.todo && r.mini) d.portadaMini = r.mini;
  if (s.pos) {
    Object.assign(d, {
      pos: S.normalizarPos(r.pos), pct: r.pct || 0, posTs: r.posTs || Date.now(),
      ultimaLecturaEn: serverTimestamp()
    });
  }
  if (s.ann) Object.assign(d, { ann: S.limpiarAnotaciones(r.ann), annTs: r.annTs || Date.now() });
  return d;
}

// Marca partes del libro como pendientes de subir: 'pos', 'ann', 'todo' (incluye
// portada) y 'crear' (fecha de creación, solo la primera vez).
function programar(rec, ...que) {
  const s = sucio.get(rec.id) || {};
  s.rec = rec;
  que.forEach(q => { s[q] = true; });
  sucio.set(rec.id, s);
  clearTimeout(temporizador);
  temporizador = setTimeout(vaciar, que.includes("ann") || que.includes("crear") ? 250 : 1500);
  marcar(navigator.onLine ? "guardando" : "offline");
}

async function vaciar() {
  clearTimeout(temporizador);
  if (!sucio.size) return;
  const lote = [...sucio];
  sucio.clear();
  enCurso++;
  marcar(navigator.onLine ? "guardando" : "offline");
  let fallo = false;

  await Promise.all(lote.map(async ([id, s]) => {
    try {
      await guardarLectura(id, datosDe(s.rec, s));
    } catch (e) {
      fallo = true;
      console.error("No se pudo guardar la lectura", id, e);
      const p = sucio.get(id);   // si hubo cambios nuevos mientras tanto, se combinan
      sucio.set(id, {
        rec: p?.rec || s.rec,
        pos: s.pos || p?.pos, ann: s.ann || p?.ann, todo: s.todo || p?.todo, crear: s.crear || p?.crear
      });
    }
  }));

  enCurso--;
  if (fallo) marcar("error");
  else if (!sucio.size && !enCurso) marcar("ok");
}

document.getElementById("sync")?.addEventListener("click", vaciar);
addEventListener("online", () => { if (sucio.size) vaciar(); });
addEventListener("offline", () => { if (sucio.size || enCurso) marcar("offline"); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") vaciar(); });
addEventListener("pagehide", vaciar);

// ---------- Lectura ----------

// Estante combinado: lo de la nube + lo que solo está en este dispositivo.
// `nubeOk` es false si no se pudo consultar la cuenta.
async function estante() {
  let nube = [];
  let nubeOk = true;
  try { nube = await conTiempo(listarLecturas(), 8000); } catch (e) { nubeOk = false; console.warn("Estante sin nube:", e); }
  const locales = await App.db.todos("libros").catch(() => []);

  const mapa = new Map();
  for (const c of nube) mapa.set(c.id, { ...c, portada: null, mini: c.portadaMini || null, local: false, nube: true });
  for (const l of locales) {
    const c = mapa.get(l.id);
    if (!c) { mapa.set(l.id, { ...l, local: true, nube: false }); continue; }
    const r = S.reconciliar(l, c);
    mapa.set(l.id, {
      ...c, pos: r.pos, pct: r.pct, posTs: r.posTs, ann: r.ann, annTs: r.annTs,
      portada: l.portada || null, mini: l.mini || c.portadaMini || null, local: true, nube: true
    });
  }
  const lista = [...mapa.values()].sort((a, b) => (b.posTs || 0) - (a.posTs || 0));
  return { lista, nubeOk };
}

async function borrar(id) {
  sucio.delete(id);
  await conTiempo(borrarLectura(id), 10000);
}

// ---------- Exportar / importar ----------

async function exportar() {
  const { lista, nubeOk } = await estante();
  if (!nubeOk) throw new Error("No se pudo consultar tu cuenta. Comprueba la conexión e inténtalo de nuevo.");
  return {
    app: "bitacora-lector",
    version: 2,
    exportadoEn: new Date().toISOString(),
    ajustes: App.ajustes,
    libros: lista.map(l => ({
      id: l.id, titulo: l.titulo, autor: l.autor || "", formato: l.formato === "pdf" ? "pdf" : "epub",
      libroId: l.libroId || null, pos: l.pos, pct: l.pct || 0, posTs: l.posTs || 0,
      ann: S.limpiarAnotaciones(l.ann), annTs: l.annTs || 0
    }))
  };
}

// Importa un archivo exportado: versión 2 (por huella; crea lo que falte) o versión 1
// del lector independiente (solo fusiona con libros del estante que tengan el mismo título).
async function importar(datos) {
  const { version, libros } = S.validarImportacion(datos);
  await vaciar();
  const { lista, nubeOk } = await estante();
  if (!nubeOk) throw new Error("No se pudo consultar tu cuenta. Comprueba la conexión e inténtalo de nuevo.");
  const mios = new Set(await obtenerLibros().then(ls => ls.map(l => l.id)).catch(() => []));

  const r = { actualizados: 0, nuevos: 0, omitidos: 0 };
  for (const x of libros) {
    let actual = lista.find(a => a.id === x.id);
    if (!actual && version < 2) {
      const clave = S.claveTitulo(x.titulo);
      actual = clave ? lista.find(a => S.claveTitulo(a.titulo) === clave) : undefined;
    }

    if (actual) {
      const f = S.fusionarImportacion(actual, x);
      if (!f.cambioPos && !f.nuevasAnn) continue;
      const local = await App.db.get("libros", actual.id);
      if (local) await App.db.put("libros", { ...local, pos: f.pos, pct: f.pct, posTs: f.posTs, ann: f.ann, annTs: f.annTs });
      await conTiempo(guardarLectura(actual.id, {
        ...metaDe(actual), pos: f.pos, pct: f.pct, posTs: f.posTs, ann: f.ann, annTs: f.annTs
      }), 15000);
      r.actualizados++;
    } else if (version >= 2 && S.esHuella(x.id)) {
      const n = S.registroDesdeImportacion(x, x.libroId && mios.has(x.libroId));
      await conTiempo(guardarLectura(n.id, {
        ...metaDe(n), pos: n.pos, pct: n.pct, posTs: n.posTs, ann: n.ann, annTs: n.annTs,
        creadoEn: serverTimestamp()
      }), 15000);
      r.nuevos++;
    } else {
      r.omitidos++;
    }
  }
  return r;
}

App.Nube = {
  programar,
  vaciar,
  estante,
  borrar,
  exportar,
  importar,
  obtener: (id) => conTiempo(obtenerLectura(id), 8000),
  uid: () => auth.currentUser?.uid
};
