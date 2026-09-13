// Campo de imagen reutilizable: selector, previsualización, reemplazo y
// borrado. Lo usan el logo, la portada, la foto del barbero y la del
// servicio — una sola pieza, no cuatro copias.
//
// No sube nada al elegir el archivo: guarda la selección y previsualiza. La
// subida real ocurre al pulsar Guardar en el formulario que lo contiene, así
// que cancelar no deja basura en el bucket.

import { subirImagen, borrarImagen, validarImagen, TIPOS_ACEPTADOS } from "./media.js";
import { escapeHtml } from "./ui.js";

export function imageFieldHTML(id, etiqueta, urlActual, ayuda = "") {
  return `
    <div class="field img-field" data-img-field="${id}">
      <label for="${id}-file">${escapeHtml(etiqueta)}</label>
      <div class="img-field-row">
        <div class="img-preview" data-img-preview>
          ${urlActual ? `<img src="${escapeHtml(urlActual)}" alt="">` : `<span class="img-preview-empty">Sin imagen</span>`}
        </div>
        <div class="img-field-actions">
          <input type="file" id="${id}-file" accept="${TIPOS_ACEPTADOS.join(",")}" hidden data-img-input>
          <button type="button" class="btn btn-ghost btn-sm" data-img-pick>
            ${urlActual ? "Cambiar" : "Subir imagen"}
          </button>
          <button type="button" class="btn btn-ghost btn-sm img-field-remove" data-img-clear ${urlActual ? "" : "hidden"}>
            Quitar
          </button>
        </div>
      </div>
      ${ayuda ? `<p class="img-field-help">${escapeHtml(ayuda)}</p>` : ""}
      <p class="img-field-error text-danger" data-img-error hidden></p>
    </div>`;
}

// Devuelve un controlador con el que el formulario resuelve la imagen al
// guardar. `guardar()` sube el archivo si hay uno nuevo, borra el anterior si
// se reemplazó o se quitó, y devuelve la URL final (o null).
export function wireImageField(root, id, { carpeta, urlActual = null }) {
  const campo = root.querySelector(`[data-img-field="${id}"]`);
  if (!campo) return { guardar: async () => urlActual, hayCambio: () => false };

  const input = campo.querySelector("[data-img-input]");
  const preview = campo.querySelector("[data-img-preview]");
  const errorBox = campo.querySelector("[data-img-error]");
  const btnQuitar = campo.querySelector("[data-img-clear]");

  let archivo = null;     // archivo nuevo elegido, aún sin subir
  let quitada = false;    // el usuario pulsó Quitar
  let objectUrl = null;

  const mostrarError = (msg) => {
    errorBox.textContent = msg || "";
    errorBox.hidden = !msg;
  };

  const pintar = (src, vacio) => {
    preview.innerHTML = src
      ? `<img src="${src}" alt="">`
      : `<span class="img-preview-empty">${vacio}</span>`;
    btnQuitar.hidden = !src;
  };

  campo.querySelector("[data-img-pick]").addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (!f) return;
    const problema = validarImagen(f);
    if (problema) { mostrarError(problema); input.value = ""; return; }
    mostrarError("");
    archivo = f;
    quitada = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(f);
    pintar(objectUrl, "");
  });

  btnQuitar.addEventListener("click", () => {
    archivo = null;
    quitada = true;
    input.value = "";
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    mostrarError("");
    pintar(null, "Sin imagen");
  });

  return {
    hayCambio: () => Boolean(archivo) || quitada,
    async guardar() {
      if (archivo) {
        const nueva = await subirImagen(archivo, carpeta);
        if (urlActual && urlActual !== nueva) await borrarImagen(urlActual);
        return nueva;
      }
      if (quitada) {
        if (urlActual) await borrarImagen(urlActual);
        return null;
      }
      return urlActual;
    },
  };
}
