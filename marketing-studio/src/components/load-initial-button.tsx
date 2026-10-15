"use client";

import { useActionState } from "react";
import { loadInitialBusinesses } from "@/app/(app)/negocios/actions";
import { Button } from "./ui";

export function LoadInitialButton() {
  const [state, action, pending] = useActionState(loadInitialBusinesses, {});
  return (
    <form action={action} className="flex flex-col items-center gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Cargar Good Barber, Glamour Studio y AFORE PRO"}
      </Button>
      {state.message && (
        <p role="status" className={state.ok ? "text-sm text-positive" : "text-sm text-danger"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
