import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db, auth } from "./firebase-init.js";
import { obtenerLibros, restaurarDePapelera, eliminarLibroDefinitivo } from "./db.js";
import { leerArchivoLibro } from "./respaldo-libro.js";

// Restaurar un respaldo .json generado por "Descargar respaldo" (exportar.js).
//
// Estrategia (pensada para no perder datos si algo falla a medias):
//   1) Se escribe TODO lo del archivo (setDoc con el mismo id → sobrescribe si existe).
//   2) Después se borra lo que había y no viene en el archivo.
// Si se corta la conexión entre 1 y 2, no se pierde nada: basta con repetir la
// restauración con el mismo archivo (es idempotente).

const SUBCOLECCIONES = ["capitulos", "personajes", "citas", "conceptos"];
const MAX_BYTES = 25 * 1024 * 1024;   // tope razonable para un .json de respaldo
const MAX_OPS_POR_LOTE = 400;         // Firestore admite 500 operaciones por lote

// ---------- Utilidades ----------

// ISO string / número / Date → Timestamp. Si no se puede interpretar, usa "ahora"
// (así nunca queda un campo de fecha roto que haga fallar las estadísticas).
function aTimestamp(valor) {
  const f = valor ? new Date(valor) : null;
  return f && !isNaN(f) ? Timestamp.fromDate(f) : Timestamp.now();
}

// Un id de documento válido en Firestore: texto no vacío, sin "/" y distinto de "." / "..".
function idValido(id) {
  return typeof id === "string" && id.length > 0 && id.length < 1500 &&
    !id.includes("/") && id !== "." && id !== "..";
}

function esObjeto(x) {
  return x && typeof x === "object" && !Array.isArray(x);
}

// ---------- 1) Leer y validar el archivo ----------

// Devuelve { libros, resumen } listo para mostrar en la confirmación.
// Lanza Error con un mensaje legible si el archivo no sirve.
export async function prepararRespaldo(archivo) {
  if (!archivo) throw new Error("No se seleccionó ningún archivo.");
  if (archivo.size > MAX_BYTES) throw new Error("El archivo es demasiado grande para ser un respaldo de la bitácora.");

  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    throw new Error("El archivo no es un JSON válido. Usa un archivo generado con \"Descargar respaldo\".");
  }

  if (!esObjeto(datos) || datos.app !== "bitacora-de-lectura" || !Array.isArray(datos.libros)) {
    throw new Error("Este archivo no parece un respaldo de la Bitácora de lectura.");
  }
  if (typeof datos.version === "number" && datos.version > 1) {
    throw new Error("El respaldo es de una versión más nueva de la app y no se puede restaurar aquí.");
  }
  // «Cargar respaldo» REEMPLAZA la biblioteca: un archivo de un solo libro la dejaría con ese único libro.
  if (datos.tipo === "libro") {
    throw new Error("Este archivo es el respaldo de un solo libro. Impórtalo con «Importar libro»: así se añade sin tocar el resto de tu biblioteca.");
  }

  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión no está activa. Vuelve a iniciar sesión.");

  let entrantes = datos.libros.filter(esObjeto);

  // Un respaldo completo (admin) trae libros de varios usuarios: de ahí solo
  // restauramos los que son tuyos. Uno de un solo usuario se restaura entero
  // a tu cuenta (útil si te cambiaste de cuenta).
  const duenos = new Set(entrantes.map(l => l.propietarioUid).filter(Boolean));
  let omitidos = 0;
  if (duenos.size > 1) {
    const propios = entrantes.filter(l => l.propietarioUid === uid);
    omitidos = entrantes.length - propios.length;
    entrantes = propios;
  }
  if (!entrantes.length) {
    throw new Error(duenos.size > 1
      ? "El respaldo contiene libros de otros usuarios, pero ninguno es tuyo."
      : "El respaldo no contiene libros.");
  }

  // Normaliza ids (los libros/ítems sin id válido reciben uno nuevo) y evita duplicados.
  const idsLibros = new Set();
  const libros = entrantes.map(l => {
    let id = idValido(l.id) && !idsLibros.has(l.id) ? l.id : doc(collection(db, "libros")).id;
    idsLibros.add(id);
    const { id: _id, ...campos } = l;
    const subs = {};
    for (const nombre of SUBCOLECCIONES) {
      delete campos[nombre];
      const usados = new Set();
      subs[nombre] = (Array.isArray(l[nombre]) ? l[nombre] : []).filter(esObjeto).map(it => {
        const iid = idValido(it.id) && !usados.has(it.id)
          ? it.id
          : doc(collection(db, "libros", id, nombre)).id;
        usados.add(iid);
        const { id: _iid, ...resto } = it;
        return { id: iid, datos: resto };
      });
    }
    return { id, campos, subs };
  });

  const totalItems = libros.reduce(
    (n, l) => n + SUBCOLECCIONES.reduce((m, s) => m + l.subs[s].length, 0), 0);

  return {
    libros,
    resumen: {
      totalLibros: libros.length,
      totalItems,
      omitidos,
      exportadoEn: datos.exportadoEn || null
    }
  };
}

// ---------- 2) Restaurar ----------

// onProgreso(hechas, total) se llama tras cada lote.
export async function restaurarRespaldo(preparado, onProgreso) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión no está activa. Vuelve a iniciar sesión.");

  // --- Qué se va a escribir ---
  const escrituras = []; // { ruta: [..], datos }
  const rutasNuevas = new Set();

  for (const l of preparado.libros) {
    const { creadoEn, actualizadoEn, propietarioUid, eliminadoEn, ...resto } = l.campos;
    const ruta = ["libros", l.id];
    escrituras.push({
      ruta,
      datos: {
        ...resto,
        propietarioUid: uid,
        creadoEn: aTimestamp(creadoEn),
        actualizadoEn: aTimestamp(actualizadoEn),
        // Papelera: un libro eliminado (borrado lógico) vuelve a la papelera al restaurar.
        ...(eliminadoEn ? { eliminadoEn: aTimestamp(eliminadoEn) } : {})
      }
    });
    rutasNuevas.add(ruta.join("/"));

    for (const nombre of SUBCOLECCIONES) {
      for (const it of l.subs[nombre]) {
        const rutaItem = ["libros", l.id, nombre, it.id];
        const { creadoEn: cItem, ...restoItem } = it.datos;
        escrituras.push({ ruta: rutaItem, datos: { ...restoItem, creadoEn: aTimestamp(cItem) } });
        rutasNuevas.add(rutaItem.join("/"));
      }
    }
  }

  // --- Qué hay ahora y no viene en el archivo (se borrará al final) ---
  const actuales = await obtenerLibros(uid);
  // Los ítems se borran ANTES que su libro: las reglas de Firestore comprueban el dueño
  // leyendo el libro padre, así que éste debe seguir existiendo mientras se borran sus ítems.
  const sobrantesItems = [];
  const sobrantesLibros = [];
  for (const libro of actuales) {
    const rutaLibro = ["libros", libro.id];
    if (!rutasNuevas.has(rutaLibro.join("/"))) sobrantesLibros.push(rutaLibro);
    const porSub = await Promise.all(
      SUBCOLECCIONES.map(n => getDocs(collection(db, "libros", libro.id, n)))
    );
    porSub.forEach((snap, i) => snap.docs.forEach(d => {
      const ruta = ["libros", libro.id, SUBCOLECCIONES[i], d.id];
      if (!rutasNuevas.has(ruta.join("/"))) sobrantesItems.push(ruta);
    }));
  }
  const sobrantes = [...sobrantesItems, ...sobrantesLibros];

  const total = escrituras.length + sobrantes.length;
  let hechas = 0;
  onProgreso?.(hechas, total);

  async function enLotes(lista, aplicar) {
    for (let i = 0; i < lista.length; i += MAX_OPS_POR_LOTE) {
      const lote = writeBatch(db);
      const trozo = lista.slice(i, i + MAX_OPS_POR_LOTE);
      trozo.forEach(item => aplicar(lote, item));
      await lote.commit();
      hechas += trozo.length;
      onProgreso?.(hechas, total);
    }
  }

  await enLotes(escrituras, (lote, e) => lote.set(doc(db, ...e.ruta), e.datos));
  await enLotes(sobrantes, (lote, ruta) => lote.delete(doc(db, ...ruta)));

  return { libros: preparado.libros.length, items: preparado.resumen.totalItems, eliminados: sobrantes.length };
}

// ---------- Importar UN libro (respaldo de un solo libro) ----------
//
// A diferencia de «Cargar respaldo», esto solo AÑADE: nunca modifica ni borra nada de
// lo que ya existe. Siempre crea un libro nuevo con ids nuevos y a nombre de quien
// importa, así que sirve igual para restaurar un libro propio (queda una copia) que
// para recibir uno de otra persona.

// Lee y valida el archivo. Devuelve { libro, items, resumen } listo para confirmar.
export async function prepararLibro(archivo) {
  if (!archivo) throw new Error("No se seleccionó ningún archivo.");
  if (archivo.size > MAX_BYTES) throw new Error("El archivo es demasiado grande para ser el respaldo de un libro.");
  let datos;
  try {
    datos = JSON.parse(await archivo.text());
  } catch {
    throw new Error("El archivo no es un JSON válido. Usa un archivo generado con «Exportar libro».");
  }
  return leerArchivoLibro(datos);
}

// onProgreso(hechas, total) se llama tras cada paso. Devuelve { id, items }.
export async function importarLibro(preparado, onProgreso) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Tu sesión no está activa. Vuelve a iniciar sesión.");

  const { libro, items } = preparado;
  const referencia = doc(collection(db, "libros"));
  const id = referencia.id;
  const escrituras = [];
  for (const nombre of SUBCOLECCIONES) {
    for (const it of items[nombre]) {
      const { creadoEn, ...resto } = it;
      escrituras.push({
        ref: doc(collection(db, "libros", id, nombre)),
        datos: { ...resto, creadoEn: aTimestamp(creadoEn) }
      });
    }
  }
  const total = escrituras.length + 2;
  let hechas = 0;
  onProgreso?.(hechas, total);

  // 1) El libro se crea OCULTO (en la papelera) y en su propia escritura: las reglas
  //    comprueban el dueño de cada ítem leyendo el libro padre, que debe existir antes.
  //    Así, si algo falla a medias, nunca queda un libro incompleto a la vista.
  const { creadoEn, actualizadoEn, ...campos } = libro;
  await setDoc(referencia, {
    ...campos,
    propietarioUid: uid,
    creadoEn: aTimestamp(creadoEn),
    actualizadoEn: aTimestamp(actualizadoEn),
    eliminadoEn: Timestamp.now()
  });
  onProgreso?.(++hechas, total);

  try {
    // 2) Los ítems, por lotes.
    for (let i = 0; i < escrituras.length; i += MAX_OPS_POR_LOTE) {
      const lote = writeBatch(db);
      const trozo = escrituras.slice(i, i + MAX_OPS_POR_LOTE);
      trozo.forEach(e => lote.set(e.ref, e.datos));
      await lote.commit();
      hechas += trozo.length;
      onProgreso?.(hechas, total);
    }
    // 3) Se hace visible (no cambia "actualizadoEn", así que no altera las estadísticas).
    await restaurarDePapelera(id);
    onProgreso?.(total, total);
  } catch (err) {
    // Limpieza: el libro sigue en la papelera, así que se puede eliminar por completo.
    try { await eliminarLibroDefinitivo(id); } catch { /* si tampoco se puede, queda en la papelera */ }
    throw err;
  }
  return { id, items: escrituras.length };
}
