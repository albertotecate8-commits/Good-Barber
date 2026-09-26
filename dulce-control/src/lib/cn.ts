import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Colores propios del tema para que tailwind-merge sepa que bg-surface y bg-pink chocan.
const colors = ["bg", "surface", "surface-2", "line", "ink", "ink-2", "ink-3", "pink", "pink-strong", "pink-soft", "pink-ink",
  "mango", "mango-soft", "mint", "mint-soft", "choco", "choco-soft", "grape", "grape-soft", "sky", "sky-soft",
  "ok", "warn", "warn-soft", "danger", "danger-soft"];

const twMerge = extendTailwindMerge({ extend: { theme: { color: colors } } });

/** clsx + resolución de conflictos: la clase que llega por props gana. */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
