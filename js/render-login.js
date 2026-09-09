import { signIn, requestPasswordReset, checkAdminExists, bootstrapFirstAdmin, updatePassword } from "./auth.js";
import { toast, friendlyError, showLoading, escapeHtml } from "./ui.js";

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
        errorBox.textContent = friendlyError(error);
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

// Pantalla que se muestra automáticamente cuando Supabase dispara el evento
// PASSWORD_RECOVERY (el usuario llegó desde el enlace del correo de
// "¿Olvidaste tu contraseña?"). No reemplaza el login normal: solo aparece
// en ese caso concreto, y al terminar entrega el control de vuelta a
// onDone() para que la app lo enrute a su panel según su rol.
export function renderPasswordRecovery(root, { onDone }) {
  root.innerHTML = `
    <div class="login-screen">
      <div class="login-box">
        <div class="login-brand">
          <div class="logo-mark">GB</div>
          <h1>GOOD BARBER</h1>
          <div class="tagline">Crear nueva contraseña</div>
        </div>

        <div class="card">
          <p class="text-muted">Escribe tu nueva contraseña para continuar.</p>
          <form id="recovery-form" novalidate>
            <div class="field mt-16">
              <label for="rec-password">Nueva contraseña</label>
              <input id="rec-password" type="password" minlength="8" autocomplete="new-password" required>
            </div>
            <div class="field">
              <label for="rec-password-confirm">Confirmar contraseña</label>
              <input id="rec-password-confirm" type="password" minlength="8" autocomplete="new-password" required>
            </div>
            <div id="rec-error" class="text-danger mt-8 hidden"></div>
            <div id="rec-success" class="text-success mt-8 hidden"></div>
            <button type="submit" class="btn btn-primary btn-block mt-16" id="rec-submit">Guardar nueva contraseña</button>
          </form>
        </div>
      </div>
    </div>
  `;

  const form = root.querySelector("#recovery-form");
  const errorBox = root.querySelector("#rec-error");
  const successBox = root.querySelector("#rec-success");
  const submitBtn = root.querySelector("#rec-submit");
  let done = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (done) return;
    errorBox.classList.add("hidden");
    successBox.classList.add("hidden");

    const password = root.querySelector("#rec-password").value;
    const passwordConfirm = root.querySelector("#rec-password-confirm").value;

    if (!password || password.length < 8) {
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
    submitBtn.textContent = "Guardando…";
    try {
      await updatePassword(password);
      done = true;
      successBox.textContent = "Contraseña actualizada. Entrando a tu panel…";
      successBox.classList.remove("hidden");
      submitBtn.textContent = "✓ Guardado";
      setTimeout(() => onDone(), 900);
    } catch (error) {
      errorBox.textContent = friendlyError(error);
      errorBox.classList.remove("hidden");
      submitBtn.disabled = false;
      submitBtn.textContent = "Guardar nueva contraseña";
    }
  });
}
