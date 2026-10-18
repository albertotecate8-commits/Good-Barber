"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Stamp } from "lucide-react";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { assetSrc } from "./types";

/** El logotipo oficial se guarda en la Biblioteca del negocio (tipo «logo»). */
export function LogoUploader({ businessId, businessName, logos }: { businessId: string; businessName: string; logos: { id: string; title: string }[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {logos.map((l) => (
        // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada
        <img key={l.id} src={assetSrc(l.id)} alt={l.title} className="size-16 rounded-xl bg-surface-3 object-contain p-1 ring-1 ring-line" />
      ))}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Stamp className="size-4" aria-hidden />}
        {logos.length ? "Subir otra versión" : "Subir logotipo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        tabIndex={-1}
        aria-label="Archivo del logotipo"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const r = await uploadToLibrary(f, {
            business_id: businessId,
            kind: "logo",
            origin: "unspecified",
            title: `Logotipo de ${businessName}`.slice(0, 160),
            description: "Logotipo oficial.",
            tags: "logotipo",
            license_note: "",
            asset_date: "",
            original_name: f.name || "logotipo.png",
          });
          setBusy(false);
          setMsg(r.ok ? "Logotipo guardado." : r.message);
          if (r.ok) router.refresh();
        }}
      />
      {msg && (
        <p role="status" className="w-full text-xs text-muted">
          {msg}
        </p>
      )}
      {!logos.length && <p className="w-full text-xs text-muted">Sin logotipo, los prompts piden dejar libre el espacio para agregarlo después (nunca se inventa uno).</p>}
    </div>
  );
}
