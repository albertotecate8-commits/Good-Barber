"use client";

import { Button } from "@/components/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-2xl border border-danger/30 bg-danger-soft p-6" role="alert">
      <h1 className="text-lg font-semibold">Algo salió mal</h1>
      <p className="mt-1 text-sm text-muted">
        {error.message && !error.digest ? error.message : "No se pudo cargar esta sección. Revisa tu conexión e inténtalo de nuevo."}
      </p>
      {error.digest && <p className="mt-1 text-xs text-faint">Código: {error.digest}</p>}
      <Button className="mt-4" variant="secondary" onClick={reset}>
        Reintentar
      </Button>
    </div>
  );
}
