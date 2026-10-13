// Cuadro de confirmación reutilizable para operaciones destructivas o importantes.
// Usa los estilos .modal del proyecto. Todo el texto entra con textContent
// (los títulos de libros u otros datos del usuario nunca se interpretan como HTML).
//
// const ok = await confirmarAccion({
//   titulo, mensaje, aviso, textoConfirmar, peligro,
//   onConfirmar: async (progreso) => { ... }   // opcional: el cuadro queda abierto
// });                                           // mostrando el avance y los errores
// → true si se confirmó (y onConfirmar terminó bien), false si se canceló.

export function negrita(texto) {
  const el = document.createElement("strong");
  el.textContent = texto;
  return el;
}

function agregar(padre, contenido) {
  (Array.isArray(contenido) ? contenido : [contenido]).forEach((c) => {
    if (c === null || c === undefined || c === "") return;
    padre.append(typeof c === "string" ? document.createTextNode(c) : c);
  });
}

export function confirmarAccion({
  titulo,
  mensaje,
  aviso,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  peligro = true,
  onConfirmar
}) {
  return new Promise((resolve) => {
    const previo = document.activeElement;
    const idTitulo = "modal-titulo-" + Date.now();

    const fondo = document.createElement("div");
    fondo.className = "modal";
    fondo.setAttribute("role", "dialog");
    fondo.setAttribute("aria-modal", "true");
    fondo.setAttribute("aria-labelledby", idTitulo);

    const caja = document.createElement("div");
    caja.className = "modal-caja";

    const h = document.createElement("h3");
    h.id = idTitulo;
    h.textContent = titulo;

    const p = document.createElement("p");
    p.className = "modal-resumen";
    agregar(p, mensaje);

    const pAviso = document.createElement("p");
    pAviso.className = "modal-aviso";
    pAviso.hidden = !aviso;
    agregar(pAviso, aviso);

    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("role", "alert");
    error.hidden = true;

    const acciones = document.createElement("div");
    acciones.className = "modal-acciones";
    const btnCancelar = document.createElement("button");
    btnCancelar.type = "button";
    btnCancelar.className = "boton-fantasma";
    btnCancelar.textContent = textoCancelar;
    const btnOk = document.createElement("button");
    btnOk.type = "button";
    btnOk.className = peligro ? "boton-peligro" : "boton-principal";
    btnOk.textContent = textoConfirmar;
    acciones.append(btnCancelar, btnOk);

    caja.append(h, p, pAviso, error, acciones);
    fondo.append(caja);
    document.body.append(fondo);
    btnCancelar.focus(); // el foco empieza en la opción segura

    let ocupado = false;

    function cerrar(resultado) {
      document.removeEventListener("keydown", teclas, true);
      fondo.remove();
      if (previo && typeof previo.focus === "function") previo.focus();
      resolve(resultado);
    }

    function teclas(e) {
      if (e.key === "Escape" && !ocupado) { e.stopPropagation(); cerrar(false); return; }
      if (e.key === "Tab") {
        const foco = [btnCancelar, btnOk].filter((b) => !b.disabled);
        if (!foco.length) { e.preventDefault(); return; }
        const i = foco.indexOf(document.activeElement);
        const siguiente = e.shiftKey ? foco[(i <= 0 ? foco.length : i) - 1] : foco[(i + 1) % foco.length];
        e.preventDefault();
        siguiente.focus();
      }
    }
    document.addEventListener("keydown", teclas, true);

    btnCancelar.addEventListener("click", () => { if (!ocupado) cerrar(false); });
    fondo.addEventListener("click", (e) => { if (e.target === fondo && !ocupado) cerrar(false); });

    btnOk.addEventListener("click", async () => {
      if (!onConfirmar) { cerrar(true); return; }
      ocupado = true;
      error.hidden = true;
      btnOk.disabled = true;
      btnCancelar.disabled = true;
      const textoOriginal = btnOk.textContent;
      btnOk.textContent = "Procesando…";
      try {
        await onConfirmar((hechas, total) => { btnOk.textContent = `Procesando… ${hechas}/${total}`; });
        ocupado = false;
        cerrar(true);
      } catch (err) {
        ocupado = false;
        error.textContent = "No se pudo completar: " + (err?.message || err) + " Puedes reintentar.";
        error.hidden = false;
        btnOk.disabled = false;
        btnCancelar.disabled = false;
        btnOk.textContent = "Reintentar";
        btnOk.dataset.original = textoOriginal;
        btnCancelar.focus();
      }
    });
  });
}
