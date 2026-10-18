"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/data/session";
import { listBusinesses } from "@/lib/data/businesses";
import { ACTIVE_BUSINESS_COOKIE } from "@/lib/data/shell";

/** Cambia el negocio activo (solo entre los negocios que el usuario puede ver). */
export async function setActiveBusiness(businessId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const allowed = (await listBusinesses()).some((b) => b.id === businessId);
  if (!allowed) return { ok: false };
  (await cookies()).set(ACTIVE_BUSINESS_COOKIE, businessId, { path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}
