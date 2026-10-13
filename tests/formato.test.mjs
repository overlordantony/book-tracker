// Pruebas de js/formato.js. Sin dependencias: node tests/formato.test.mjs
import assert from "node:assert/strict";
import { renderizarHTML as r, aTextoPlano as plano, urlSegura } from "../js/formato.js";

let n = 0;
const prueba = (nombre, fn) => { fn(); n++; console.log("ok -", nombre); };

prueba("marcas básicas", () => {
  assert.equal(r("**a**"), "<p><strong>a</strong></p>");
  assert.equal(r("*a*"), "<p><em>a</em></p>");
  assert.equal(r("++a++"), "<p><u>a</u></p>");
  assert.equal(r("~~a~~"), "<p><del>a</del></p>");
  assert.equal(r("==a=="), "<p><mark>a</mark></p>");
  assert.equal(r("**negrita con *cursiva* dentro**"), "<p><strong>negrita con <em>cursiva</em> dentro</strong></p>");
});

prueba("listas y párrafos", () => {
  assert.equal(r("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
  assert.equal(r("1. a\n2) b"), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(r("uno\ndos\n\ntres"), "<p>uno<br>dos</p><p>tres</p>");
  assert.equal(r(""), "");
  assert.equal(r(null), "");
});

prueba("enlaces seguros y marcas alrededor del enlace", () => {
  assert.match(r("[web](https://ejemplo.com/a?b=1&c=2)"), /<a href="https:\/\/ejemplo\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer nofollow">web<\/a>/);
  assert.match(r("**[web](https://ejemplo.com)**"), /<strong><a href=/);
  assert.match(r("[correo](mailto:a@b.com)"), /href="mailto:a@b\.com"/);
});

prueba("texto heredado no se altera", () => {
  assert.equal(r("2 * 3 * 4 = 24"), "<p>2 * 3 * 4 = 24</p>");
  assert.equal(r("a == b y C++ es un lenguaje"), "<p>a == b y C++ es un lenguaje</p>");
  assert.equal(r("Precio: $5 & más"), "<p>Precio: $5 &amp; más</p>");
  assert.equal(r("Un capítulo — sin marcas."), "<p>Un capítulo — sin marcas.</p>");
});

prueba("entradas maliciosas se muestran como texto", () => {
  const ataques = [
    "<script>alert(1)</script>",
    "**<img src=x onerror=alert(1)>**",
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD4=)",
    "[x](https://a.com\"onmouseover=\"alert(1))",
    "[x](https://a.com'onmouseover='alert(1))",
    "[<b>x</b>](https://a.com)",
    "<a href=\"javascript:alert(1)\">x</a>",
    "==<iframe src=//evil></iframe>==",
    "\uE0000\uE001"
  ];
  for (const a of ataques) {
    const html = r(a);
    assert.ok(!/<(script|img|iframe|b)[\s>]/i.test(html), "etiqueta peligrosa en: " + a + " → " + html);
    assert.ok(!/href="javascript:/i.test(html) && !/href="data:/i.test(html), "href peligroso en: " + a);
    assert.ok(!/\son\w+=/i.test(html.replace(/&quot;|&#39;/g, "")) || !/<[^>]*\son\w+=/i.test(html), "atributo de evento en: " + a);
  }
});

prueba("solo se generan etiquetas permitidas", () => {
  const html = r("# t\n**a** *b* ++c++ ~~d~~ ==e== [f](https://x.com)\n- g\n1. h <u>i</u>");
  const etiquetas = new Set([...html.matchAll(/<\/?([a-z0-9]+)/gi)].map(m => m[1].toLowerCase()));
  for (const e of etiquetas) assert.ok(["p","br","ul","ol","li","strong","em","u","del","mark","a"].includes(e), "etiqueta inesperada: " + e);
});

prueba("urlSegura", () => {
  assert.equal(urlSegura("https://a.com"), "https://a.com/");
  assert.equal(urlSegura("javascript:alert(1)"), null);
  assert.equal(urlSegura("ftp://a.com"), null);
  assert.equal(urlSegura("https://a.com/ b"), null);
  assert.equal(urlSegura(""), null);
});

prueba("texto plano", () => {
  assert.equal(plano("**a** *b* ==c== ~~d~~ ++e++"), "a b c d e");
  assert.equal(plano("[web](https://a.com)"), "web (https://a.com)");
  assert.equal(plano("- x\n- y"), "• x\n• y");
});

console.log(`\n${n} grupos de pruebas correctos`);
