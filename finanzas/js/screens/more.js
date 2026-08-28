// MÁS: respaldo, categorías, almacenamiento y ajustes.

import * as Store from "../store.js";
import * as db from "../db.js";
import { KIND } from "../model.js";
import { money, esc } from "../format.js";
import { todayISO, formatLong } from "../dates.js";
import { icon, empty, sheet, toast, confirmSheet } from "../ui.js";
import { backHeader } from "../components.js";

function tile(action, glyph, title, description, extra) {
  return `
    <button class="row" data-action="${esc(action)}">
      <span class="row-ico c-otros">${icon(glyph, 18)}</span>
      <span class="row-body">
        <span class="row-title">${esc(title)}</span>
        <span class="row-sub">${esc(description)}</span>
      </span>
      <span class="row-end">${extra || `<span class="muted">${icon("chevron", 15, 2.2)}</span>`}</span>
    </button>`;
}

/** Descarga el respaldo como archivo .json. */
function downloadBackup() {
  const data = Store.exportData();
  const text = JSON.stringify(data, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finanzas-${todayISO()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast("Respaldo descargado", "ok");
}

/** Copia el respaldo al portapapeles (útil si el navegador bloquea descargas). */
async function copyBackup() {
  const text = JSON.stringify(Store.exportData());
  try {
    await navigator.clipboard.writeText(text);
    toast("Respaldo copiado", "ok");
  } catch (err) {
    sheet({
      title: "Copia manual",
      subtitle: "Selecciona el texto y cópialo",
      body: `<textarea class="textarea" style="min-height:220px;font-size:12px" readonly>${esc(text)}</textarea>`,
    });
  }
}

function importFlow(onDone) {
  sheet({
    title: "Importar respaldo",
    subtitle: "Reemplaza todos los datos actuales",
    body: `
      <p class="tiny muted" style="margin-bottom:14px">
        Elige un archivo .json exportado por esta app, o pega su contenido. Los datos actuales se
        reemplazarán por completo, así que conviene exportar antes por si acaso.
      </p>
      <div class="field">
        <label for="f-file">Archivo de respaldo</label>
        <input id="f-file" class="input" type="file" accept="application/json,.json" data-file>
      </div>
      <div class="field">
        <label for="f-paste">…o pega el contenido</label>
        <textarea id="f-paste" class="textarea" data-paste placeholder='{"app":"mis-finanzas"…}'></textarea>
      </div>
      <div class="field-error" data-error hidden></div>
      <div class="sheet-actions">
        <button class="btn btn-ink" data-submit>Importar y reemplazar</button>
      </div>`,
    onMount: (panel, close) => {
      const fileInput = panel.querySelector("[data-file]");
      const paste = panel.querySelector("[data-paste]");
      const errorBox = panel.querySelector("[data-error]");
      const submit = panel.querySelector("[data-submit]");

      const fail = (message) => {
        errorBox.textContent = message;
        errorBox.hidden = false;
      };

      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { paste.value = String(reader.result || ""); };
        reader.onerror = () => fail("No se pudo leer el archivo.");
        reader.readAsText(file);
      });

      submit.addEventListener("click", async () => {
        errorBox.hidden = true;
        const raw = paste.value.trim();
        if (!raw) { fail("Elige un archivo o pega el contenido del respaldo."); return; }

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          fail("El archivo no es un JSON válido.");
          return;
        }

        const ok = await confirmSheet({
          title: "¿Reemplazar todos los datos?",
          message: "Lo que tengas ahora se borrará y quedará lo del respaldo. Esta acción no se puede deshacer.",
          confirmText: "Sí, importar",
          danger: true,
        });
        if (!ok) return;

        try {
          const counts = await Store.importData(parsed);
          close();
          toast(`Importado: ${counts.items} conceptos, ${counts.movements} movimientos`, "ok");
          if (onDone) onDone();
        } catch (err) {
          fail(err.message || "No se pudo importar el respaldo.");
        }
      });
    },
  });
}

async function storageFlow() {
  const estimate = await db.storageEstimate();
  const persisted = await db.requestPersistence();
  const data = Store.exportData();
  const size = new Blob([JSON.stringify(data)]).size;

  const fmt = (bytes) => {
    if (bytes == null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  sheet({
    title: "Almacenamiento",
    subtitle: "Todo vive en este dispositivo",
    body: `
      <div class="card">
        <div class="kv"><span class="k">Conceptos</span><span class="v num">${data.counts.items}</span></div>
        <div class="kv"><span class="k">Vencimientos</span><span class="v num">${data.counts.occurrences}</span></div>
        <div class="kv"><span class="k">Movimientos</span><span class="v num">${data.counts.movements}</span></div>
        <div class="kv"><span class="k">Categorías</span><span class="v num">${data.counts.categories}</span></div>
        <div class="kv"><span class="k">Tamaño de los datos</span><span class="v num">${fmt(size)}</span></div>
        <div class="kv"><span class="k">Usado por la app</span><span class="v num">${fmt(estimate && estimate.usage)}</span></div>
        <div class="kv"><span class="k">Disponible</span><span class="v num">${fmt(estimate && estimate.quota)}</span></div>
        <div class="kv"><span class="k">Guardado permanente</span><span class="v">${persisted ? "Sí" : "No garantizado"}</span></div>
        <div class="kv"><span class="k">Base de datos</span><span class="v">${Store.isPersistent() ? "IndexedDB activa" : "Solo memoria"}</span></div>
      </div>
      <p class="tiny muted mt-14">
        Los datos se guardan únicamente en este navegador. Si borras los datos del sitio o
        desinstalas la app, se pierden: exporta un respaldo de vez en cuando.
      </p>`,
  });
}

export default {
  render() {
    const persistent = Store.isPersistent();
    const seededAt = Store.getMeta("seeded");

    return `
      <header class="head">
        <div class="head-titles">
          <div class="head-title"><b>Más</b></div>
          <div class="head-sub">Respaldo y ajustes</div>
        </div>
        <button class="icon-btn is-outline" data-action="nav" data-to="#/buscar" aria-label="Buscar">${icon("search", 18)}</button>
      </header>

      ${!persistent ? `
        <div class="card" style="border:1.5px solid var(--danger);background:var(--danger-soft)">
          <div class="flex" style="align-items:flex-start;gap:10px">
            <span class="neg">${icon("alert", 20)}</span>
            <div>
              <div class="row-title neg">No se puede guardar en este navegador</div>
              <div class="tiny muted mt-8">Los cambios se perderán al cerrar. Prueba a salir del modo privado o usa otro navegador.</div>
            </div>
          </div>
        </div>` : ""}

      <div class="section-head" style="margin-top:8px">
        <h2 class="section-title">Consultar</h2>
      </div>
      <div class="list">
        ${tile("nav-calendario", "calendar", "Calendario", "Movimientos día por día")}
        ${tile("nav-historial", "history", "Historial", "Todo lo registrado")}
        ${tile("nav-mensual", "chart", "Resumen del mes", "Ingresos y gastos por concepto")}
        ${tile("nav-corte", "income", "Corte semanal", "Sábado a viernes")}
        ${tile("nav-categorias", "tag", "Categorías", "Cuánto tienes comprometido por categoría")}
        ${tile("nav-buscar", "search", "Buscar y filtrar", "Encuentra cualquier registro")}
      </div>

      <div class="section-head">
        <h2 class="section-title">Crear</h2>
      </div>
      <div class="list">
        ${tile("new-expense-item", "expense", "Nuevo gasto fijo", "Con periodicidad y vencimiento")}
        ${tile("new-debt", "debt", "Nueva deuda", "Pago periódico de una deuda")}
        ${tile("new-heavy", "alert", "Nueva deuda fuerte", "Saldo grande sin pago mensual")}
        ${tile("new-income-source", "income", "Nueva fuente de ingreso", "Semanal, mensual o única")}
      </div>

      <div class="section-head">
        <h2 class="section-title">Respaldo</h2>
      </div>
      <p class="tiny muted" style="margin:-4px 2px 10px">
        Como no hay servidor, tus datos viven solo en este dispositivo. Exporta de vez en cuando.
      </p>
      <div class="list">
        ${tile("export", "download", "Exportar datos", "Descarga un archivo .json")}
        ${tile("copy", "send", "Copiar respaldo", "Al portapapeles, para pegarlo donde quieras")}
        ${tile("import", "upload", "Importar datos", "Restaura desde un respaldo")}
        ${tile("storage", "db", "Información de almacenamiento", "Espacio usado y estado")}
      </div>

      <div class="section-head">
        <h2 class="section-title">Zona delicada</h2>
      </div>
      <div class="list">
        ${tile("reseed", "refresh", "Restaurar datos iniciales", "Vuelve a cargar los conceptos originales")}
        ${tile("reset", "trash", "Restablecer aplicación", "Borra absolutamente todo")}
      </div>

      <p class="tiny muted center mt-20" style="padding-bottom:8px">
        Mis Finanzas · sin cuentas, sin servidor, sin internet.<br>
        ${seededAt ? `Datos iniciales cargados el ${esc(formatLong(String(seededAt).slice(0, 10)))}.` : ""}
      </p>`;
  },

  mount(root, ctx) {
    const go = (hash) => { location.hash = hash; };

    const handlers = {
      "nav-calendario": () => go("#/calendario"),
      "nav-historial": () => go("#/historial"),
      "nav-mensual": () => go("#/mensual"),
      "nav-corte": () => go("#/corte"),
      "nav-categorias": () => go("#/categorias"),
      "nav-buscar": () => go("#/buscar"),
      export: downloadBackup,
      copy: copyBackup,
      import: () => importFlow(() => ctx.rerender()),
      storage: storageFlow,
      reseed: async () => {
        const ok = await confirmSheet({
          title: "¿Restaurar los datos iniciales?",
          message: "Se borrarán todos tus movimientos, pagos e historial, y volverán los conceptos originales (gastos fijos, deudas, suscripciones e ingresos). No se puede deshacer.",
          confirmText: "Sí, restaurar",
          danger: true,
        });
        if (!ok) return;
        await Store.resetAll(true);
        toast("Datos iniciales restaurados", "ok");
        go("#/inicio");
      },
      reset: async () => {
        const ok = await confirmSheet({
          title: "¿Borrar todo?",
          message: "Se eliminarán todos los conceptos, pagos, ingresos e historial. La app quedará completamente vacía. Exporta un respaldo antes si no estás seguro.",
          confirmText: "Sí, borrar todo",
          danger: true,
        });
        if (!ok) return;
        const sure = await confirmSheet({
          title: "Confirmación final",
          message: "Esta acción no se puede deshacer. ¿Seguro que quieres borrar absolutamente todo?",
          confirmText: "Borrar definitivamente",
          danger: true,
        });
        if (!sure) return;
        await Store.resetAll(false);
        toast("Aplicación restablecida", "ok");
        go("#/inicio");
      },
    };

    root.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const handler = handlers[target.dataset.action];
      if (!handler) return;
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
  },
};
