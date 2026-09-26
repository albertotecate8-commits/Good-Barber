import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiError, type Api } from "./api";
import type {
  Category, CostHistoryEntry, Product, Purchase, PurchaseItem, ScanResult, SessionUser, WeeklyCount, WeeklyCountItem,
} from "./types";

// PostgREST puede devolver numeric como texto: normalizamos.
const num = (v: unknown) => (v == null ? 0 : Number(v));
const numOrNull = (v: unknown) => (v == null ? null : Number(v));

const toProduct = (r: Record<string, unknown>): Product => ({
  ...(r as unknown as Product),
  cost_price: num(r.cost_price),
  sale_price: num(r.sale_price),
});
const toCount = (r: Record<string, unknown>): WeeklyCount => ({
  ...(r as unknown as WeeklyCount),
  total_sales: num(r.total_sales),
  total_cost: num(r.total_cost),
  total_profit: num(r.total_profit),
});
const toCountItem = (r: Record<string, unknown>): WeeklyCountItem => ({
  ...(r as unknown as WeeklyCountItem),
  unit_cost: num(r.unit_cost),
  unit_price: num(r.unit_price),
  sales_amount: num(r.sales_amount),
  cost_amount: num(r.cost_amount),
  profit_amount: num(r.profit_amount),
});
const toPurchase = (r: Record<string, unknown>): Purchase => ({
  ...(r as unknown as Purchase),
  total_cost: num(r.total_cost),
});
const toPurchaseItem = (r: Record<string, unknown>): PurchaseItem => ({
  ...(r as unknown as PurchaseItem),
  unit_cost: numOrNull(r.unit_cost),
  line_total: numOrNull(r.line_total),
});

const toUser = (u: User | null | undefined): SessionUser | null => (u ? { id: u.id, email: u.email ?? null } : null);

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new ApiError(res.error.code ?? "DB", res.error.message);
  return res.data;
}

export function createSupabaseApi(url: string, key: string): Api {
  const sb: SupabaseClient = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true },
  });

  async function uid(): Promise<string> {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new ApiError("NO_AUTH", "Tu sesión expiró. Vuelve a entrar.");
    return id;
  }

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new ApiError("AUTH", error.message);
    },
    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({
        email, password, options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw new ApiError("AUTH", error.message);
      return { needsConfirmation: !data.session };
    },
    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (error) throw new ApiError("AUTH", error.message);
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async getProfile() {
      const data = check(await sb.from("profiles").select("id, business_name").maybeSingle());
      return data;
    },
    async updateProfile(businessName) {
      const id = await uid();
      check(await sb.from("profiles").update({ business_name: businessName }).eq("id", id));
    },

    async listCategories() {
      return check(await sb.from("categories").select("id, name, emoji, color, sort_order").order("sort_order").order("name")) as Category[];
    },
    async createCategory(input) {
      return check(await sb.from("categories").insert(input).select("id, name, emoji, color, sort_order").single()) as Category;
    },
    async deleteCategory(id) {
      check(await sb.from("categories").delete().eq("id", id));
    },

    async listProducts() {
      const rows = check(await sb.from("products").select("*").order("name"));
      return (rows ?? []).map(toProduct);
    },
    async createProduct(input) {
      const row = check(await sb.from("products").insert({
        ...input, name: input.name.trim(), current_quantity: input.current_quantity ?? 0,
      }).select("*").single());
      return toProduct(row);
    },
    async updateProduct(id, patch) {
      check(await sb.from("products").update(patch).eq("id", id));
    },
    async deleteProduct(id) {
      const res = await sb.from("products").delete().eq("id", id);
      if (res.error?.code === "23503") throw new ApiError("EN_USO", "EN_USO");
      check(res);
    },
    async costHistory(productId) {
      const rows = check(await sb.from("product_cost_history")
        .select("id, product_id, cost_price, sale_price, effective_from, source")
        .eq("product_id", productId).order("effective_from", { ascending: false }));
      return (rows ?? []).map((r) => ({ ...r, cost_price: num(r.cost_price), sale_price: num(r.sale_price) })) as CostHistoryEntry[];
    },

    async saveCount(items, kind, notes) {
      return check(await sb.rpc("save_weekly_count", { p_items: items, p_kind: kind, p_notes: notes ?? null })) as string;
    },
    async listCounts() {
      const rows = check(await sb.from("weekly_counts").select("*").order("counted_at", { ascending: false }));
      return (rows ?? []).map(toCount);
    },
    async getCount(id) {
      const count = check(await sb.from("weekly_counts").select("*").eq("id", id).single());
      const items = check(await sb.from("weekly_count_items").select("*").eq("weekly_count_id", id).order("product_name"));
      return { ...toCount(count), items: (items ?? []).map(toCountItem) };
    },

    async confirmPurchase(input) {
      return check(await sb.rpc("confirm_purchase", {
        p_items: input.items,
        p_purchased_at: input.purchased_at ?? null,
        p_store_name: input.store_name ?? null,
        p_source: input.source,
        p_ticket_path: input.ticket_path ?? null,
        p_notes: input.notes ?? null,
      })) as string;
    },
    async listPurchases() {
      const rows = check(await sb.from("purchases").select("*").order("purchased_at", { ascending: false }));
      return (rows ?? []).map(toPurchase);
    },
    async getPurchase(id) {
      const p = check(await sb.from("purchases").select("*").eq("id", id).single());
      const items = check(await sb.from("purchase_items").select("*").eq("purchase_id", id));
      return { ...toPurchase(p), items: (items ?? []).map(toPurchaseItem) };
    },
    async uploadTicket(file) {
      const id = await uid();
      const path = `${id}/${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}.jpg`;
      check(await sb.storage.from("tickets").upload(path, file, { contentType: "image/jpeg", upsert: false }));
      return path;
    },
    async ticketUrl(path) {
      const { data } = await sb.storage.from("tickets").createSignedUrl(path, 60 * 10);
      return data?.signedUrl ?? null;
    },
    async scanTicket(imageBase64, mediaType, catalog) {
      const { data, error } = await sb.functions.invoke<ScanResult & { error?: string }>("scan-ticket", {
        body: { image_base64: imageBase64, media_type: mediaType, catalog },
      });
      if (error) {
        let message = "No se pudo leer el ticket.";
        try {
          const body = await (error as { context?: Response }).context?.json();
          if (body?.error) message = body.error;
        } catch { /* sin cuerpo */ }
        throw new ApiError("SCAN", message);
      }
      if (!data) throw new ApiError("SCAN", "No se pudo leer el ticket.");
      return data;
    },
  };
}
