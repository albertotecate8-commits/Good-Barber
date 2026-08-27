import { mountUiRoots, toast, showLoading, friendlyError } from "./ui.js";
import { getSession, onAuthStateChange, loadCurrentProfile, loadCurrentBarber, signOut } from "./auth.js";
import { renderLogin, renderAccountDisabled } from "./render-login.js";
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

    if (!profile.active) {
      showLoading(false);
      await signOut();
      renderAccountDisabled(root, { onBack: showLogin });
      return;
    }

    if (profile.role === "admin") {
      showLoading(false);
      mountAdminShell(profile);
      return;
    }

    const barber = await loadCurrentBarber(session.user.id);
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
    mountBarberShell({ profile, barber });
  } catch (error) {
    showLoading(false);
    toast(friendlyError(error), "error");
    showLogin();
  }
}

function showLogin() {
  currentView = null;
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
    if (event === "SIGNED_OUT" && currentView !== null) {
      showLogin();
    }
  });
}

boot();
