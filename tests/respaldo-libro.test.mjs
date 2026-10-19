// Pruebas de js/respaldo-libro.js. Sin dependencias: node tests/respaldo-libro.test.mjs
import assert from "node:assert/strict";
import {
  armarArchivoLibro, nombreArchivoLibro, leerArchivoLibro, MAX_ITEMS_POR_TIPO
} from "../js/respaldo-libro.js";

let n = 0;
const prueba = (nombre, fn) => { fn(); n++; console.log("ok -", nombre); };
const AHORA = Date.parse("2026-10-16T12:00:00Z");

const libroCompleto = () => ({
  id: "L1", propietarioUid: "uid-secreto", eliminadoEn: "2026-10-01T00:00:00.000Z",
  titulo: "El Principito", autor: "Saint-Exupéry", portadaUrl: "https://x.test/p.jpg", url: "https://tienda.test/libro",
  generos: ["Fábula"], etiquetas: ["clásico"], estado: "terminado", formato: "fisico",
  totalPaginas: 96, paginaActual: 96, fechaInicio: "2026-09-01", fechaFin: "2026-09-10", calificacion: 5,
  notas: "**gran** libro", observaciones: "", creadoEn: "2026-09-01T10:00:00.000Z", actualizadoEn: "2026-09-10T10:00:00.000Z",
  capitulos: [{ id: "c1", numero: 1, titulo: "I", rangoPaginas: { inicio: 1, fin: 10 }, resumen: "Resumen", puntosClave: ["a", "b"], creadoEn: "2026-09-02T00:00:00.000Z" }],
  personajes: [{ id: "p1", nombre: "El zorro", rol: "amigo", relevancia: "secundario", alias: [], descripcion: "Sabio", conexiones: ["Principito"] }],
  citas: [{ id: "q1", texto: "Lo esencial es invisible a los ojos", pagina: 70, etiqueta: "clave", nota: "", favorita: true }],
  conceptos: [{ id: "k1", nombre: "Domesticar", significado: "Crear lazos" }]
});

prueba("armarArchivoLibro quita ids, propietario y papelera, y marca tipo libro", () => {
  const a = armarArchivoLibro(libroCompleto(), "2026-10-16T00:00:00.000Z");
  assert.equal(a.app, "bitacora-de-lectura");
  assert.equal(a.tipo, "libro");
  assert.equal(a.version, 1);
  assert.equal(a.libros.length, 1);
  const l = a.libros[0];
  for (const prohibido of ["id", "propietarioUid", "eliminadoEn"]) assert.equal(prohibido in l, false, prohibido);
  assert.equal(JSON.stringify(a).includes("uid-secreto"), false);
  assert.equal("id" in l.capitulos[0], false);
  assert.equal(l.citas[0].texto, "Lo esencial es invisible a los ojos");
});

prueba("nombreArchivoLibro es seguro y legible", () => {
  assert.equal(nombreArchivoLibro("El Principito", "2026-10-16"), "libro-el-principito-2026-10-16.json");
  assert.equal(nombreArchivoLibro("¿Qué es esto? ../../etc/passwd", "2026-10-16"), "libro-que-es-esto-etc-passwd-2026-10-16.json");
  assert.equal(nombreArchivoLibro("", "2026-10-16"), "libro-sin-titulo-2026-10-16.json");
  assert.ok(nombreArchivoLibro("x".repeat(500)).length < 90);
});

prueba("ida y vuelta: exportar y leer conserva el contenido", () => {
  const archivo = JSON.parse(JSON.stringify(armarArchivoLibro(libroCompleto())));
  const r = leerArchivoLibro(archivo, AHORA);
  assert.equal(r.libro.titulo, "El Principito");
  assert.equal(r.libro.estado, "terminado");
  assert.equal(r.libro.calificacion, 5);
  assert.equal(r.libro.fechaFin, "2026-09-10");
  assert.equal(r.libro.notas, "**gran** libro");
  assert.deepEqual(r.resumen, { titulo: "El Principito", autor: "Saint-Exupéry", capitulos: 1, personajes: 1, citas: 1, conceptos: 1, totalItems: 4, descartados: 0, exportadoEn: archivo.exportadoEn });
  assert.deepEqual(r.items.capitulos[0].rangoPaginas, { inicio: 1, fin: 10 });
  assert.equal(r.items.citas[0].favorita, true);
  assert.equal(r.libro.creadoEn, "2026-09-01T10:00:00.000Z");
});

prueba("rechaza archivos que no son del tipo esperado", () => {
  assert.throws(() => leerArchivoLibro(null), /no parece un respaldo/);
  assert.throws(() => leerArchivoLibro({ app: "otra", libros: [] }), /no parece un respaldo/);
  assert.throws(() => leerArchivoLibro({ app: "bitacora-de-lectura", libros: "x" }), /no parece un respaldo/);
  assert.throws(() => leerArchivoLibro({ app: "bitacora-de-lectura", version: 2, libros: [{}] }), /versión más nueva/);
  assert.throws(() => leerArchivoLibro({ app: "bitacora-de-lectura", libros: [] }), /ningún libro/);
  assert.throws(() => leerArchivoLibro({ app: "bitacora-de-lectura", libros: [{ titulo: "a" }, { titulo: "b" }] }), /2 libros.*Cargar respaldo/);
  assert.throws(() => leerArchivoLibro({ app: "bitacora-de-lectura", libros: [{ titulo: "   " }] }), /no tiene título/);
});

prueba("entrada no confiable: solo se conservan campos conocidos y acotados", () => {
  const sucio = {
    app: "bitacora-de-lectura", version: 1, libros: [{
      titulo: "T".repeat(1000), autor: 42, propietarioUid: "otro", id: "../x", rolAdmin: true, __proto__: { x: 1 },
      portadaUrl: "javascript:alert(1)", url: "data:text/html,<script>1</script>",
      estado: "hackeado", formato: "otro", totalPaginas: -5, paginaActual: 9999, calificacion: 99,
      fechaInicio: "ayer", fechaFin: "2026-13-45", generos: ["ok", { a: 1 }, "", "g".repeat(500)],
      creadoEn: "2999-01-01T00:00:00Z", actualizadoEn: "no es fecha",
      capitulos: [null, "x", { titulo: "ok", numero: "3", rangoPaginas: { inicio: "5", fin: -2 }, puntosClave: "no lista", extra: "x" }, {}],
      personajes: [{ nombre: "Ana", relevancia: "dios" }, { rol: "sin nombre" }],
      citas: [{ texto: "", pagina: 3 }, { texto: "<img src=x onerror=alert(1)>", favorita: "true" }],
      conceptos: [{ nombre: "c", significado: 5 }]
    }]
  };
  const { libro, items, resumen } = leerArchivoLibro(sucio, AHORA);
  assert.equal(libro.titulo.length, 300);
  assert.equal(libro.autor, "42");
  for (const prohibido of ["propietarioUid", "id", "rolAdmin"]) assert.equal(prohibido in libro, false);
  assert.equal(libro.portadaUrl, "");
  assert.equal(libro.url, "");
  assert.equal(libro.estado, "Pendiente");
  assert.equal(libro.formato, "fisico");
  assert.equal(libro.totalPaginas, null);
  assert.equal(libro.paginaActual, 9999, "sin total válido no se recorta");
  assert.equal(libro.calificacion, null);
  assert.equal(libro.fechaInicio, null);
  assert.equal(libro.fechaFin, null);
  assert.deepEqual(libro.generos, ["ok", "g".repeat(100)]);
  assert.equal(libro.creadoEn, null, "fecha futura se ignora");
  assert.equal(libro.actualizadoEn, null);
  assert.equal(items.capitulos.length, 1);
  assert.equal(items.capitulos[0].numero, 3);
  assert.deepEqual(items.capitulos[0].rangoPaginas, { inicio: 5, fin: null });
  assert.deepEqual(items.capitulos[0].puntosClave, []);
  assert.equal(items.personajes.length, 1);
  assert.equal(items.personajes[0].relevancia, "principal");
  assert.equal(items.citas.length, 1);
  assert.equal(items.citas[0].favorita, false, "solo true booleano cuenta");
  assert.equal(items.citas[0].texto, "<img src=x onerror=alert(1)>", "el texto se guarda tal cual: se escapa al mostrarlo");
  assert.equal(items.conceptos[0].significado, "5");
  assert.ok(resumen.descartados >= 4, `descartados ${resumen.descartados}`);
});

prueba("la página actual se recorta al total y los enlaces http(s) válidos se conservan", () => {
  const { libro } = leerArchivoLibro({ app: "bitacora-de-lectura", libros: [{ titulo: "a", totalPaginas: 100, paginaActual: 250, url: "http://ok.test/x", portadaUrl: "https://ok.test/y.png" }] }, AHORA);
  assert.equal(libro.paginaActual, 100);
  assert.equal(libro.url, "http://ok.test/x");
  assert.equal(libro.portadaUrl, "https://ok.test/y.png");
});

prueba("limita la cantidad de elementos por tipo", () => {
  const citas = Array.from({ length: MAX_ITEMS_POR_TIPO + 25 }, (_, i) => ({ texto: "c" + i }));
  const { items, resumen } = leerArchivoLibro({ app: "bitacora-de-lectura", libros: [{ titulo: "a", citas }] }, AHORA);
  assert.equal(items.citas.length, MAX_ITEMS_POR_TIPO);
  assert.equal(resumen.descartados, 25);
});

prueba("libro vacío (solo título) es válido y usa valores por defecto", () => {
  const { libro, resumen } = leerArchivoLibro({ app: "bitacora-de-lectura", libros: [{ titulo: "Solo título" }] }, AHORA);
  assert.equal(libro.estado, "Pendiente");
  assert.equal(libro.paginaActual, 0);
  assert.equal(resumen.totalItems, 0);
});

console.log(`\n${n} pruebas pasaron`);
