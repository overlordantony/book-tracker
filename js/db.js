import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  deleteField,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, auth } from "./firebase-init.js";

const librosRef = collection(db, "libros");

// Crea un libro nuevo. datos = { titulo, autor, portadaUrl, url, generos,
// etiquetas, estado, formato, totalPaginas, paginaActual, fechaInicio,
// fechaFin, calificacion, notas, observaciones }
export async function crearLibro(datos) {
  const doc = await addDoc(librosRef, {
    ...datos,
    propietarioUid: auth.currentUser.uid,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp()
  });
  return doc.id;
}

// Devuelve los libros de un usuario (el que tiene sesión iniciada por
// defecto, o cualquier otro uid si lo pasas — usado por el panel de
// administración para ver la biblioteca de otra persona).
// Más recientes primero (el orden se hace en el cliente para no
// depender de un índice compuesto en Firestore).
export async function obtenerLibros(uidObjetivo) {
  const uid = uidObjetivo || auth.currentUser.uid;
  const q = query(librosRef, where("propietarioUid", "==", uid));
  const snapshot = await getDocs(q);
  const libros = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  return libros.sort((a, b) => (b.creadoEn?.toMillis() || 0) - (a.creadoEn?.toMillis() || 0));
}

// Devuelve un libro por id, o null si no existe.
export async function obtenerLibro(libroId) {
  const snap = await getDoc(doc(db, "libros", libroId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function actualizarLibro(libroId, cambios) {
  return updateDoc(doc(db, "libros", libroId), {
    ...cambios,
    actualizadoEn: serverTimestamp()
  });
}

// --- Papelera y eliminación de libros ---------------------------------
//
// Eliminar un libro es un proceso de dos pasos:
//   1) moverALaPapelera(): borrado lógico (campo "eliminadoEn"). Es reversible y
//      no cambia "actualizadoEn", así que no altera las estadísticas.
//   2) eliminarLibroDefinitivo(): solo para libros que ya están en la papelera.
//      Borra primero capítulos, personajes, citas y conceptos y al final el libro.
//      El orden importa: las reglas de Firestore comprueban el dueño leyendo el
//      libro padre, así que el padre debe existir mientras se borran sus ítems.
//      Si se interrumpe a medias el libro sigue en la papelera y basta con repetir.

export const SUBCOLECCIONES = ["capitulos", "personajes", "citas", "conceptos"];
const MAX_OPS_POR_LOTE = 400; // Firestore admite 500 operaciones por lote

export function enPapelera(libro) {
  return Boolean(libro && libro.eliminadoEn);
}

export function moverALaPapelera(libroId) {
  return updateDoc(doc(db, "libros", libroId), { eliminadoEn: serverTimestamp() });
}

export function restaurarDePapelera(libroId) {
  return updateDoc(doc(db, "libros", libroId), { eliminadoEn: deleteField() });
}

// Cuántos elementos tiene cada subcolección (para avisar antes de borrar).
export async function contarContenido(libroId) {
  const sub = await obtenerSubcolecciones(libroId);
  return {
    capitulos: sub.capitulos.length,
    personajes: sub.personajes.length,
    citas: sub.citas.length,
    conceptos: sub.conceptos.length
  };
}

// onProgreso(hechas, total) se llama tras cada lote.
export async function eliminarLibroDefinitivo(libroId, onProgreso) {
  const libro = await obtenerLibro(libroId);
  if (!libro) return { items: 0 }; // ya no existe: nada que hacer
  if (!enPapelera(libro)) {
    throw new Error("Solo se pueden eliminar definitivamente los libros que están en la papelera.");
  }

  const porSub = await Promise.all(SUBCOLECCIONES.map(n => getDocs(subcoleccion(libroId, n))));
  const refs = porSub.flatMap(snap => snap.docs.map(d => d.ref));
  const total = refs.length + 1;
  let hechas = 0;
  onProgreso?.(hechas, total);

  for (let i = 0; i < refs.length; i += MAX_OPS_POR_LOTE) {
    const trozo = refs.slice(i, i + MAX_OPS_POR_LOTE);
    const lote = writeBatch(db);
    trozo.forEach(ref => lote.delete(ref));
    await lote.commit();
    hechas += trozo.length;
    onProgreso?.(hechas, total);
  }

  await deleteDoc(doc(db, "libros", libroId));
  onProgreso?.(total, total);
  return { items: refs.length };
}

// --- Subcolecciones genéricas: capitulos, personajes, citas ---

function subcoleccion(libroId, nombre) {
  return collection(db, "libros", libroId, nombre);
}

export async function crearItem(libroId, nombreColeccion, datos) {
  const ref = await addDoc(subcoleccion(libroId, nombreColeccion), {
    ...datos,
    creadoEn: serverTimestamp()
  });
  return ref.id;
}

export async function obtenerItems(libroId, nombreColeccion, campoOrden) {
  const q = campoOrden
    ? query(subcoleccion(libroId, nombreColeccion), orderBy(campoOrden))
    : subcoleccion(libroId, nombreColeccion);
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function eliminarItem(libroId, nombreColeccion, itemId) {
  return deleteDoc(doc(db, "libros", libroId, nombreColeccion, itemId));
}

export function actualizarItem(libroId, nombreColeccion, itemId, cambios) {
  return updateDoc(doc(db, "libros", libroId, nombreColeccion, itemId), cambios);
}

// --- Utilidades para respaldo, guía exportable y citas globales ---

// Trae las 4 subcolecciones de un libro de una sola vez.
export async function obtenerSubcolecciones(libroId) {
  const [capitulos, personajes, citas, conceptos] = await Promise.all([
    obtenerItems(libroId, "capitulos", "numero"),
    obtenerItems(libroId, "personajes", "nombre"),
    obtenerItems(libroId, "citas"),
    obtenerItems(libroId, "conceptos", "nombre")
  ]);
  return { capitulos, personajes, citas, conceptos };
}

// Citas de todos los libros indicados, cada una marcada con su libro.
// (Se hace libro por libro en vez de con una consulta de grupo porque
// así no hace falta duplicar el dueño en cada cita ni tocar las reglas.)
export async function obtenerCitasDeLibros(libros) {
  const grupos = await Promise.all(libros.map(async (l) => {
    const citas = await obtenerItems(l.id, "citas");
    return citas.map(c => ({ ...c, libroId: l.id, libroTitulo: l.titulo, libroAutor: l.autor }));
  }));
  return grupos.flat();
}

// Todos los libros de todos los usuarios. Solo funciona para un admin
// (las reglas de Firestore lo rechazan para cualquier otra persona).
export async function obtenerTodosLosLibros() {
  const snapshot = await getDocs(librosRef);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Capítulos de todos los libros indicados (para las estadísticas de páginas).
// Si falla la lectura de algún libro no se lanza error: se cuentan los fallidos
// para que la pantalla de estadísticas pueda avisar y seguir mostrando lo demás.
export async function obtenerCapitulosDeLibros(libros) {
  const resultados = await Promise.allSettled(libros.map(l => obtenerItems(l.id, "capitulos")));
  const capitulos = [];
  let fallidos = 0;
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") r.value.forEach(c => capitulos.push({ ...c, libroId: libros[i].id }));
    else fallidos++;
  });
  return { capitulos, fallidos };
}
