import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-semibold">No encontrado</h1>
        <p className="mt-1 text-sm text-muted">La página no existe o no tienes acceso a ella.</p>
        <Link href="/" className="mt-4 inline-block text-action-strong hover:underline">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
