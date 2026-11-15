/* =========================================================
   GRIEGOS — NAVEGACIÓN Y DETALLES COMUNES
   Archivo: scripts/nav.js
   Menú móvil de las páginas sin carrito y año del pie.
   ========================================================= */

(() => {
  "use strict";

  const toggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".main-navigation");

  if (toggle && navigation) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
      navigation.classList.toggle("is-open", open);
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    navigation.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 820) setOpen(false);
    });
  }

  document.querySelectorAll(".js-year").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
})();
