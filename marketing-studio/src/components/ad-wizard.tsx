"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ImageOff, Palette, RefreshCw, RotateCcw, Save, Send, CalendarClock } from "lucide-react";
import { AD_FORMATS, AD_GOALS, composeAds, unknownPrices, type AdFormat, type AdGoal, type AdOffer } from "@/lib/ads/compose";
import { formatCents, parsePriceToCents } from "@/lib/money";
import { PLATFORM_LABELS, type SocialPlatform } from "@/lib/validation/business";
import { INSTAGRAM_CAPTION_MAX, composePostText, parseHashtags } from "@/lib/validation/content";
import { assetUrl } from "./asset-preview";
import { Badge, Button, Card, Notice, Stepper } from "./ui";
import type { SaveAdInput, SaveAdResult } from "@/app/(app)/anuncio/actions";

export interface WizardBusiness {
  id: string;
  name: string;
  city: string;
  sector: string;
  color: string;
  offerings: { id: string; name: string; priceCents: number | null; kind: string; description: string }[];
  promotions: { id: string; title: string; details: string; restrictions: string }[];
  socials: { platform: string; handle: string; status: string }[];
  assets: { id: string; title: string; kind: string; mime: string }[];
}

interface Draft {
  step: number;
  businessId: string;
  goal: AdGoal | null;
  offerKey: string | null;
  customName: string;
  customPrice: string;
  customDetails: string;
  format: AdFormat | null;
  round: number;
  variant: number | null;
  headline: string;
  text: string;
  hashtags: string;
  assetId: string;
  platform: string;
  mode: "draft" | "review" | "scheduled";
  date: string;
  time: string;
}

const STEPS = ["Negocio", "Objetivo", "Oferta", "Formato", "Contenido", "Revisar", "Publicar"];
const STORAGE_KEY = "mkt-anuncio-en-curso-v1";
const FORMAT_TO_CONTENT: Record<AdFormat, string> = { post: "post", story: "story", reel: "reel", carousel: "carousel" };

const blank = (businessId: string): Draft => ({
  step: 0,
  businessId,
  goal: null,
  offerKey: null,
  customName: "",
  customPrice: "",
  customDetails: "",
  format: null,
  round: 0,
  variant: null,
  headline: "",
  text: "",
  hashtags: "",
  assetId: "",
  platform: "",
  mode: "draft",
  date: "",
  time: "10:00",
});

/** Anuncio a medias guardado en este dispositivo (null si no hay o ya no es válido). */
function loadDraft(businesses: WizardBusiness[]): Draft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Draft;
    if (!businesses.some((b) => b.id === saved.businessId) || !(saved.step > 0 || saved.goal)) return null;
    return { ...blank(saved.businessId), ...saved };
  } catch {
    return null;
  }
}

function ChoiceCard({ name, value, checked, onChange, children, accent }: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode; accent?: string }) {
  return (
    <label
      className={clsx(
        "pressable surface-raised relative flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border p-3.5 has-[:focus-visible]:shadow-[var(--ring)]",
        checked ? "border-action ring-1 ring-action" : "border-line/70 hover:border-line-strong",
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {accent && <span aria-hidden className="mt-1 size-3 shrink-0 rounded-full" style={{ background: accent }} />}
      <span className="min-w-0 flex-1">{children}</span>
      <span aria-hidden className={clsx("grid size-6 shrink-0 place-items-center rounded-full border", checked ? "border-action bg-action text-on-action" : "border-line-strong")}>
        {checked && <Check className="size-4" />}
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") return <Badge tone="positive">Conectada</Badge>;
  if (status === "expired" || status === "error") return <Badge tone="danger">Reconectar</Badge>;
  return <Badge>Publicación manual</Badge>;
}

export function AdWizard({ businesses, activeId, today, save }: { businesses: WizardBusiness[]; activeId: string; today: string; save: (i: SaveAdInput) => Promise<SaveAdResult> }) {
  const router = useRouter();
  // Solo se renderiza en el navegador (ver ad-wizard-loader): se puede leer el avance guardado al iniciar.
  const [initial] = useState(() => loadDraft(businesses));
  const [d, setD] = useState<Draft>(() => initial ?? blank(activeId));
  const [restored, setRestored] = useState(Boolean(initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch {
      /* sin almacenamiento local */
    }
  }, [d]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const biz = businesses.find((b) => b.id === d.businessId) ?? businesses[0];
  const knownPrices = biz.offerings.flatMap((o) => (o.priceCents === null ? [] : [o.priceCents]));

  const customPriceCents = useMemo(() => {
    try {
      return { ok: true as const, cents: parsePriceToCents(d.customPrice) };
    } catch {
      return { ok: false as const, cents: null };
    }
  }, [d.customPrice]);

  const offer: AdOffer | null = useMemo(() => {
    if (!d.offerKey) return null;
    if (d.offerKey === "custom") return d.customName.trim() ? { kind: "custom", name: d.customName.trim(), priceCents: customPriceCents.cents, details: d.customDetails.trim() } : null;
    const [type, id] = d.offerKey.split(":");
    if (type === "o") {
      const o = biz.offerings.find((x) => x.id === id);
      return o ? { kind: "offering", name: o.name, priceCents: o.priceCents, details: o.description } : null;
    }
    const p = biz.promotions.find((x) => x.id === id);
    return p ? { kind: "promotion", name: p.title, priceCents: null, details: p.details, restrictions: p.restrictions } : null;
  }, [d.offerKey, d.customName, d.customDetails, customPriceCents.cents, biz]);

  const variants = useMemo(
    () => (offer && d.goal && d.format ? composeAds({ business: biz, goal: d.goal, offer, format: d.format, round: d.round }) : []),
    [offer, d.goal, d.format, d.round, biz],
  );

  const destinations = useMemo(() => {
    const seen = new Map<string, { platform: string; handle: string; status: string }>();
    for (const s of biz.socials) if (["instagram", "facebook_page", "tiktok", "whatsapp", "google_business"].includes(s.platform) && !seen.has(s.platform)) seen.set(s.platform, s);
    if (!seen.size) for (const p of ["instagram", "facebook_page"]) seen.set(p, { platform: p, handle: "", status: "none" });
    return [...seen.values()];
  }, [biz]);

  const hasWork = Boolean(d.variant !== null || d.text || d.offerKey);
  const priceWarnings = unknownPrices(`${d.headline} ${d.text}`, [...knownPrices, ...(customPriceCents.cents !== null ? [customPriceCents.cents] : [])]);
  const finalText = composePostText(d.text, parseHashtags(d.hashtags).tags);
  const asset = biz.assets.find((a) => a.id === d.assetId) ?? null;
  const ratio = AD_FORMATS.find((f) => f.key === d.format)?.ratio ?? "4 / 5";

  const canNext = [
    Boolean(d.businessId),
    Boolean(d.goal),
    Boolean(offer) && (d.offerKey !== "custom" || customPriceCents.ok),
    Boolean(d.format),
    d.variant !== null && Boolean(d.headline.trim() && d.text.trim()),
    Boolean(d.headline.trim() && d.text.trim()),
    Boolean(d.platform) && (d.mode !== "scheduled" || Boolean(d.date && d.time)),
  ][d.step];

  function chooseBusiness(id: string) {
    if (id === d.businessId) return;
    const next = businesses.find((b) => b.id === id);
    if (hasWork && !window.confirm(`Cambiar a «${next?.name}» borra la oferta, el texto y la imagen preparados para «${biz.name}». ¿Continuar?`)) return;
    setD((prev) => ({ ...blank(id), step: prev.step, goal: prev.goal, format: prev.format }));
  }

  function pickVariant(i: number) {
    const v = variants[i];
    if (!v) return;
    const edited = d.variant !== null && (d.headline !== variants[d.variant]?.headline || d.text !== variants[d.variant]?.text);
    if (edited && !window.confirm("Ya editaste el texto. ¿Reemplazarlo por esta propuesta?")) return;
    set({ variant: i, headline: v.headline, text: v.text, hashtags: v.hashtags.map((t) => `#${t}`).join(" ") });
  }

  function regenerate() {
    set({ round: d.round + 1, variant: null });
  }

  function goto(step: number) {
    setMessage(null);
    set({ step: Math.max(0, Math.min(STEPS.length - 1, step)) });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    if (!window.confirm("¿Descartar este anuncio y empezar de nuevo?")) return;
    setD(blank(activeId));
    setRestored(false);
    setErrors({});
  }

  function submit() {
    setMessage(null);
    setErrors({});
    startSaving(async () => {
      const r = await save({
        business_id: d.businessId,
        platform: d.platform,
        format: d.format ? FORMAT_TO_CONTENT[d.format] : "post",
        headline: d.headline,
        text: d.text,
        hashtags: d.hashtags,
        asset_id: d.assetId,
        mode: d.mode,
        date: d.date,
        time: d.time,
      });
      if (r.ok) {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* sin almacenamiento */
        }
        router.push(`/calendario/${r.id}?guardado=1`);
        return;
      }
      setErrors(r.errors ?? {});
      setMessage(r.message);
      if (r.errors?.asset_id) set({ step: 4 });
      else if (r.errors?.caption || r.errors?.hashtags || r.errors?.title) set({ step: 5 });
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-surface/70 p-3 shadow-soft ring-1 ring-line/60">
          <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: biz.color }} />
          <p className="min-w-0 flex-1 truncate text-sm">
            Anuncio para <strong>{biz.name}</strong>
          </p>
          <button type="button" onClick={reset} className="pressable inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink">
            <RotateCcw className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Empezar de nuevo</span>
          </button>
        </div>

        <Stepper steps={STEPS} current={d.step} />
        <p className="mt-2 text-sm font-medium text-muted sm:hidden">
          Paso {d.step + 1} de {STEPS.length}: {STEPS[d.step]}
        </p>

        {restored && d.step > 0 && (
          <div className="mt-4" role="status">
            <Notice tone="action">Recuperamos el anuncio que dejaste a medias en este dispositivo.</Notice>
          </div>
        )}
        {message && (
          <div className="mt-4" role="alert">
            <Notice tone="danger" title={message}>
              {Object.values(errors).join(" ")}
            </Notice>
          </div>
        )}

        <div key={d.step} className="animate-rise mt-5">
          {d.step === 0 && (
            <fieldset>
              <legend className="mb-3 text-lg font-semibold">¿Para qué negocio es el anuncio?</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {businesses.map((b) => (
                  <ChoiceCard key={b.id} name="negocio" value={b.id} checked={d.businessId === b.id} onChange={() => chooseBusiness(b.id)} accent={b.color}>
                    <span className="block font-semibold">{b.name}</span>
                    <span className="block text-sm text-muted">
                      {b.sector || "Sin giro"} · {b.offerings.filter((o) => o.priceCents !== null).length} servicio(s) con precio
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </fieldset>
          )}

          {d.step === 1 && (
            <fieldset>
              <legend className="mb-3 text-lg font-semibold">¿Qué quieres lograr?</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {AD_GOALS.map((g) => (
                  <ChoiceCard key={g.key} name="objetivo" value={g.key} checked={d.goal === g.key} onChange={() => set({ goal: g.key, variant: null })}>
                    <span className="block font-semibold">{g.label}</span>
                    <span className="block text-sm text-muted">{g.description}</span>
                  </ChoiceCard>
                ))}
              </div>
            </fieldset>
          )}

          {d.step === 2 && (
            <fieldset>
              <legend className="mb-1 text-lg font-semibold">¿Qué vas a ofrecer?</legend>
              <p className="mb-3 text-sm text-muted">Los precios salen de lo registrado en {biz.name}; la app no inventa precios ni descuentos.</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {biz.promotions.map((p) => (
                  <ChoiceCard key={p.id} name="oferta" value={`p:${p.id}`} checked={d.offerKey === `p:${p.id}`} onChange={() => set({ offerKey: `p:${p.id}`, variant: null })}>
                    <span className="flex items-center gap-2 font-semibold">
                      {p.title} <Badge tone="gold">Promoción</Badge>
                    </span>
                    {p.details && <span className="block text-sm text-muted">{p.details}</span>}
                  </ChoiceCard>
                ))}
                {biz.offerings.map((o) => (
                  <ChoiceCard key={o.id} name="oferta" value={`o:${o.id}`} checked={d.offerKey === `o:${o.id}`} onChange={() => set({ offerKey: `o:${o.id}`, variant: null })}>
                    <span className="block font-semibold">{o.name}</span>
                    <span className="block text-sm text-muted">{o.priceCents === null ? "Sin precio registrado" : formatCents(o.priceCents)}</span>
                  </ChoiceCard>
                ))}
                <ChoiceCard name="oferta" value="custom" checked={d.offerKey === "custom"} onChange={() => set({ offerKey: "custom", variant: null })}>
                  <span className="block font-semibold">Escribir otra oferta</span>
                  <span className="block text-sm text-muted">Un servicio o novedad que no está en la lista</span>
                </ChoiceCard>
              </div>
              {!biz.offerings.length && !biz.promotions.length && (
                <p className="mt-3 text-sm text-muted">
                  {biz.name} aún no tiene servicios registrados.{" "}
                  <Link href={`/negocios`} className="font-medium text-action-strong underline">
                    Agrégalos en Negocios
                  </Link>{" "}
                  o escribe la oferta abajo.
                </p>
              )}
              {d.offerKey === "custom" && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <label htmlFor="of-nombre" className="text-sm font-medium">
                      ¿Qué ofreces?
                    </label>
                    <input id="of-nombre" className="input" maxLength={80} value={d.customName} onChange={(e) => set({ customName: e.target.value, variant: null })} placeholder="Ej.: Corte + lavado" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="of-precio" className="text-sm font-medium">
                      Precio (opcional)
                    </label>
                    <input id="of-precio" className="input" inputMode="decimal" value={d.customPrice} aria-invalid={!customPriceCents.ok} onChange={(e) => set({ customPrice: e.target.value, variant: null })} placeholder="Ej.: 150" />
                    {!customPriceCents.ok && <p className="text-xs text-danger">Escribe un precio válido, como 150 o 1,250.50.</p>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="of-detalle" className="text-sm font-medium">
                      Detalle (opcional)
                    </label>
                    <input id="of-detalle" className="input" maxLength={140} value={d.customDetails} onChange={(e) => set({ customDetails: e.target.value, variant: null })} placeholder="Ej.: Incluye lavado y peinado" />
                  </div>
                </div>
              )}
            </fieldset>
          )}

          {d.step === 3 && (
            <fieldset>
              <legend className="mb-3 text-lg font-semibold">¿En qué formato?</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {AD_FORMATS.map((f) => (
                  <ChoiceCard key={f.key} name="formato" value={f.key} checked={d.format === f.key} onChange={() => set({ format: f.key, variant: null })}>
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="w-7 shrink-0 rounded-md bg-action-soft ring-1 ring-action/30" style={{ aspectRatio: f.ratio }} />
                      <span>
                        <span className="block font-semibold">{f.label}</span>
                        <span className="block text-sm text-muted">{f.description}</span>
                      </span>
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </fieldset>
          )}

          {d.step === 4 && (
            <div className="flex flex-col gap-5">
              <fieldset>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <legend className="text-lg font-semibold">Elige una propuesta de texto</legend>
                  <Button type="button" variant="secondary" onClick={regenerate}>
                    <RefreshCw className="size-4" aria-hidden /> Otras propuestas
                  </Button>
                </div>
                <div className="grid gap-2.5">
                  {variants.map((v, i) => (
                    <ChoiceCard key={`${d.round}-${i}`} name="propuesta" value={String(i)} checked={d.variant === i} onChange={() => pickVariant(i)}>
                      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-action-strong">{v.angle}</span>
                      <span className="block font-semibold">{v.headline}</span>
                      <span className="mt-0.5 block text-sm text-muted">{v.text}</span>
                    </ChoiceCard>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-1 text-lg font-semibold">Imagen o video</legend>
                <p className="mb-3 text-sm text-muted">
                  Recomendado: una foto real de {biz.name}. Sugerencia: luz natural, el servicio en primer plano y el texto «{d.headline || "tu titular"}» grande y legible.
                </p>
                {errors.asset_id && <p className="mb-2 text-sm text-danger">{errors.asset_id}</p>}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => set({ assetId: "" })}
                    aria-pressed={!d.assetId}
                    className={clsx("pressable grid aspect-square place-items-center rounded-xl border text-xs text-muted", !d.assetId ? "border-action ring-1 ring-action" : "border-dashed border-line-strong")}
                  >
                    <span className="flex flex-col items-center gap-1">
                      <ImageOff className="size-5" aria-hidden /> Sin imagen
                    </span>
                  </button>
                  {biz.assets.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => set({ assetId: a.id })}
                      aria-pressed={d.assetId === a.id}
                      aria-label={`Usar «${a.title}»`}
                      className={clsx("pressable relative aspect-square overflow-hidden rounded-xl border bg-surface-2", d.assetId === a.id ? "border-action ring-2 ring-action" : "border-line")}
                    >
                      {a.mime.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(a.id)} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <span className="grid size-full place-items-center p-1 text-center text-[11px] text-muted">{a.title}</span>
                      )}
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/biblioteca" target="_blank" className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-soft hover:bg-surface-2">
                    Subir foto a la Biblioteca
                  </Link>
                  <Link href="/estudio" target="_blank" className="pressable inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-soft hover:bg-surface-2">
                    <Palette className="size-4" aria-hidden /> Diseñar en el Estudio creativo
                  </Link>
                </div>
                <p className="mt-2 text-xs text-muted">Se abren en otra pestaña: tu anuncio se conserva. Al volver, recarga esta página para ver las imágenes nuevas.</p>
              </fieldset>
            </div>
          )}

          {d.step === 5 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Revisa y ajusta</h2>
              {priceWarnings.length > 0 && (
                <Notice tone="warn" title="Revisa los precios">
                  {priceWarnings.join(", ")} no coincide con ningún precio registrado de {biz.name}. Corrígelo o actualiza el precio en Negocios.
                </Notice>
              )}
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ad-titulo" className="text-sm font-medium">
                  Titular
                </label>
                <input id="ad-titulo" className="input" maxLength={200} value={d.headline} onChange={(e) => set({ headline: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ad-texto" className="text-sm font-medium">
                  Texto del anuncio
                </label>
                <textarea id="ad-texto" className="input min-h-32" maxLength={5000} value={d.text} aria-invalid={Boolean(errors.caption)} onChange={(e) => set({ text: e.target.value })} />
                <p className={clsx("text-xs", finalText.length > INSTAGRAM_CAPTION_MAX ? "text-danger" : "text-muted")}>
                  {finalText.length} / {INSTAGRAM_CAPTION_MAX} caracteres con hashtags (límite de Instagram)
                </p>
                {errors.caption && <p className="text-xs text-danger">{errors.caption}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="ad-tags" className="text-sm font-medium">
                  Hashtags
                </label>
                <input id="ad-tags" className="input" value={d.hashtags} aria-invalid={Boolean(errors.hashtags)} onChange={(e) => set({ hashtags: e.target.value })} />
                {errors.hashtags && <p className="text-xs text-danger">{errors.hashtags}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={() => goto(4)}>
                  Cambiar imagen o propuesta
                </Button>
              </div>
            </div>
          )}

          {d.step === 6 && (
            <div className="flex flex-col gap-5">
              <fieldset>
                <legend className="mb-1 text-lg font-semibold">¿Dónde se publicará?</legend>
                <p className="mb-3 text-sm text-muted">Solo las redes registradas de {biz.name}. Nada se publica sin tu aprobación.</p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {destinations.map((s) => (
                    <ChoiceCard key={s.platform} name="destino" value={s.platform} checked={d.platform === s.platform} onChange={() => set({ platform: s.platform })}>
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        {PLATFORM_LABELS[s.platform as SocialPlatform]} {s.status === "none" ? <Badge tone="warn">No registrada</Badge> : <StatusBadge status={s.status} />}
                      </span>
                      <span className="block text-sm text-muted">
                        {s.status === "connected"
                          ? "Puede publicarse sola a la hora programada, después de que la apruebes."
                          : "Al llegar la hora copias el texto y lo publicas tú; la app lo registra."}
                      </span>
                    </ChoiceCard>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-3 text-lg font-semibold">¿Qué hacemos con el anuncio?</legend>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <ChoiceCard name="modo" value="draft" checked={d.mode === "draft"} onChange={() => set({ mode: "draft" })}>
                    <span className="block font-semibold">Guardar borrador</span>
                    <span className="block text-sm text-muted">Lo terminas después</span>
                  </ChoiceCard>
                  <ChoiceCard name="modo" value="review" checked={d.mode === "review"} onChange={() => set({ mode: "review" })}>
                    <span className="block font-semibold">Enviar a revisión</span>
                    <span className="block text-sm text-muted">Para aprobarlo antes</span>
                  </ChoiceCard>
                  <ChoiceCard name="modo" value="scheduled" checked={d.mode === "scheduled"} onChange={() => set({ mode: "scheduled" })}>
                    <span className="block font-semibold">Programar</span>
                    <span className="block text-sm text-muted">Fecha y hora</span>
                  </ChoiceCard>
                </div>
                {d.mode === "scheduled" && (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ad-fecha" className="text-sm font-medium">
                        Fecha
                      </label>
                      <input id="ad-fecha" type="date" min={today} className="input" value={d.date} aria-invalid={Boolean(errors.date)} onChange={(e) => set({ date: e.target.value })} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ad-hora" className="text-sm font-medium">
                        Hora (Ciudad de México)
                      </label>
                      <input id="ad-hora" type="time" className="input" value={d.time} aria-invalid={Boolean(errors.time)} onChange={(e) => set({ time: e.target.value })} />
                    </div>
                    {(errors.date || errors.time) && <p className="col-span-2 text-sm text-danger">{errors.date ?? errors.time}</p>}
                    {d.platform === "instagram" && !d.assetId && (
                      <p className="col-span-2 flex items-center gap-2 text-sm text-warn">
                        <AlertTriangle className="size-4 shrink-0" aria-hidden /> Instagram exige una imagen o video para programar: elígela en el paso «Contenido».
                      </p>
                    )}
                  </div>
                )}
              </fieldset>
              <Notice tone="gold" title="Preparado no es publicado">
                Al guardarlo queda en el Calendario como «{d.mode === "draft" ? "Borrador" : d.mode === "review" ? "En revisión" : "Programado"}». La
                publicación automática solo ocurre si la red está conectada y apruebas el anuncio desde su ficha.
              </Notice>
            </div>
          )}
        </div>

        {/* Navegación del asistente: fija sobre la barra inferior en el móvil */}
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-6 flex items-center justify-between gap-2 rounded-2xl bg-surface/95 p-2 shadow-float ring-1 ring-line/60 backdrop-blur lg:bottom-4">
          <Button type="button" variant="ghost" onClick={() => goto(d.step - 1)} disabled={d.step === 0 || saving}>
            <ArrowLeft className="size-4" aria-hidden /> Atrás
          </Button>
          {d.step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => goto(d.step + 1)} disabled={!canNext}>
              Siguiente <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" onClick={submit} disabled={!canNext || saving}>
              {d.mode === "draft" ? <Save className="size-4" aria-hidden /> : d.mode === "review" ? <Send className="size-4" aria-hidden /> : <CalendarClock className="size-4" aria-hidden />}
              {saving ? "Guardando…" : d.mode === "draft" ? "Guardar borrador" : d.mode === "review" ? "Enviar a revisión" : "Programar publicación"}
            </Button>
          )}
        </div>
      </div>

      {/* Vista previa realista (visible desde el paso de contenido; en escritorio a un lado) */}
      <aside aria-label="Vista previa del anuncio" className={clsx("lg:sticky lg:top-24 lg:self-start", d.step < 4 && "hidden lg:block")}>
        <Card className="p-3 sm:p-3">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-faint">Vista previa</p>
          <div className="mx-auto max-w-[300px] overflow-hidden rounded-[1.75rem] border-[6px] border-[#1e293b] bg-surface shadow-float">
            <div className="flex items-center gap-2 px-3 py-2">
              <span aria-hidden className="grid size-7 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: biz.color }}>
                {biz.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">{biz.name}</span>
              <span className="text-[10px] text-faint">Patrocinado</span>
            </div>
            <div className="relative w-full overflow-hidden bg-surface-3" style={{ aspectRatio: ratio }}>
              {asset?.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(asset.id)} alt="" className="absolute inset-0 size-full object-cover" />
              ) : asset ? (
                <video src={assetUrl(asset.id)} className="absolute inset-0 size-full object-cover" muted playsInline />
              ) : (
                <div className="absolute inset-0 grid place-items-center p-5 text-center" style={{ background: `linear-gradient(150deg, ${biz.color}, #0f172a)` }}>
                  <p className="text-lg font-bold leading-tight text-white drop-shadow">{d.headline || "Tu titular aparecerá aquí"}</p>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
              <span className="truncate text-xs font-semibold">{variants[d.variant ?? 0]?.cta ?? "Llamada a la acción"}</span>
              <span className="rounded-md bg-action px-2 py-1 text-[10px] font-semibold text-on-action">Enviar mensaje</span>
            </div>
            <div className="max-h-44 overflow-y-auto px-3 py-2 text-xs leading-relaxed">
              <span className="font-semibold">{biz.name} </span>
              {d.text ? <span className="whitespace-pre-wrap">{finalText}</span> : <span className="text-faint">El texto del anuncio aparecerá aquí.</span>}
            </div>
          </div>
          <p className="mt-2 px-1 text-[11px] text-muted">Aproximación: cada red recorta y muestra el texto a su manera.</p>
        </Card>
      </aside>
    </div>
  );
}
