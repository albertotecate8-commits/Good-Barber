export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-4">
      <span className="sr-only">Cargando…</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    </div>
  );
}
