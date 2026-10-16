// Pruebas de js/lector/sincronia.js. Sin dependencias: node tests/sincronia.test.mjs
import assert from "node:assert/strict";
import {
  huella, esHuella, claveTitulo, normalizarPos, limpiarAnotaciones, unirAnotaciones,
  reconciliar, validarImportacion, fusionarImportacion, registroDesdeImportacion, MAX_ANOTACIONES
} from "../js/lector/sincronia.js";

let n = 0;
const prueba = async (nombre, fn) => { await fn(); n++; console.log("ok -", nombre); };

const ann = (id, extra = {}) => ({ id, cap: 0, ini: 1, fin: 5, texto: "t", color: "#fff176", nota: "", fecha: "2026-10-15T00:00:00.000Z", ...extra });

await prueba("la huella depende solo del contenido y es estable", async () => {
  const a = new TextEncoder().encode("hola mundo");
  const h1 = await huella(a.buffer.slice(0));
  const h2 = await huella(new TextEncoder().encode("hola mundo").buffer);
  const h3 = await huella(new TextEncoder().encode("hola mundo!").buffer);
  assert.equal(h1, h2);
  assert.notEqual(h1, h3);
  assert.ok(esHuella(h1));
  assert.equal(h1.length, 32);
});

await prueba("esHuella y claveTitulo", () => {
  assert.equal(esHuella("abc"), false);
  assert.equal(esHuella("a|1|2"), false);
  assert.equal(esHuella(null), false);
  assert.equal(claveTitulo("  El  Señor de los Ánillos "), "el senor de los anillos");
});

await prueba("normalizarPos corrige valores raros", () => {
  assert.deepEqual(normalizarPos(null), { cap: 0, frac: 0 });
  assert.deepEqual(normalizarPos({ cap: -2, frac: 7 }), { cap: 0, frac: 1 });
  assert.deepEqual(normalizarPos({ cap: 3, frac: 0.25 }), { cap: 3, frac: 0.25 });
  assert.deepEqual(normalizarPos({ cap: 1.5, frac: NaN }), { cap: 0, frac: 0 });
});

await prueba("limpiarAnotaciones descarta inválidas, duplicadas y recorta textos", () => {
  const lista = [
    ann("a"), ann("a", { texto: "dup" }), ann("b", { color: "rojo" }), ann("c", { fin: 1 }),
    ann("d", { cap: -1 }), null, "x", ann("e", { texto: "x".repeat(500) }), ann("f", { ini: 1.5 })
  ];
  const r = limpiarAnotaciones(lista);
  assert.deepEqual(r.map(a => a.id), ["a", "e"]);
  assert.equal(r[1].texto.length, 160);
  assert.deepEqual(limpiarAnotaciones(undefined), []);
});

await prueba("limpiarAnotaciones respeta el máximo", () => {
  const muchas = Array.from({ length: MAX_ANOTACIONES + 50 }, (_, i) => ann("id" + i));
  assert.equal(limpiarAnotaciones(muchas).length, MAX_ANOTACIONES);
});

await prueba("reconciliar: solo local → se sube todo", () => {
  const r = reconciliar({ pos: { cap: 2, frac: .5 }, pct: 40, posTs: 100, ann: [ann("a")], annTs: 100 }, null);
  assert.equal(r.subirPos, true);
  assert.equal(r.subirAnn, true);
  assert.equal(r.pos.cap, 2);
});

await prueba("reconciliar: solo nube → se adopta sin subir nada", () => {
  const r = reconciliar(null, { pos: { cap: 7, frac: .1 }, pct: 70, posTs: 500, ann: [ann("z")], annTs: 500 });
  assert.equal(r.pos.cap, 7);
  assert.equal(r.subirPos, false);
  assert.equal(r.subirAnn, false);
  assert.equal(r.ann.length, 1);
});

await prueba("reconciliar: gana la posición más reciente (sin retroceso silencioso)", () => {
  const local  = { pos: { cap: 3, frac: 0 }, pct: 30, posTs: 1000, ann: [], annTs: 1 };
  const remoto = { pos: { cap: 9, frac: 0 }, pct: 90, posTs: 2000, ann: [], annTs: 1 };
  const r = reconciliar(local, remoto);
  assert.equal(r.pos.cap, 9);
  assert.equal(r.subirPos, false);
  // Y al revés: el local más nuevo se sube
  const r2 = reconciliar({ ...local, posTs: 3000 }, remoto);
  assert.equal(r2.pos.cap, 3);
  assert.equal(r2.subirPos, true);
});

await prueba("reconciliar: anotaciones por marca de tiempo", () => {
  const local  = { pos: {}, posTs: 1, ann: [ann("a"), ann("b")], annTs: 900 };
  const remoto = { pos: {}, posTs: 1, ann: [ann("a")], annTs: 100 };
  const r = reconciliar(local, remoto);
  assert.equal(r.ann.length, 2);
  assert.equal(r.subirAnn, true);
  const r2 = reconciliar({ ...local, annTs: 50 }, remoto);
  assert.equal(r2.ann.length, 1);
  assert.equal(r2.subirAnn, false);
});

await prueba("reconciliar: copia local sin sincronizar nunca pierde anotaciones (se unen)", () => {
  const local  = { pos: {}, posTs: 0, ann: [ann("local")], annTs: 0 };
  const remoto = { pos: {}, posTs: 5, ann: [ann("nube")], annTs: 5 };
  const r = reconciliar(local, remoto, 777);
  assert.deepEqual(r.ann.map(a => a.id).sort(), ["local", "nube"]);
  assert.equal(r.subirAnn, true);
  assert.equal(r.annTs, 777);
});

await prueba("reconciliar: datos de la nube corruptos no rompen", () => {
  const r = reconciliar(null, { pos: "basura", pct: "x", ann: "no-lista" });
  assert.deepEqual(r.pos, { cap: 0, frac: 0 });
  assert.deepEqual(r.ann, []);
  assert.throws(() => reconciliar(null, null));
});

await prueba("validarImportacion", () => {
  assert.throws(() => validarImportacion(null));
  assert.throws(() => validarImportacion({ libros: "x" }));
  assert.throws(() => validarImportacion({ version: 3, libros: [] }));
  const v = validarImportacion({ libros: [{ id: "a" }, { id: 5 }, null, { titulo: "sin id" }] });
  assert.equal(v.version, 1);
  assert.equal(v.libros.length, 1);
  assert.equal(validarImportacion({ version: 2, libros: [] }).version, 2);
});

await prueba("fusionarImportacion: añade anotaciones que faltan y conserva las existentes", () => {
  const actual = { pos: { cap: 5, frac: .5 }, pct: 50, posTs: 1000, ann: [ann("a")], annTs: 10 };
  const r = fusionarImportacion(actual, { pos: { cap: 1, frac: 0 }, pct: 5, posTs: 500, ann: [ann("a"), ann("b")] }, 9999);
  assert.deepEqual(r.ann.map(a => a.id), ["a", "b"]);
  assert.equal(r.nuevasAnn, 1);
  assert.equal(r.annTs, 9999);
  assert.equal(r.pos.cap, 5, "una posición más antigua no pisa la actual");
  assert.equal(r.cambioPos, false);
});

await prueba("fusionarImportacion: posición más nueva o archivo antiguo sin fecha gana", () => {
  const actual = { pos: { cap: 5, frac: 0 }, pct: 50, posTs: 1000, ann: [], annTs: 10 };
  assert.equal(fusionarImportacion(actual, { pos: { cap: 8, frac: 0 }, pct: 80, posTs: 2000 }).pos.cap, 8);
  const v1 = fusionarImportacion(actual, { pos: { cap: 2, frac: .3 } }, 4242);
  assert.equal(v1.pos.cap, 2);
  assert.equal(v1.posTs, 4242);
});

await prueba("registroDesdeImportacion sanea y vincula solo libros válidos", () => {
  const x = { id: "a".repeat(32), titulo: "T".repeat(999), formato: "otro", libroId: "L1", pct: 250, pos: { cap: 2, frac: .2 }, ann: [ann("a"), { basura: 1 }] };
  const r = registroDesdeImportacion(x, true, 1);
  assert.equal(r.titulo.length, 300);
  assert.equal(r.formato, "epub");
  assert.equal(r.libroId, "L1");
  assert.equal(r.pct, 100);
  assert.equal(r.ann.length, 1);
  assert.equal(registroDesdeImportacion(x, false, 1).libroId, null);
});

await prueba("unirAnotaciones prioriza la primera lista", () => {
  const r = unirAnotaciones([ann("a", { texto: "primera" })], [ann("a", { texto: "segunda" }), ann("b")]);
  assert.equal(r.find(a => a.id === "a").texto, "primera");
  assert.equal(r.length, 2);
});

console.log(`\n${n} pruebas pasaron`);
