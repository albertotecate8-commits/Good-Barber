import type { Api } from "./api";
import { createDemoApi, DEMO_FLAG } from "./demoApi";
import { createSupabaseApi } from "./supabaseApi";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

function isDemo(): boolean {
  try { return localStorage.getItem(DEMO_FLAG) === "1"; } catch { return false; }
}

export const api: Api = isDemo() || !supabaseConfigured ? createDemoApi() : createSupabaseApi(url!, key!);

export function enterDemo() {
  try { localStorage.setItem(DEMO_FLAG, "1"); } catch { /* */ }
  window.location.href = "/";
}

export { ApiError, friendlyError } from "./api";
export type * from "./types";
