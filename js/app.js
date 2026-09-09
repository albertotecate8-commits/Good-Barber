import { mountUiRoots, toast, showLoading, friendlyError } from "./ui.js";
import { getSession, onAuthStateChange, loadCurrentProfile, loadCurrentBarber, signOut } from "./auth.js";
import { renderLogin, renderAccountDisabled, renderPasswordRecovery } from "./render-login.js";
import { mountShell } from "./shell.js";
import { barberNavItems, renderBarberHome, renderBarberServices, renderBarberClients, renderBarberHistory, renderBarberProfile } from "./render-barber.js";
import {
  adminNavItems,
  renderAdminDashboard,
  renderAdminBarbers,
  renderAdminClients,
  renderAdminServices,
  renderAdminSales,
  renderAdminWeeks,
  renderAdminHistory,
  renderAdminSettings,
} from "./render-admin.js";

const root = document.getElementById("app");
let currentView = null;
// true mientras se muestra la pantalla de "crear nueva contraseña" (llegó por
// el enlace de recuperación). Evita que el enrutado normal (que puede estar
// en vuelo al mismo tiempo, según cuándo dispare Supabase el evento) pise
// esa pantalla con el panel normal del usuario.
let recoveryMode = false;

mountUiRoots();

function checkSupabaseConfigured() {
  if (!window.supabaseClient) {
    root.innerHTML = `
      <div class="login-screen">
        <div class="card" style="max-width:480px">
          <h3>Supabase no está configurado</h3>
          <p class="text-muted mt-8">Revisa <code>supabase-config.js</code> y asegúrate de incluir el script de la librería de Supabase antes de <code>js/app.js</code>.</p>
        </div>
      </div>
    `;
    return false;
  }
  return true;
}

async function boot() {
  if (!checkSupabaseConfigured()) return;
  // window.__IS_PASSWORD_RECOVERY__ se calculó de forma síncrona en
  // supabase-config.js, antes de que existiera la carrera con el evento
  // PASSWORD_RECOVERY (ver el comentario ahí). Es la vía confiable; el
  // listener de más abajo queda solo como respaldo.
  if (window.__IS_PASSWORD_RECOVERY__) {
    showPasswordRecovery();
    return;
  }
  showLoading(true, "Cargando…");
  try {
    const session = await getSession();
    if (!session) {
      showLoading(false);
      showLogin();
      return;
    }
    await routeAuthenticatedUser(session);
  } catch (error) {
    showLoading(false);
    toast(friendlyError(error), "error");
    showLogin();
  }
}

async function routeAuthenticatedUser(session) {
  showLoading(true, "Cargando tu cuenta…");
  try {
    const profile = await loadCurrentProfile(session.user.id);
    // El evento PASSWORD_RECOVERY puede llegar mientras esta función todavía
    // está esperando estas consultas. Si ya activó la pantalla de nueva
    // contraseña, no la pisamos montando el panel normal encima.
    if (recoveryMode) return showLoading(false);

    if (!profile.active) {
      showLoading(false);
      await signOut();
      renderAccountDisabled(root, { onBack: showLogin });
      return;
    }

    if (profile.role === "admin") {
      showLoading(false);
      if (recoveryMode) return;
      mountAdminShell(profile);
      return;
    }

    const barber = await loadCurrentBarber(session.user.id);
    if (recoveryMode) return showLoading(false);
    if (!barber) {
      showLoading(false);
      toast("Tu cuenta no tiene un perfil de barbero asociado. Contacta al administrador.", "error");
      await signOut();
      showLogin();
      return;
    }
    if (!barber.active) {
      showLoading(false);
      await signOut();
      renderAccountDisabled(root, { onBack: showLogin });
      return;
    }

    showLoading(false);
    if (recoveryMode) return;
    mountBarberShell({ profile, barber });
  } catch (error) {
    showLoading(false);
    if (recoveryMode) return;
    toast(friendlyError(error), "error");
    showLogin();
  }
}

// Se llama cuando Supabase dispara PASSWORD_RECOVERY (el usuario abrió el
// enlace de "¿Olvidaste tu contraseña?"). Tiene prioridad sobre cualquier
// otra cosa que esté mostrándose o a punto de montarse.
function showPasswordRecovery() {
  recoveryMode = true;
  currentView = "password-recovery";
  showLoading(false);
  renderPasswordRecovery(root, {
    onDone: async () => {
      recoveryMode = false;
      const session = await getSession();
      if (session) await routeAuthenticatedUser(session);
      else showLogin();
    },
  });
}

function showLogin() {
  currentView = null;
  recoveryMode = false;
  renderLogin(root, {
    onSignedIn: async () => {
      const session = await getSession();
      if (session) await routeAuthenticatedUser(session);
    },
  });
}

async function handleLogout() {
  showLoading(true, "Cerrando sesión…");
  try {
    await signOut();
  } finally {
    showLoading(false);
    showLogin();
  }
}

function mountBarberShell(ctx) {
  const barberViews = {
    home: renderBarberHome,
    services: renderBarberServices,
    clients: renderBarberClients,
    history: renderBarberHistory,
    profile: renderBarberProfile,
  };

  function navigate(viewId) {
    currentView = viewId;
    const content = mountShell(root, {
      title: "Panel de barbero",
      subtitle: ctx.barber.name,
      navItems: barberNavItems(),
      activeId: viewId,
      onNavigate: navigate,
      onLogout: handleLogout,
    });
    barberViews[viewId](content, ctx);
  }

  navigate("home");
}

function mountAdminShell(profile) {
  const adminViews = {
    dashboard: renderAdminDashboard,
    barbers: renderAdminBarbers,
    clients: renderAdminClients,
    services: renderAdminServices,
    sales: renderAdminSales,
    weeks: renderAdminWeeks,
    history: renderAdminHistory,
    settings: renderAdminSettings,
  };

  function navigate(viewId) {
    currentView = viewId;
    const content = mountShell(root, {
      title: "Panel de administrador",
      subtitle: profile.name,
      navItems: adminNavItems(),
      activeId: viewId,
      onNavigate: navigate,
      onLogout: handleLogout,
    });
    adminViews[viewId](content);
  }

  navigate("dashboard");
}

if (window.supabaseClient) {
  onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showPasswordRecovery();
      return;
    }
    if (event === "SIGNED_OUT" && currentView !== null) {
      showLogin();
    }
  });
}

boot();
