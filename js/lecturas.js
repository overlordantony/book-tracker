import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, auth } from "./firebase-init.js";

// Colección independiente `lecturas`: una entrada por libro leído en el lector
// integrado (posición, anotaciones y metadatos). NO contiene el archivo del libro
// (Firestore no es un almacén de archivos; el binario queda en este dispositivo).
//
// Id del documento = "<uid>_<huella>": la huella (SHA-256 del contenido) es la misma
// en cualquier dispositivo, así que el mismo libro se reconoce en PC y móvil.
// El prefijo del uid lo exigen las reglas (firestore.rules) y evita colisiones
// entre cuentas. Dentro de la app el libro se identifica solo por su huella.
//
// Campos: propietarioUid, huella, titulo, autor, formato ("epub"|"pdf"), tamano,
// nombreArchivo, libroId (id del libro de la bitácora o null), pos {cap, frac}, pct,
// posTs, ann [..], annTs, portadaMini (dataURL pequeño), version, creadoEn,
// ultimaLecturaEn.

const lecturasRef = collection(db, "lecturas");

const idDoc = (huella) => `${auth.currentUser.uid}_${huella}`;

function normalizar(snap) {
  const datos = snap.data();
  const prefijo = auth.currentUser.uid.length + 1;
  return { ...datos, id: datos.huella || snap.id.slice(prefijo) };
}

// Todas las lecturas de la persona con sesión iniciada.
export async function listarLecturas() {
  const q = query(lecturasRef, where("propietarioUid", "==", auth.currentUser.uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(normalizar);
}

// Una lectura por huella, o null si no existe.
export async function obtenerLectura(huella) {
  const snap = await getDoc(doc(db, "lecturas", idDoc(huella)));
  return snap.exists() ? normalizar(snap) : null;
}

// Crea o actualiza solo los campos indicados (merge). Los valores no pueden ser undefined.
export function guardarLectura(huella, datos) {
  return setDoc(
    doc(db, "lecturas", idDoc(huella)),
    { ...datos, propietarioUid: auth.currentUser.uid },
    { merge: true }
  );
}

export function borrarLectura(huella) {
  return deleteDoc(doc(db, "lecturas", idDoc(huella)));
}

// Lectura vinculada a un libro de la bitácora (la más reciente si hubiera varias).
export async function obtenerLecturaDeLibro(libroId) {
  const todas = await listarLecturas();
  return todas
    .filter(l => l.libroId === libroId)
    .sort((a, b) => (b.posTs || 0) - (a.posTs || 0))[0] || null;
}
