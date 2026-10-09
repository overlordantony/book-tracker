import { obtenerCapitulosDeLibros } from "./db.js";

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

const MESES = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ESTADOS = [
  ["leyendo", "Leyendo"],
  ["terminado", "Terminado"],
  ["pendiente", "Pendiente"],
  ["pausado", "Pausado"],
  ["descartado", "Descartado"]
];
const SEMANAS_EN_GRAFICA = 12;
const AÑOS_EN_GRAFICA = 8;

// ---------- Fechas (todo tolerante a datos faltantes o raros) ----------

// Timestamp de Firestore / Date / ISO / número → Date, o null si no hay dato válido.
function aFecha(v) {
  try {
    if (!v) return null;
    let d = v;
    if (typeof v.toDate === "function") d = v.toDate();
    else if (typeof v.toMillis === "function") d = new Date(v.toMillis());
    else if (typeof v === "string" || typeof v === "number") d = new Date(v);
    return d instanceof Date && !isNaN(d) ? d : null;
  } catch {
    return null;
  }
}

// Lunes (00:00 local) de la semana de la fecha dada.
function inicioSemana(fecha) {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}

// Fecha en la que se considera terminado un libro: fechaFin si existe,
// si no, la última actualización del documento.
function fechaDeCierre(libro) {
  if (libro.fechaFin) {
    const f = new Date(libro.fechaFin + "T00:00:00");
    if (!isNaN(f)) return f;
  }
  return aFecha(libro.actualizadoEn);
}

// ---------- Extracción de datos: cada fuente → [{ fecha, valor }] ----------

// Páginas de un capítulo = fin − inicio + 1. Si falta inicio o fin, o el rango
// está invertido, el capítulo no aporta páginas (no se puede calcular).
function paginasDeCapitulo(cap) {
  const ini = Number(cap?.rangoPaginas?.inicio);
  const fin = Number(cap?.rangoPaginas?.fin);
  if (!ini || !fin || fin < ini) return 0;
  return fin - ini + 1;
}

// Libros: un punto por libro, en su fecha de creación (creadoEn).
function itemsLibros(libros) {
  return libros.map(l => ({ fecha: aFecha(l.creadoEn), valor: 1 })).filter(i => i.fecha);
}

// Páginas: rango de cada capítulo (rangoPaginas) en la fecha de creación del capítulo (creadoEn).
function itemsPaginas(capitulos) {
  return capitulos
    .map(c => ({ fecha: aFecha(c.creadoEn), valor: paginasDeCapitulo(c) }))
    .filter(i => i.fecha && i.valor > 0);
}

// Seguimiento: página actual de cada libro, en la fecha de su última actualización (actualizadoEn).
function itemsSeguimiento(libros) {
  return libros
    .map(l => ({ fecha: aFecha(l.actualizadoEn), valor: Number(l.paginaActual) || 0 }))
    .filter(i => i.fecha && i.valor > 0);
}

// ---------- Series para las gráficas ----------

function serieMensual(items, año) {
  const valores = Array(12).fill(0);
  items.forEach(({ fecha, valor }) => { if (fecha.getFullYear() === año) valores[fecha.getMonth()] += valor; });
  const mesActual = new Date().getFullYear() === año ? new Date().getMonth() : -1;
  return { etiquetas: MESES, valores, actual: mesActual, titulos: MESES_LARGOS.map(m => `${m} ${año}`) };
}

function serieAnual(items, años) {
  const lista = años.slice(-AÑOS_EN_GRAFICA);
  const valores = lista.map(a => items.reduce((s, i) => s + (i.fecha.getFullYear() === a ? i.valor : 0), 0));
  return {
    etiquetas: lista.map(a => "’" + String(a).slice(-2)),
    valores,
    actual: lista.indexOf(new Date().getFullYear()),
    titulos: lista.map(String)
  };
}

function serieSemanal(items) {
  const lunesActual = inicioSemana(new Date());
  const lunes = Array.from({ length: SEMANAS_EN_GRAFICA }, (_, i) => sumarDias(lunesActual, -7 * (SEMANAS_EN_GRAFICA - 1 - i)));
  const indice = new Map(lunes.map((d, i) => [d.getTime(), i]));
  const valores = Array(SEMANAS_EN_GRAFICA).fill(0);
  items.forEach(({ fecha, valor }) => {
    const i = indice.get(inicioSemana(fecha).getTime());
    if (i !== undefined) valores[i] += valor;
  });
  return {
    etiquetas: lunes.map(d => `${d.getDate()}/${d.getMonth() + 1}`),
    valores,
    actual: SEMANAS_EN_GRAFICA - 1,
    titulos: lunes.map(d => `Semana del ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`),
    semanal: true
  };
}

// ---------- Totales de las tarjetas ----------

function totalDesde(items, desde, hasta) {
  return items.reduce((s, { fecha, valor }) => (fecha >= desde && (!hasta || fecha < hasta) ? s + valor : s), 0);
}

function totalesActuales(items) {
  const hoy = new Date();
  const lunes = inicioSemana(hoy);
  return {
    semana: totalDesde(items, lunes),
    semanaPasada: totalDesde(items, sumarDias(lunes, -7), lunes),
    mes: totalDesde(items, new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    año: totalDesde(items, new Date(hoy.getFullYear(), 0, 1))
  };
}

// ---------- Piezas de HTML ----------

const fmt = (n) => Number(n || 0).toLocaleString("es");
// Etiqueta corta sobre la barra (para que no se desborde en móvil)
const corto = (n) => n >= 10000 ? Math.round(n / 1000) + "k" : n >= 1000 ? (n / 1000).toFixed(1).replace(".0", "") + "k" : String(n);

function tarjetas(lista) {
  return `<div class="tiles">${lista.map(t => `
    <div class="tile"><span class="tile-valor num">${typeof t.valor === "number" ? fmt(t.valor) : escapeHtml(t.valor)}</span><span class="tile-etiqueta">${t.etiqueta}</span></div>`).join("")}
  </div>`;
}

function segmentos(grupo, opciones, activo) {
  return `<div class="segmentos" role="group" aria-label="Período">${opciones.map(([id, etq]) => `
    <button type="button" class="segmento${id === activo ? " activo" : ""}" data-grupo="${grupo}" data-periodo="${id}" aria-pressed="${id === activo}">${etq}</button>`).join("")}
  </div>`;
}

function grafica(serie) {
  // Sin ningún dato en el rango → mensaje en vez de una gráfica vacía.
  if (!serie.valores.some(v => v > 0)) return `<p class="sin-datos">Sin datos</p>`;
  const max = Math.max(...serie.valores, 1);
  return `
    <div class="barras-mes${serie.semanal ? " barras-semana" : ""}" style="--cols:${serie.valores.length}">
      ${serie.valores.map((n, i) => `
        <div class="barra-mes${i === serie.actual ? " actual" : ""}" title="${escapeHtml(serie.titulos[i])}: ${fmt(n)}">
          <span class="num barra-mes-n">${n ? corto(n) : ""}</span>
          <div class="barra-mes-col"><div class="barra-mes-relleno" style="height:${n ? Math.max((n / max) * 100, 4) : 0}%"></div></div>
          <span class="barra-mes-etq">${escapeHtml(serie.etiquetas[i])}</span>
        </div>`).join("")}
    </div>`;
}

// ---------- Estado y render ----------

const estadoPorContenedor = new WeakMap(); // contenedor → { libros, capitulos, fallidos, ... }
const capitulosPorLibros = new WeakMap();  // array de libros → Promise (evita releer al cambiar de pestaña)

function cargarCapitulos(libros) {
  if (!capitulosPorLibros.has(libros)) {
    capitulosPorLibros.set(libros, obtenerCapitulosDeLibros(libros).catch(() => ({ capitulos: [], fallidos: libros.length })));
  }
  return capitulosPorLibros.get(libros);
}

export async function renderEstadisticas(libros, contenedor) {
  if (!libros.length) {
    estadoPorContenedor.delete(contenedor);
    contenedor.innerHTML = `<p class="vacio">Agrega algunos libros para ver tus estadísticas.</p>`;
    return;
  }

  let ui = estadoPorContenedor.get(contenedor);
  if (!ui) {
    ui = { periodoLibros: "mensual", periodoPaginas: "semanal", año: new Date().getFullYear() };
    estadoPorContenedor.set(contenedor, ui);
    // Un solo listener por contenedor: cambia período/año y repinta con los datos ya cargados.
    contenedor.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".segmento");
      if (!btn || !ui.libros) return;
      if (btn.dataset.grupo === "libros") ui.periodoLibros = btn.dataset.periodo;
      if (btn.dataset.grupo === "paginas") ui.periodoPaginas = btn.dataset.periodo;
      pintar(contenedor, ui);
    });
    contenedor.addEventListener("change", (e) => {
      if (e.target?.id === "selectorAñoEstadisticas" && ui.libros) {
        ui.año = Number(e.target.value) || new Date().getFullYear();
        pintar(contenedor, ui);
      }
    });
  }

  ui.token = libros; // identifica este render; si llega otro después, este se descarta
  ui.libros = null;  // mientras carga, los clics sobre contenido viejo se ignoran
  if (!capitulosPorLibros.has(libros)) contenedor.innerHTML = `<p class="vacio">Calculando estadísticas…</p>`;
  const { capitulos, fallidos } = await cargarCapitulos(libros);

  // Si mientras tanto se pidió otro render (otros libros), este resultado ya no vale.
  if (estadoPorContenedor.get(contenedor) !== ui || ui.token !== libros) return;
  ui.libros = libros;
  ui.capitulos = capitulos;
  ui.fallidos = fallidos;
  pintar(contenedor, ui);
}

function pintar(contenedor, ui) {
  const { libros, capitulos } = ui;
  const hoy = new Date();
  const añoActual = hoy.getFullYear();

  const datosLibros = itemsLibros(libros);
  const datosPaginas = itemsPaginas(capitulos);
  const datosSeguimiento = itemsSeguimiento(libros);

  // Años con datos (siempre incluye el actual) para el selector y la vista anual.
  const añosConDatos = new Set([añoActual]);
  [...datosLibros, ...datosPaginas, ...datosSeguimiento].forEach(i => añosConDatos.add(i.fecha.getFullYear()));
  libros.forEach(l => { const f = fechaDeCierre(l); if (f) añosConDatos.add(f.getFullYear()); });
  const años = [...añosConDatos].sort((a, b) => a - b);
  if (!años.includes(ui.año)) ui.año = añoActual;
  const año = ui.año;

  // --- Resumen general (igual que antes) ---
  const terminados = libros.filter(l => l.estado === "terminado");
  const terminadosAño = terminados.filter(l => fechaDeCierre(l)?.getFullYear() === año);
  const paginasLeidas = libros.reduce((suma, l) => {
    if (l.estado === "terminado") return suma + (l.totalPaginas || l.paginaActual || 0);
    return suma + (l.paginaActual || 0);
  }, 0);
  const paginasAño = terminadosAño.reduce((s, l) => s + (l.totalPaginas || 0), 0);
  const conNota = libros.filter(l => l.calificacion);
  const promedio = conNota.length
    ? (conNota.reduce((s, l) => s + l.calificacion, 0) / conNota.length).toFixed(1)
    : "—";

  // --- Libros (creadoEn): mensual / anual ---
  const totLibros = totalesActuales(datosLibros);
  const serieLibros = ui.periodoLibros === "anual" ? serieAnual(datosLibros, años) : serieMensual(datosLibros, año);

  // --- Páginas (rangoPaginas + creadoEn): semanal / mensual ---
  const totPaginas = totalesActuales(datosPaginas);
  const seriePaginas = ui.periodoPaginas === "mensual" ? serieMensual(datosPaginas, año) : serieSemanal(datosPaginas);

  // --- Páginas de seguimiento (actualizadoEn): semanal ---
  const totSeguimiento = totalesActuales(datosSeguimiento);
  const serieSeguimiento = serieSemanal(datosSeguimiento);

  // Terminados por mes (fechaFin) — se conserva de la versión anterior
  const porMes = Array(12).fill(0);
  terminadosAño.forEach(l => { porMes[fechaDeCierre(l).getMonth()]++; });
  const serieTerminados = { etiquetas: MESES, valores: porMes, actual: año === añoActual ? hoy.getMonth() : -1, titulos: MESES_LARGOS.map(m => `${m} ${año}`) };

  // Conteo por estado
  const conteo = Object.fromEntries(ESTADOS.map(([k]) => [k, 0]));
  libros.forEach(l => { if (conteo[l.estado] !== undefined) conteo[l.estado]++; });

  // Leyendo ahora, con lo que falta
  const leyendo = libros.filter(l => l.estado === "leyendo" && l.totalPaginas);

  contenedor.innerHTML = `
    <div class="estad-barra">
      <h3 class="titulo-seccion">Resumen · ${año}</h3>
      <label class="selector-año">Año
        <select id="selectorAñoEstadisticas">
          ${[...años].reverse().map(a => `<option value="${a}"${a === año ? " selected" : ""}>${a}</option>`).join("")}
        </select>
      </label>
    </div>
    ${tarjetas([
      { valor: terminadosAño.length, etiqueta: `Terminados en ${año}` },
      { valor: paginasAño, etiqueta: `Páginas de libros terminados en ${año}` },
      { valor: paginasLeidas, etiqueta: "Páginas leídas en total" },
      { valor: promedio === "—" ? "—" : promedio + " ★", etiqueta: "Calificación promedio" }
    ])}

    <section class="estad-seccion">
      <div class="estad-cabecera">
        <h3 class="titulo-seccion">Libros agregados</h3>
        ${segmentos("libros", [["mensual", "Mensual"], ["anual", "Anual"]], ui.periodoLibros)}
      </div>
      ${tarjetas([
        { valor: totLibros.mes, etiqueta: "Este mes" },
        { valor: totLibros.año, etiqueta: `Este año (${añoActual})` }
      ])}
      <p class="estad-nota">${ui.periodoLibros === "anual" ? "Libros por año" : `Libros por mes · ${año}`} · según la fecha en que se agregó cada libro</p>
      ${grafica(serieLibros)}
    </section>

    <section class="estad-seccion">
      <div class="estad-cabecera">
        <h3 class="titulo-seccion">Páginas (capítulos)</h3>
        ${segmentos("paginas", [["semanal", "Semanal"], ["mensual", "Mensual"]], ui.periodoPaginas)}
      </div>
      ${tarjetas([
        { valor: totPaginas.semana, etiqueta: "Esta semana" },
        { valor: totPaginas.mes, etiqueta: "Este mes" }
      ])}
      <p class="estad-nota">${ui.periodoPaginas === "mensual" ? `Páginas por mes · ${año}` : `Páginas por semana · últimas ${SEMANAS_EN_GRAFICA}`} · suma de los rangos de páginas de los capítulos, según cuándo se registró cada capítulo</p>
      ${grafica(seriePaginas)}
      ${ui.fallidos ? `<p class="estad-nota">No se pudieron leer los capítulos de ${ui.fallidos} libro${ui.fallidos === 1 ? "" : "s"}; esos datos no se incluyen.</p>` : ""}
    </section>

    <section class="estad-seccion">
      <div class="estad-cabecera">
        <h3 class="titulo-seccion">Páginas · seguimiento</h3>
        ${segmentos("seguimiento", [["semanal", "Semanal"]], "semanal")}
      </div>
      ${tarjetas([
        { valor: totSeguimiento.semana, etiqueta: "Esta semana" },
        { valor: totSeguimiento.semanaPasada, etiqueta: "Semana pasada" }
      ])}
      <p class="estad-nota">Páginas por semana · últimas ${SEMANAS_EN_GRAFICA} · página actual de los libros cuyo seguimiento se actualizó esa semana</p>
      ${grafica(serieSeguimiento)}
    </section>

    <h3 class="titulo-seccion">Terminados por mes · ${año}</h3>
    ${grafica(serieTerminados)}

    <h3 class="titulo-seccion">Por estado</h3>
    <div class="estados-resumen">
      ${ESTADOS.map(([k, etq]) => `
        <div class="estado-fila">
          <span>${etq}</span>
          <div class="estado-barra"><div class="estado-barra-relleno estado-${k}" style="width:${(conteo[k] / libros.length) * 100}%"></div></div>
          <span class="num">${conteo[k]}</span>
        </div>`).join("")}
    </div>

    ${leyendo.length ? `
      <h3 class="titulo-seccion">Leyendo ahora</h3>
      ${leyendo.map(l => {
        const faltan = Math.max(l.totalPaginas - (l.paginaActual || 0), 0);
        const pct = Math.min(Math.round(((l.paginaActual || 0) / l.totalPaginas) * 100), 100);
        return `
          <div class="leyendo-item">
            <div class="leyendo-cabecera">
              <strong>${escapeHtml(l.titulo)}</strong>
              <span class="num">${pct}% · faltan ${faltan}</span>
            </div>
            <div class="barra-progreso"><div class="barra-progreso-relleno" style="width:${pct}%"></div></div>
          </div>`;
      }).join("")}` : ""}
  `;
}
