// Autenticación con Supabase Auth. Nunca maneja contraseñas manualmente.

function sb() {
  return window.supabaseClient;
}

export async function getSession() {
  const { data, error } = await sb().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signIn(email, password) {
  const { data, error } = await sb().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  await sb().auth.signOut();
}

export async function requestPasswordReset(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await sb().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await sb().auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export function onAuthStateChange(callback) {
  const { data } = sb().auth.onAuthStateChange((event, session) => callback(event, session));
  return data.subscription;
}

export async function loadCurrentProfile(userId) {
  const { data, error } = await sb().from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function loadCurrentBarber(userId) {
  const { data, error } = await sb().from("barbers").select("*").eq("profile_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
