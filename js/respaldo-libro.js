// Respaldo de UN solo libro (.json): armado del archivo y lectura/validación.
// Sin DOM ni Firebase, para probarlo con node (tests/respaldo-libro.test.mjs).
//
// Formato: el mismo envoltorio que el respaldo general (app "bitacora-de-lectura",
// version 1, lista "libros") más `tipo: "libro"`, con exactamente un libro. No lleva
// ids ni propietarioUid: al importar siempre se crea un libro NUEVO con ids nuevos,
// así que se puede compartir con otra persona o restaurar sin pisar nada.
//
// Un archivo compartido es una entrada NO confiable: al leerlo solo se conservan los
// campos conocidos, con tipos y tamaños acotados y enlaces http(s).

export const APP = "bitacora-de-lectura";
export const ESTADOS = ["Pendiente", "leyendo", "pausado", "terminado", "descartado"];
export const FORMATOS = ["fisico", "digital", "audiolibro"];
export const RELEVANCIAS = ["principal", "secundario", "menor", "mencionado"];
export const MAX_ITEMS_POR_TIPO = 2000;
const SUBS = ["capitulos", "personajes", "citas", "conceptos"];

// ---------- Exportar ----------

// `libro` = documento del libro + sus cuatro subcolecciones, con las fechas ya en ISO.
export function armarArchivoLibro(libro, exportadoEn = new Date().toISOString()) {
  const { id, propietarioUid, eliminadoEn, ...campos } = libro;
  for (const nombre of SUBS) {
    campos[nombre] = (Array.isArray(campos[nombre]) ? campos[nombre] : []).map(({ id: _id, ...resto }) => resto);
  }
  return { app: APP, version: 1, tipo: "libro", exportadoEn, libros: [campos] };
}

// Nombre de archivo seguro y legible: "libro-el-principito-2026-10-16.json".
export function nombreArchivoLibro(titulo, fecha = new Date().toISOString().slice(0, 10)) {
  const slug = String(titulo ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
  return `libro-${slug || "sin-titulo"}-${fecha}.json`;
}

// ---------- Importar: saneado ----------

const esObjeto = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

function texto(v, max) {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function entero(v, min = 0) {
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  return Number.isFinite(n) && Math.round(n) >= min ? Math.round(n) : null;
}
function lista(v, maxItems = 50, maxLen = 100) {
  return Array.isArray(v) ? v.map(x => texto(x, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}
function enlace(v) {
  const t = texto(v, 2000);
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? t : "";
  } catch { return ""; }
}
function diaISO(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : null;
}
// Fecha ISO válida y no futura; si no, null (al guardar se usará "ahora").
function instante(v, ahora) {
  const f = v ? new Date(v) : null;
  return f && !isNaN(f) && +f <= ahora ? f.toISOString() : null;
}

function capitulo(c, i, ahora) {
  return {
    numero: entero(c.numero, 0) ?? i + 1,
    titulo: texto(c.titulo, 300),
    rangoPaginas: {
      inicio: entero(c.rangoPaginas?.inicio, 1),
      fin: entero(c.rangoPaginas?.fin, 1)
    },
    resumen: texto(c.resumen, 50000),
    puntosClave: lista(c.puntosClave, 100, 500),
    creadoEn: instante(c.creadoEn, ahora)
  };
}
function personaje(p, _i, ahora) {
  return {
    nombre: texto(p.nombre, 300),
    rol: texto(p.rol, 300),
    relevancia: RELEVANCIAS.includes(p.relevancia) ? p.relevancia : "principal",
    alias: lista(p.alias, 50, 300),
    descripcion: texto(p.descripcion, 50000),
    conexiones: lista(p.conexiones, 100, 300),
    creadoEn: instante(p.creadoEn, ahora)
  };
}
function cita(c, _i, ahora) {
  return {
    texto: texto(c.texto, 5000),
    pagina: entero(c.pagina, 1),
    etiqueta: texto(c.etiqueta, 100),
    nota: texto(c.nota, 50000),
    favorita: c.favorita === true,
    creadoEn: instante(c.creadoEn, ahora)
  };
}
function concepto(c, _i, ahora) {
  return {
    nombre: texto(c.nombre, 300),
    significado: texto(c.significado, 50000),
    creadoEn: instante(c.creadoEn, ahora)
  };
}

// Qué hace válido a un elemento (los vacíos se descartan y se cuentan).
const ITEMS = {
  capitulos:  { sanear: capitulo,  valido: (x) => x.titulo || x.resumen || x.puntosClave.length },
  personajes: { sanear: personaje, valido: (x) => x.nombre },
  citas:      { sanear: cita,      valido: (x) => x.texto },
  conceptos:  { sanear: concepto,  valido: (x) => x.nombre }
};

// Lee el contenido ya parseado de un .json y devuelve { libro, items, resumen }.
// Lanza Error con un mensaje legible si no es un respaldo de un solo libro.
export function leerArchivoLibro(datos, ahora = Date.now()) {
  if (!esObjeto(datos) || datos.app !== APP || !Array.isArray(datos.libros)) {
    throw new Error("Este archivo no parece un respaldo de la Bitácora de lectura.");
  }
  if (typeof datos.version === "number" && datos.version > 1) {
    throw new Error("El archivo es de una versión más nueva de la app y no se puede importar aquí.");
  }
  const libros = datos.libros.filter(esObjeto);
  if (libros.length !== 1) {
    throw new Error(libros.length === 0
      ? "El archivo no contiene ningún libro."
      : `El archivo contiene ${libros.length} libros. Para restaurar una biblioteca completa usa «Cargar respaldo»; aquí solo se importa un libro.`);
  }
  const l = libros[0];

  const titulo = texto(l.titulo, 300);
  if (!titulo) throw new Error("El libro del archivo no tiene título.");

  const totalPaginas = entero(l.totalPaginas, 1);
  let paginaActual = entero(l.paginaActual, 0) ?? 0;
  if (totalPaginas && paginaActual > totalPaginas) paginaActual = totalPaginas;
  const calificacion = entero(l.calificacion, 1);

  const libro = {
    titulo,
    autor: texto(l.autor, 300),
    portadaUrl: enlace(l.portadaUrl),
    url: enlace(l.url),
    generos: lista(l.generos),
    etiquetas: lista(l.etiquetas),
    estado: ESTADOS.includes(l.estado) ? l.estado : "Pendiente",
    formato: FORMATOS.includes(l.formato) ? l.formato : "fisico",
    totalPaginas,
    paginaActual,
    fechaInicio: diaISO(l.fechaInicio),
    fechaFin: diaISO(l.fechaFin),
    calificacion: calificacion && calificacion <= 5 ? calificacion : null,
    notas: texto(l.notas, 50000),
    observaciones: texto(l.observaciones, 50000),
    creadoEn: instante(l.creadoEn, ahora),
    actualizadoEn: instante(l.actualizadoEn, ahora)
  };

  const items = {};
  let descartados = 0;
  for (const nombre of SUBS) {
    const crudos = Array.isArray(l[nombre]) ? l[nombre] : [];
    const { sanear, valido } = ITEMS[nombre];
    const buenos = crudos.filter(esObjeto).map((x, i) => sanear(x, i, ahora)).filter(valido);
    descartados += crudos.length - Math.min(buenos.length, MAX_ITEMS_POR_TIPO);
    items[nombre] = buenos.slice(0, MAX_ITEMS_POR_TIPO);
  }

  return {
    libro,
    items,
    resumen: {
      titulo,
      autor: libro.autor,
      capitulos: items.capitulos.length,
      personajes: items.personajes.length,
      citas: items.citas.length,
      conceptos: items.conceptos.length,
      totalItems: SUBS.reduce((n, s) => n + items[s].length, 0),
      descartados,
      exportadoEn: typeof datos.exportadoEn === "string" ? datos.exportadoEn : null
    }
  };
}
