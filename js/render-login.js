import { signIn, requestPasswordReset } from "./auth.js";
import { toast, friendlyError, showLoading, diagnoseSupabaseError, formatDiagnostics, escapeHtml } from "./ui.js";

export function renderLogin(root, { onSignedIn }) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        <div class="login-brand">
          <div class="logo-mark">GB</div>
          <h1>GOOD BARBER</h1>
          <div class="tagline">Administración de barbería</div>
        </div>

        <div class="card">
          <form id="login-form" novalidate>
            <div class="field">
              <label for="login-email">Correo electrónico</label>
              <input id="login-email" type="email" autocomplete="username" required>
            </div>
            <div class="field">
              <label for="login-password">Contraseña</label>
              <input id="login-password" type="password" autocomplete="current-password" required>
            </div>
            <div id="login-error" class="text-danger mt-8 hidden"></div>
            <button type="submit" class="btn btn-primary btn-block mt-16" id="login-submit">Iniciar sesión</button>
          </form>
        </div>

        <div class="login-links">
          <button type="button" id="forgot-btn">¿Olvidaste tu contraseña?</button>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector("#login-form");
  const errorBox = root.querySelector("#login-error");
  const submitBtn = root.querySelector("#login-submit");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorBox.classList.add("hidden");
    const email = root.querySelector("#login-email").value.trim();
    const password = root.querySelector("#login-password").value;

    if (!email || !password) {
      errorBox.textContent = "Ingresa tu correo y contraseña.";
      errorBox.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Entrando…";
    try {
      await signIn(email, password);
      onSignedIn();
    } catch (error) {
      // Diagnóstico temporal: además del mensaje amigable, mostramos un
      // detalle técnico plegable (nunca contraseñas ni claves) para
      // identificar exactamente qué está fallando en la conexión con
      // Supabase. Quitar este bloque <details> una vez resuelto.
      const details = diagnoseSupabaseError("signInWithPassword", error);
      console.error("[Good Barber diagnóstico Supabase]", details);
      errorBox.innerHTML = `
        ${escapeHtml(friendlyError(error))}
        <details class="mt-8" style="font-size:12px;opacity:0.85">
          <summary style="cursor:pointer">Detalle técnico (temporal, para diagnóstico)</summary>
          <pre style="white-space:pre-wrap;margin-top:6px">${escapeHtml(formatDiagnostics(details))}</pre>
        </details>
      `;
      errorBox.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Iniciar sesión";
    }
  });

  root.querySelector("#forgot-btn").addEventListener("click", async () => {
    const email = root.querySelector("#login-email").value.trim();
    if (!email) {
      toast("Escribe tu correo primero para poder enviarte el enlace.", "error");
      return;
    }
    showLoading(true, "Enviando enlace…");
    try {
      await requestPasswordReset(email);
      toast("Te enviamos un enlace para restablecer tu contraseña.", "success");
    } catch (error) {
      toast(friendlyError(error), "error");
    } finally {
      showLoading(false);
    }
  });
}

export function renderAccountDisabled(root, { onBack }) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        <div class="login-brand">
          <div class="logo-mark">GB</div>
          <h1>GOOD BARBER</h1>
        </div>
        <div class="card text-center">
          <h3>Cuenta desactivada</h3>
          <p class="text-muted mt-8">Tu cuenta fue desactivada por el administrador. Contáctalo para más información.</p>
          <button class="btn btn-ghost btn-block mt-16" id="back-btn">Volver al inicio de sesión</button>
        </div>
      </div>
    </div>
  `;
  root.querySelector("#back-btn").addEventListener("click", onBack);
}
