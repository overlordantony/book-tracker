// Lógica pura de sincronización del lector: sin DOM ni Firebase, para poder
// probarla con node (tests/sincronia.test.mjs).
//
// Modelo: cada libro del lector es un documento de la colección `lecturas`
// (ver js/lecturas.js). Posición y anotaciones llevan cada una su propia marca
// de tiempo del cliente (posTs / annTs, en milisegundos). Al abrir un libro se
// comparan la copia local (IndexedDB) y la de la nube: gana la más reciente de
// cada parte, así un dispositivo atrasado nunca pisa una posición más nueva.

export const VERSION_ESQUEMA = 1;
export const MAX_ANOTACIONES = 3000;   // un documento de Firestore admite ~1 MiB
const COLOR = /^#[0-9a-f]{6}$/i;

// ---------- Identidad del libro ----------

// Huella del contenido del archivo (SHA-256, 128 bits en hexadecimal). Es la
// misma en cualquier dispositivo, a diferencia de nombre+tamaño+fecha.
export async function huella(buffer) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) {
    throw new Error("Este navegador no permite calcular la huella del libro. Abre la app con HTTPS o desde localhost.");
  }
  const bytes = new Uint8Array(await subtle.digest("SHA-256", buffer));
  return Array.from(bytes.slice(0, 16), b => b.toString(16).padStart(2, "0")).join("");
}

export const esHuella = (s) => typeof s === "string" && /^[0-9a-f]{32}$/.test(s);

// Para emparejar libros de un respaldo antiguo (que no tiene huella) por título.
export const claveTitulo = (t) =>
  String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// ---------- Posición y anotaciones ----------

export function normalizarPos(p) {
  const cap = Number.isInteger(p?.cap) && p.cap >= 0 ? p.cap : 0;
  const frac = typeof p?.frac === "number" && isFinite(p.frac) ? Math.min(1, Math.max(0, p.frac)) : 0;
  return { cap, frac };
}

// Descarta anotaciones mal formadas, quita duplicados por id y limita la cantidad.
export function limpiarAnotaciones(lista) {
  if (!Array.isArray(lista)) return [];
  const vistos = new Set();
  const salida = [];
  for (const a of lista) {
    if (!a || typeof a !== "object") continue;
    if (typeof a.id !== "string" || !a.id || vistos.has(a.id)) continue;
    if (!Number.isInteger(a.cap) || a.cap < 0) continue;
    if (!Number.isInteger(a.ini) || !Number.isInteger(a.fin) || a.ini < 0 || a.fin <= a.ini) continue;
    if (typeof a.color !== "string" || !COLOR.test(a.color)) continue;
    vistos.add(a.id);
    salida.push({
      id: a.id.slice(0, 40),
      cap: a.cap,
      ini: a.ini,
      fin: a.fin,
      texto: String(a.texto ?? "").slice(0, 160),
      color: a.color,
      nota: String(a.nota ?? "").slice(0, 500),
      fecha: typeof a.fecha === "string" ? a.fecha.slice(0, 40) : ""
    });
    if (salida.length >= MAX_ANOTACIONES) break;
  }
  return salida;
}

// Une dos listas por id (las de `a` tienen prioridad).
export function unirAnotaciones(a, b) {
  return limpiarAnotaciones([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]);
}

// ---------- Reconciliar copia local y copia en la nube ----------

// local / remoto: { pos, pct, posTs, ann, annTs } (cualquiera puede ser null).
// Devuelve el estado resultante y qué hay que subir a la nube.
export function reconciliar(local, remoto, ahora = Date.now()) {
  if (!local && !remoto) throw new Error("reconciliar: no hay datos");

  if (!remoto) {
    return {
      pos: normalizarPos(local.pos), pct: local.pct || 0, posTs: local.posTs || ahora,
      ann: limpiarAnotaciones(local.ann), annTs: local.annTs || ahora,
      subirPos: true, subirAnn: true
    };
  }
  if (!local) {
    return {
      pos: normalizarPos(remoto.pos), pct: remoto.pct || 0, posTs: remoto.posTs || 0,
      ann: limpiarAnotaciones(remoto.ann), annTs: remoto.annTs || 0,
      subirPos: false, subirAnn: false
    };
  }

  const lp = local.posTs || 0, rp = remoto.posTs || 0;
  const la = local.annTs || 0, ra = remoto.annTs || 0;

  const posLocal = lp > rp;
  const base = posLocal ? local : remoto;
  const res = {
    pos: normalizarPos(base.pos), pct: base.pct || 0, posTs: base.posTs || 0,
    subirPos: posLocal
  };

  if (la === 0 && Array.isArray(local.ann) && local.ann.length) {
    // Copia local que nunca se sincronizó: no se pierde nada, se unen ambas listas.
    res.ann = unirAnotaciones(remoto.ann, local.ann);
    res.annTs = ahora;
    res.subirAnn = res.ann.length !== limpiarAnotaciones(remoto.ann).length;
  } else if (la > ra) {
    res.ann = limpiarAnotaciones(local.ann); res.annTs = la; res.subirAnn = true;
  } else {
    res.ann = limpiarAnotaciones(remoto.ann); res.annTs = ra; res.subirAnn = false;
  }
  return res;
}

// ---------- Importar un archivo JSON exportado ----------

export function validarImportacion(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.libros)) {
    throw new Error("El archivo no tiene el formato de datos del lector.");
  }
  const version = typeof d.version === "number" ? d.version : 1;
  if (version > 2) throw new Error("El archivo es de una versión más nueva que este lector.");
  const libros = d.libros.filter(x => x && typeof x === "object" && typeof x.id === "string" && x.id);
  return { version, libros };
}

// Fusiona un libro del archivo (`entrante`) en el que ya existe (`actual`).
// Posición: gana la más reciente (o la del archivo si es antiguo y no trae fecha,
// porque importar es una orden explícita). Anotaciones: se añaden las que faltan.
export function fusionarImportacion(actual, entrante, ahora = Date.now()) {
  const tomarPos = !!entrante.pos && (!entrante.posTs || entrante.posTs > (actual.posTs || 0));
  const ids = new Set((actual.ann || []).map(a => a.id));
  const nuevas = limpiarAnotaciones(entrante.ann).filter(a => !ids.has(a.id));
  const ann = limpiarAnotaciones([...(actual.ann || []), ...nuevas]);
  return {
    pos: tomarPos ? normalizarPos(entrante.pos) : normalizarPos(actual.pos),
    pct: tomarPos ? clamp(entrante.pct) : (actual.pct || 0),
    posTs: tomarPos ? (entrante.posTs || ahora) : (actual.posTs || 0),
    ann,
    annTs: nuevas.length ? ahora : (actual.annTs || 0),
    cambioPos: tomarPos,
    nuevasAnn: nuevas.length
  };
}

function clamp(n) {
  return typeof n === "number" && isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
}

// Registro nuevo (sin archivo en este dispositivo) a partir de un libro del archivo.
export function registroDesdeImportacion(x, libroIdValido, ahora = Date.now()) {
  return {
    id: x.id,
    titulo: String(x.titulo ?? "Sin título").slice(0, 300),
    autor: String(x.autor ?? "").slice(0, 300),
    formato: x.formato === "pdf" ? "pdf" : "epub",
    libroId: libroIdValido ? x.libroId : null,
    pos: normalizarPos(x.pos),
    pct: clamp(x.pct),
    posTs: x.posTs || ahora,
    ann: limpiarAnotaciones(x.ann),
    annTs: x.annTs || ahora
  };
}
