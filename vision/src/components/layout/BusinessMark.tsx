/** Monograma con el color del negocio (genérico: sirve para negocios futuros). */
export function BusinessMark({ name, color, small }: { name: string; color: string; small?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className={small ? "biz-mark biz-mark-sm" : "biz-mark"} style={{ "--biz": color } as React.CSSProperties} aria-hidden>
      {initials}
    </span>
  );
}
