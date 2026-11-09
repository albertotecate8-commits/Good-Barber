// Pantalla de acceso: entrar o crear cuenta. El primer correo que se
// registra queda como Administrador automáticamente; el resto, Colaborador.
// Ambos ven exactamente los mismos datos desde sus propios teléfonos.

import * as Store from "../store.js";
import { esc } from "../format.js";
import { icon, toast } from "../ui.js";

let mode = "signin"; // "signin" | "signup"
let busy = false;

function field(name, label, type, placeholder) {
  return `
    <div class="field">
      <label for="f-${name}">${esc(label)}</label>
      <input id="f-${name}" name="${name}" class="input" type="${type}" autocomplete="${type === "email" ? "email" : type === "password" ? "current-password" : "name"}"
             placeholder="${esc(placeholder || "")}">
      <div class="field-error" data-error="${name}" hidden></div>
    </div>`;
}

export default {
  render() {
    const isSignup = mode === "signup";
    return `
      <div class="login-page">
        <div class="login-card">
          <div class="boot-logo" style="margin:0 auto 14px">$</div>
          <h1 class="login-title">Mis Finanzas</h1>
          <p class="tiny muted center" style="margin-bottom:22px">
            ${isSignup ? "Crea tu cuenta para entrar" : "Entra con tu correo"}
          </p>

          <form id="login-form" novalidate>
            ${isSignup ? field("name", "Tu nombre", "text", "Alberto, …") : ""}
            ${field("email", "Correo", "email", "tu@correo.com")}
            ${field("password", "Contraseña", "password", isSignup ? "Mínimo 6 caracteres" : "")}
            <div class="field-error" data-error="form" hidden></div>
            <button class="btn btn-lime" style="width:100%;margin-top:4px" type="submit" data-submit>
              ${isSignup ? "Crear cuenta" : "Entrar"}
            </button>
          </form>

          <button class="btn btn-outline" style="width:100%;margin-top:10px" data-toggle>
            ${isSignup ? "Ya tengo cuenta — entrar" : "No tengo cuenta — crear una"}
          </button>

          <p class="tiny muted center" style="margin-top:18px">
            ${isSignup
              ? "Si es la primera cuenta que se crea, queda como Administrador. Las siguientes son Colaborador."
              : "Tú y tu pareja ven exactamente los mismos datos, cada quien desde su teléfono."}
          </p>
        </div>
      </div>`;
  },

  mount(root, context) {
    const toggle = root.querySelector("[data-toggle]");
    if (toggle) {
      toggle.addEventListener("click", () => {
        mode = mode === "signup" ? "signin" : "signup";
        if (context && context.rerender) context.rerender();
      });
    }

    const form = root.querySelector("#login-form");
    const submitBtn = root.querySelector("[data-submit]");
    const clearErrors = () => {
      root.querySelectorAll("[data-error]").forEach((el) => { el.hidden = true; el.textContent = ""; });
    };
    const showError = (name, message) => {
      const box = root.querySelector(`[data-error="${name}"]`) || root.querySelector('[data-error="form"]');
      box.textContent = message;
      box.hidden = false;
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      clearErrors();

      const email = form.email.value.trim();
      const password = form.password.value;
      const name = form.name ? form.name.value.trim() : "";

      if (!email) return showError("email", "Escribe tu correo.");
      if (!password) return showError("password", "Escribe tu contraseña.");
      if (mode === "signup" && password.length < 6) return showError("password", "Mínimo 6 caracteres.");
      if (mode === "signup" && !name) return showError("name", "Escribe tu nombre.");

      busy = true;
      submitBtn.disabled = true;
      submitBtn.textContent = mode === "signup" ? "Creando cuenta…" : "Entrando…";

      try {
        if (mode === "signup") {
          await Store.signUp({ email, password, name });
          toast("Cuenta creada", "ok");
        } else {
          await Store.signIn({ email, password });
        }
        // El cambio de sesión lo recoge el listener de app.js, que recarga la app.
      } catch (err) {
        showError("form", err.message || "No se pudo completar la operación.");
        busy = false;
        submitBtn.disabled = false;
        submitBtn.textContent = mode === "signup" ? "Crear cuenta" : "Entrar";
      }
    });
  },
};
