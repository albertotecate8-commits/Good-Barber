"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Brain, Check, Sparkles } from "lucide-react";
import { saveFindingToMemory } from "@/app/(app)/_studio/actions";

/** «Guardar en memoria» y «Crear con esto» para una conclusión de investigación. */
export function FindingActions({ findingId, saved, idea }: { findingId: string; saved: boolean; idea: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2">
      {saved ? (
        <span className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-positive-soft px-3 text-xs font-semibold text-positive">
          <Check className="size-3.5" aria-hidden /> En la memoria
        </span>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveFindingToMemory(findingId);
              if (!r.ok) setError(r.message);
              else router.refresh();
            })
          }
          className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold hover:bg-surface-2 disabled:opacity-60"
        >
          <Brain className="size-3.5" aria-hidden /> Guardar en memoria
        </button>
      )}
      <Link href={`/?nueva=1&idea=${encodeURIComponent(idea)}`} className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-action px-3 text-xs font-semibold text-on-action">
        <Sparkles className="size-3.5" aria-hidden /> Crear con esto
      </Link>
      {error && (
        <p role="alert" className="w-full text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
