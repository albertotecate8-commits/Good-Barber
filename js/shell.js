// Cascarón de aplicación compartido: topbar, sidebar (escritorio) y nav inferior (móvil).
// En móvil solo caben ~4 accesos directos; el resto vive detrás de "Más" para que
// ninguna sección del admin quede inalcanzable desde el celular.

const MAX_BOTTOM_ITEMS = 4;

export function mountShell(root, { title, subtitle, navItems, activeId, onNavigate, onLogout }) {
  const visibleItems = navItems.slice(0, MAX_BOTTOM_ITEMS);
  const overflowItems = navItems.slice(MAX_BOTTOM_ITEMS);
  const overflowActive = overflowItems.some((item) => item.id === activeId);

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="logo-mark">GB</div>
          GOOD BARBER
        </div>
        <nav class="sidebar-nav">
          ${navItems
            .map(
              (item) => `
            <button type="button" class="nav-item ${item.id === activeId ? "active" : ""}" data-nav="${item.id}">
              <span class="nav-icon">${item.icon}</span>
              <span>${item.label}</span>
            </button>
          `
            )
            .join("")}
        </nav>
        <div class="sidebar-footer">
          <button type="button" class="btn btn-ghost btn-block" id="logout-btn-desktop">Cerrar sesión</button>
        </div>
      </aside>

      <div class="main-column">
        <header class="topbar">
          <div>
            <div class="topbar-title">${title}</div>
            <div class="topbar-sub">${subtitle}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-icon" id="logout-btn-mobile" aria-label="Cerrar sesión" title="Cerrar sesión">⏻</button>
        </header>
        <main id="view-content" class="container"></main>
      </div>
    </div>

    <nav class="bottom-nav">
      ${visibleItems
        .map(
          (item) => `
        <button type="button" class="nav-item ${item.id === activeId ? "active" : ""}" data-nav="${item.id}">
          <span class="nav-icon">${item.icon}</span>
          <span>${item.label}</span>
        </button>
      `
        )
        .join("")}
      ${
        overflowItems.length
          ? `<button type="button" class="nav-item ${overflowActive ? "active" : ""}" id="nav-more-btn">
              <span class="nav-icon">⋯</span>
              <span>Más</span>
            </button>`
          : ""
      }
    </nav>

    <div id="more-sheet" class="modal-overlay hidden">
      <div class="modal-box" role="dialog" aria-modal="true">
        <button type="button" class="btn btn-ghost btn-icon modal-close" id="more-close" aria-label="Cerrar">✕</button>
        <h3>Más opciones</h3>
        <div class="mt-16">
          ${overflowItems
            .map(
              (item) => `
            <button type="button" class="card-row w-full" style="background:none;border:0;color:inherit;text-align:left;cursor:pointer" data-nav="${item.id}">
              <span class="list-item-title">${item.icon} ${item.label}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  root.querySelectorAll("[data-nav]").forEach((btn) => {
    btn.addEventListener("click", () => onNavigate(btn.dataset.nav));
  });
  root.querySelector("#logout-btn-desktop").addEventListener("click", onLogout);
  root.querySelector("#logout-btn-mobile").addEventListener("click", onLogout);

  const moreBtn = root.querySelector("#nav-more-btn");
  const moreSheet = root.querySelector("#more-sheet");
  if (moreBtn) {
    moreBtn.addEventListener("click", () => moreSheet.classList.remove("hidden"));
    root.querySelector("#more-close").addEventListener("click", () => moreSheet.classList.add("hidden"));
    moreSheet.addEventListener("click", (e) => {
      if (e.target === moreSheet) moreSheet.classList.add("hidden");
    });
  }

  return root.querySelector("#view-content");
}
