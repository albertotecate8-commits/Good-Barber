import { signIn, requestPasswordReset, checkAdminExists, bootstrapFirstAdmin } from "./auth.js";
import { toast, friendlyError, showLoading, diagnoseSupabaseError, formatDiagnostics, escapeHtml } from "./ui.js";

export function renderLogin(root, { onSignedIn }) {
  showLoginView();

  function showLoginView() {
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
            <button type="button" id="create-account-btn">Crear cuenta</button>
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

    root.querySelector("#create-account-btn").addEventListener("click", showCreateAccountView);
  }

  async function showCreateAccountView() {
    root.innerHTML = `
      <div class="login-screen">
        <div class="login-box">
          <div class="login-brand">
            <div class="logo-mark">GB</div>
            <h1>GOOD BARBER</h1>
          </div>
          <div class="card" id="create-account-card">
            <p class="text-muted">Comprobando el estado del sistema…</p>
          </div>
          <div class="login-links">
            <button type="button" id="back-to-login-btn">Volver a iniciar sesión</button>
          </div>
        </div>
      </div>
    `;
    root.querySelector("#back-to-login-btn").addEventListener("click", showLoginView);

    const card = root.querySelector("#create-account-card");
    try {
      const adminExists = await checkAdminExists();
      if (adminExists) {
        card.innerHTML = `
          <h3>Cuentas nuevas</h3>
          <p class="text-muted mt-8">Las cuentas nuevas son creadas por el administrador de Good Barber. Si ya tienes una cuenta y olvidaste tu contraseña, usa "¿Olvidaste tu contraseña?" desde la pantalla de inicio de sesión.</p>
        `;
      } else {
        renderBootstrapForm(card);
      }
    } catch (error) {
      card.innerHTML = `<p class="text-danger">${escapeHtml(friendlyError(error))}</p>`;
    }
  }

  function renderBootstrapForm(card) {
    card.innerHTML = `
      <h3>Configuración inicial</h3>
      <p class="text-muted mt-8">Todavía no existe ningún administrador. Crea la primera cuenta de administrador para empezar a usar Good Barber.</p>
      <div class="field mt-16">
        <label for="ba-email">Correo electrónico</label>
        <input id="ba-email" type="email" autocomplete="username" required>
      </div>
      <div class="field">
        <label for="ba-password">Contraseña</label>
        <input id="ba-password" type="password" minlength="8" autocomplete="new-password" required>
      </div>
      <div class="field">
        <label for="ba-password-confirm">Confirmar contraseña</label>
        <input id="ba-password-confirm" type="password" minlength="8" autocomplete="new-password" required>
      </div>
      <div id="ba-error" class="text-danger mt-8 hidden"></div>
      <button type="button" class="btn btn-primary btn-block mt-16" id="ba-submit">Crear administrador</button>
    `;

    const errorBox = card.querySelector("#ba-error");
    const submitBtn = card.querySelector("#ba-submit");

    submitBtn.addEventListener("click", async () => {
      errorBox.classList.add("hidden");
      const email = card.querySelector("#ba-email").value.trim();
      const password = card.querySelector("#ba-password").value;
      const passwordConfirm = card.querySelector("#ba-password-confirm").value;

      if (!email || !password) {
        errorBox.textContent = "Completa el correo y la contraseña.";
        errorBox.classList.remove("hidden");
        return;
      }
      if (password.length < 8) {
        errorBox.textContent = "La contraseña debe tener al menos 8 caracteres.";
        errorBox.classList.remove("hidden");
        return;
      }
      if (password !== passwordConfirm) {
        errorBox.textContent = "Las contraseñas no coinciden.";
        errorBox.classList.remove("hidden");
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Creando…";
      try {
        await bootstrapFirstAdmin({ email, password });
        toast("Administrador creado correctamente.", "success");
        await signIn(email, password);
        onSignedIn();
      } catch (error) {
        errorBox.textContent = friendlyError(error);
        errorBox.classList.remove("hidden");
        submitBtn.disabled = false;
        submitBtn.textContent = "Crear administrador";
      }
    });
  }
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
