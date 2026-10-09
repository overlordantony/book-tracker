const CLAVE = "bitacora-tema";

function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  const btn = document.getElementById("btnTema");
  if (btn) {
    // El texto va en un <span> aparte para poder ocultarlo en móvil (solo queda el icono).
    const [icono, texto] = tema === "dark" ? ["☀️", "Claro"] : ["🌙", "Oscuro"];
    btn.innerHTML = `<span aria-hidden="true">${icono}</span><span class="boton-tema-txt"> ${texto}</span>`;
    btn.setAttribute("aria-label", tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
  }
}

// Por defecto oscuro, salvo que el usuario haya elegido claro antes.
const guardado = localStorage.getItem(CLAVE);
aplicarTema(guardado === "light" ? "light" : "dark");

export function iniciarToggleTema() {
  const btn = document.getElementById("btnTema");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const actual = document.documentElement.getAttribute("data-theme");
    const nuevo = actual === "dark" ? "light" : "dark";
    localStorage.setItem(CLAVE, nuevo);
    aplicarTema(nuevo);
  });
}
