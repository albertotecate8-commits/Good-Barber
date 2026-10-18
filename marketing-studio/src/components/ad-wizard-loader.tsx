"use client";

import dynamic from "next/dynamic";

// El asistente guarda el avance en el dispositivo: se carga solo en el navegador
// para leerlo al iniciar sin desajustes entre servidor y cliente.
export const AdWizardLoader = dynamic(() => import("./ad-wizard").then((m) => m.AdWizard), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando el asistente">
      <div className="h-14 animate-pulse rounded-2xl bg-surface-3" />
      <div className="h-2 animate-pulse rounded-full bg-surface-3" />
      <div className="grid gap-2.5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-3" />
        ))}
      </div>
    </div>
  ),
});
