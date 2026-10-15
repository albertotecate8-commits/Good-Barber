"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/action-state";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo no válido"),
  password: z.string().min(1, "Escribe tu contraseña").max(200),
  next: z.string().optional(),
});

// Solo rutas internas: evita redirecciones abiertas a otros sitios.
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    // Mensaje genérico: no revela si el correo existe.
    return {
      message:
        error.status === 429
          ? "Demasiados intentos. Espera unos minutos."
          : "Correo o contraseña incorrectos.",
    };
  }
  redirect(safeNext(parsed.data.next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
