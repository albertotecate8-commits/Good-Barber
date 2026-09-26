import { clsx } from "clsx";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Tone = "ok" | "error" | "info";
interface Toast { id: number; text: string; tone: Tone }

const Ctx = createContext<(text: string, tone?: Tone) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Tone = "ok") => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, text, tone }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === "error" ? 5000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 pt-safe" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-card animate-pop-in",
              t.tone === "ok" && "bg-ink text-bg",
              t.tone === "info" && "bg-surface text-ink border border-line",
              t.tone === "error" && "bg-danger text-white",
            )}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
