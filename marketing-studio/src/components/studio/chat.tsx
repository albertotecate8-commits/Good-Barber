"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import {
  ArrowUp,
  BadgeCheck,
  Brain,
  Columns2,
  ImagePlus,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Palette,
  Sparkles,
  Stamp,
  X,
} from "lucide-react";
import type { Proposal } from "@/lib/studio/propose";
import { uploadToLibrary } from "@/lib/storage/client-upload";
import { sendStudioMessage, setThreadStyle } from "@/app/(app)/_studio/actions";
import { ProposalCard, Sketch } from "./proposal-card";
import { publicationLabel, ReviewDialog } from "./review-dialog";
import {
  assetSrc,
  DESTINATION_LABELS,
  type Readiness,
  type StudioBusiness,
  type StudioMessage,
  type StudioPublication,
  type StudioVersion,
  type GenerationState,
  type StyleChip,
} from "./types";
import type { PlannedReference } from "./refs";

const SUGGESTIONS = [
  "Haz tres anuncios diferentes",
  "Hazlo más premium y menos artificial",
  "Conserva la composición, pero cambia los colores y la promoción",
  "Usa el estilo que guardamos la semana pasada",
  "Adapta este concepto a una historia de Instagram",
  "Recuerda que…",
];

interface Attachment {
  id: string;
  name: string;
  kind: "image" | "logo";
}

export function StudioChat(props: {
  business: StudioBusiness;
  thread: { id: string; title: string; styleId: string | null } | null;
  threads: { id: string; title: string; updatedAt: string }[];
  messages: StudioMessage[];
  versions: StudioVersion[];
  publications: StudioPublication[];
  styles: StyleChip[];
  memoryCount: number;
  recentImages: { id: string; title: string; origin: string }[];
  hasLogo: boolean;
  logo: { id: string; title: string } | null;
  prices: { name: string; cents: number }[];
  readiness: Readiness;
  initialStyleId: string | null;
  initialText: string;
  generation: GenerationState;
  projectId: string | null;
}) {
  const { business, thread, messages, versions, publications, styles } = props;
  const router = useRouter();
  const [text, setText] = useState(props.initialText);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    tone: "ok" | "error";
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [compare, setCompare] = useState<string[] | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [styleId, setStyleId] = useState<string | null>(
    thread?.styleId ?? props.initialStyleId,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<"image" | "logo">("image");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Propuestas por versión y las imágenes importadas de cada una.
  const proposals = useMemo(() => {
    const map = new Map<string, Proposal & { versionId: string }>();
    for (const m of messages)
      for (const p of m.payload?.proposals ?? []) map.set(p.versionId, p);
    return map;
  }, [messages]);
  // Imágenes reales (importadas, generadas o editadas con texto exacto).
  const images = useMemo(
    () => versions.filter((v) => (v.kind === "imported_result" || v.kind === "code_edit") && v.asset_id),
    [versions],
  );
  /** Propuesta de la que sale una versión (sube por la cadena de versiones). */
  const conceptOf = (versionId: string): string | null => {
    let id: string | null = versionId;
    for (let i = 0; id && i < 12; i++) {
      if (proposals.has(id)) return id;
      id = versions.find((x) => x.id === id)?.parent_version_id ?? null;
    }
    return null;
  };
  const imagesOf = (conceptId: string) => images.filter((v) => conceptOf(v.id) === conceptId);
  const proposalOf = (versionId: string) => {
    const c = conceptOf(versionId);
    return c ? (proposals.get(c) ?? null) : null;
  };
  // Referencias que adjuntó la persona en esta conversación (las más recientes primero).
  const userRefs = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of [...messages].reverse()) if (m.role === "user") for (const a of m.asset_ids)
          if (!seen.has(a)) {
            seen.add(a);
            out.push(a);
          }
    return out;
  }, [messages]);
  /** Qué referencias recibe cada propuesta: versión anterior, estilo guardado y adjuntos. */
  const plannedRefsFor = (p: Proposal): PlannedReference[] => {
    const out: PlannedReference[] = [];
    if (p.parentKey) {
      const parent = [...proposals.values()].find((x) => x.key === p.parentKey);
      const prev = parent ? imagesOf(parent.versionId).at(-1) : undefined;
      if (prev?.asset_id) out.push({ role: "previous", assetId: prev.asset_id, label: `versión anterior v${prev.version_no}` });
    }
    const st = styles.find((x) => x.id === p.styleId);
    if (st?.referenceAssetIds[0]) out.push({ role: "style", assetId: st.referenceAssetIds[0], label: `estilo «${st.name}»` });
    for (const a of userRefs) if (out.length < 4 && !out.some((r) => r.assetId === a)) out.push({ role: "reference", assetId: a, label: "referencia adjunta" });
    return out.slice(0, 4);
  };
  const attachFilesFor = (p: Proposal) => [
    ...(props.logo ? [{ assetId: props.logo.id, label: "Logotipo" }] : []),
    ...plannedRefsFor(p).map((r) => ({
      assetId: r.assetId,
      label: r.role === "previous" ? "Imagen anterior" : r.role === "style" ? "Referencia del estilo" : "Referencia",
    })),
  ];
  const selected = selectedId
    ? (versions.find((v) => v.id === selectedId) ?? null)
    : null;
  const selectedProposal = selectedId ? proposalOf(selectedId) : null;
  const latestImage = images[images.length - 1] ?? null;
  const approveTarget = selected?.asset_id ? selected : latestImage;

  useEffect(() => {
    if (messages.length || pending) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  // El cuadro de texto crece con el mensaje (hasta ~6 líneas).
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const flash = (t: string, tone: "ok" | "error" = "ok") =>
    setNotice({ text: t, tone });

  const send = async (raw?: string) => {
    const value = (raw ?? text).trim();
    if (!value || pending) return;
    setPending(value);
    setText("");
    setNotice(null);
    const r = await sendStudioMessage({
      businessId: business.id,
      threadId: thread?.id ?? null,
      text: value,
      assetIds: attachments.map((a) => a.id),
      styleId,
    });
    if (!r.ok) {
      setPending(null);
      setText(value);
      flash(r.message, "error");
      return;
    }
    setAttachments([]);
    startTransition(() => {
      if (!thread) router.replace(`/?c=${r.threadId}`);
      else router.refresh();
    });
    setPending(null);
  };

  const attach = async (files: FileList | null, kind: "image" | "logo") => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files).slice(0, 6 - attachments.length)) {
      const r = await uploadToLibrary(f, {
        business_id: business.id,
        kind,
        origin: "unspecified",
        title: (kind === "logo"
          ? `Logotipo de ${business.name}`
          : `Referencia: ${f.name}`
        ).slice(0, 160),
        description:
          kind === "logo"
            ? "Logotipo oficial subido desde el chat creativo."
            : "Referencia adjunta en el chat creativo.",
        tags: kind === "logo" ? "logotipo, chat" : "referencia, chat",
        license_note: "",
        asset_date: "",
        original_name: f.name || "imagen.png",
      });
      if (r.ok) setAttachments((l) => [...l, { id: r.id, name: f.name, kind }]);
      else flash(r.message, "error");
    }
    setUploading(false);
    inputRef.current?.focus();
  };

  const chooseStyle = (id: string | null) => {
    setStyleId(id);
    if (thread) void setThreadStyle(thread.id, id);
  };

  const select = (id: string) => {
    setSelectedId(id);
    setCompare(null);
    setSheetOpen(true);
  };

  const activeStyle = styles.find((s) => s.id === styleId) ?? null;
  const empty = messages.length === 0 && !pending;

  const preview = (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Vista previa</h2>
        {images.length >= 2 && (
          <button
            type="button"
            onClick={() =>
              setCompare(
                compare
                  ? null
                  : [
                      images[images.length - 2].id,
                      images[images.length - 1].id,
                    ],
              )
            }
            aria-pressed={Boolean(compare)}
            className="pressable inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-2.5 text-xs font-semibold hover:bg-surface-2"
          >
            <Columns2 className="size-3.5" aria-hidden />{" "}
            {compare ? "Salir de comparar" : "Comparar versiones"}
          </button>
        )}
      </div>
      {compare ? (
        <div className="grid grid-cols-2 gap-2">
          {compare.map((id, slot) => {
            const v = images.find((x) => x.id === id)!;
            return (
              <div key={slot} className="flex flex-col gap-1.5">
                <select
                  aria-label={`Versión a comparar ${slot + 1}`}
                  className="input h-9 text-xs"
                  value={id}
                  onChange={(e) =>
                    setCompare((c) =>
                      c
                        ? c.map((x, i) => (i === slot ? e.target.value : x))
                        : c,
                    )
                  }
                >
                  {images.map((im) => (
                    <option key={im.id} value={im.id}>
                      v{im.version_no} · {proposalOf(im.id)?.title ?? "Imagen"}
                    </option>
                  ))}
                </select>
                {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
                <img
                  src={assetSrc(v.asset_id!)}
                  alt={`Versión ${v.version_no}`}
                  className="w-full rounded-xl bg-surface-3 object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(v.id);
                    setCompare(null);
                  }}
                  className="pressable min-h-10 rounded-xl border border-line text-xs font-semibold hover:bg-surface-2"
                >
                  Elegir v{v.version_no}
                </button>
              </div>
            );
          })}
        </div>
      ) : selected?.asset_id ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
          <img
            src={assetSrc(selected.asset_id)}
            alt={`Versión ${selected.version_no}${selectedProposal ? ` de «${selectedProposal.title}»` : ""}`}
            className="max-h-[60dvh] w-full rounded-2xl bg-surface-3 object-contain"
          />
          <p className="text-xs text-muted">
            v{selected.version_no}
            {selectedProposal
              ? ` · ${selectedProposal.title} · ${selectedProposal.headline}`
              : ""}
            {selected.is_final ? " · aprobada" : ""}
          </p>
        </>
      ) : selectedProposal ? (
        <>
          <Sketch
            p={selectedProposal}
            color={business.color}
            className="max-h-[60dvh]"
          />
          <p className="text-xs text-muted">
            Esto es un boceto. Genera la imagen con el prompt y súbela para
            revisarla y aprobarla.
          </p>
        </>
      ) : latestImage ? (
        <button
          type="button"
          onClick={() => setSelectedId(latestImage.id)}
          className="pressable rounded-2xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
          <img
            src={assetSrc(latestImage.asset_id!)}
            alt="Última imagen importada"
            className="w-full rounded-2xl bg-surface-3 object-contain"
          />
        </button>
      ) : (
        <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">
          Aquí verás la propuesta o la imagen que elijas.
        </div>
      )}
      {approveTarget && (
        <div className="flex flex-col gap-1">
          {publications
            .filter((p) => p.creative_version_id === approveTarget.id)
            .map((p) => {
              const l = publicationLabel(p);
              return (
                <p key={p.id} className={clsx("text-xs", l.tone)}>
                  {DESTINATION_LABELS[p.platform as "instagram"] ?? p.platform}:{" "}
                  {l.text}
                  {p.external_post_url && (
                    <a
                      href={p.external_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 underline"
                    >
                      ver
                    </a>
                  )}
                </p>
              );
            })}
        </div>
      )}
      <button
        type="button"
        disabled={!approveTarget}
        onClick={() => approveTarget && setReviewing(approveTarget.id)}
        className="pressable mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-action px-4 text-sm font-semibold text-on-action shadow-raised hover:bg-action-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BadgeCheck className="size-5" aria-hidden /> Revisar y aprobar
      </button>
      {!approveTarget && (
        <p className="-mt-1 text-center text-xs text-muted">
          Se activa cuando subes una imagen generada.
        </p>
      )}
    </div>
  );

  return (
    <div className="lg:grid lg:h-[calc(100dvh-5.5rem)] lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
      {/* Columna del chat */}
      <section
        aria-label="Chat creativo"
        className="flex h-[calc(100dvh-9.75rem-env(safe-area-inset-bottom))] min-h-[26rem] flex-col lg:h-auto lg:min-h-0"
      >
        <div className="flex items-center gap-2 pb-3 sm:flex-wrap">
          <div className="mr-auto min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-action-strong">
              Estudio creativo
            </p>
            <h2 className="truncate text-lg font-semibold tracking-tight sm:text-2xl">
              {business.name}
            </h2>
          </div>
          <label className="relative flex min-h-10 items-center rounded-xl border border-line bg-surface shadow-soft">
            <span className="sr-only">Estilo para esta conversación</span>
            <Palette
              className="pointer-events-none absolute left-2.5 size-4 text-muted"
              aria-hidden
            />
            <select
              value={styleId ?? ""}
              onChange={(e) => chooseStyle(e.target.value || null)}
              className="h-10 max-w-32 appearance-none truncate rounded-xl bg-transparent pl-8 pr-3 text-sm outline-none sm:max-w-44"
            >
              <option value="">Sin estilo</option>
              {styles.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {props.threads.length > 0 && (
            <label className="relative hidden min-h-10 items-center rounded-xl border border-line bg-surface shadow-soft sm:flex">
              <span className="sr-only">Conversaciones</span>
              <select
                value={thread?.id ?? ""}
                onChange={(e) =>
                  router.push(
                    e.target.value ? `/?c=${e.target.value}` : "/?nueva=1",
                  )
                }
                className="h-10 max-w-48 appearance-none truncate rounded-xl bg-transparent px-3 text-sm outline-none"
              >
                {!thread && <option value="">Nueva conversación</option>}
                {props.threads.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Link
            href="/?nueva=1"
            className="pressable inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium shadow-soft hover:bg-surface-2"
            aria-label="Nueva conversación"
          >
            <MessageSquarePlus className="size-4" aria-hidden />{" "}
            <span className="hidden sm:inline">Nueva</span>
          </Link>
        </div>

        <div className="surface-raised flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-line/70">
          <div
            className="@container flex-1 overflow-y-auto px-3 py-4 sm:px-5"
            role="log"
            aria-live="polite"
            aria-label="Conversación"
          >
            {empty ? (
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-6 text-center">
                <span
                  aria-hidden
                  className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[#3cc3be] to-[#0e7c82] text-white shadow-float"
                >
                  <Sparkles className="size-7" />
                </span>
                <div>
                  <p className="text-lg font-semibold">
                    ¿Qué creamos hoy para {business.name}?
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    Uso su identidad, sus precios registrados
                    {props.memoryCount
                      ? ` y ${props.memoryCount} dato(s) de su memoria`
                      : ""}
                    . Preparo propuestas y el prompt exacto; la imagen se genera
                    en ChatGPT y la subes aquí.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        if (s.endsWith("…")) {
                          setText("Recuerda que ");
                          inputRef.current?.focus();
                        } else void send(s);
                      }}
                      className="pressable min-h-10 rounded-full border border-line bg-surface px-3 text-sm hover:border-action hover:text-action-strong"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {styles.length > 0 && (
                  <div className="w-full">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                      Estilos guardados
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {styles.slice(0, 6).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => chooseStyle(s.id)}
                          aria-pressed={styleId === s.id}
                          className={clsx(
                            "pressable flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm",
                            styleId === s.id
                              ? "border-action bg-action-soft"
                              : "border-line bg-surface",
                          )}
                        >
                          <span aria-hidden className="flex">
                            {s.palette.map((c) => (
                              <span
                                key={c}
                                className="-ml-1 size-4 rounded-full ring-2 ring-surface first:ml-0"
                                style={{ background: c }}
                              />
                            ))}
                          </span>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {props.recentImages.length > 0 && (
                  <div className="w-full">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">
                      Últimas imágenes
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {props.recentImages.map((im) => (
                        // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada
                        <img
                          key={im.id}
                          src={assetSrc(im.id)}
                          alt={im.title}
                          className="size-20 shrink-0 rounded-xl bg-surface-3 object-cover"
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted">
                  <Link href="/estilos" className="underline">
                    Estilos y memoria
                  </Link>{" "}
                  ·{" "}
                  {props.hasLogo
                    ? "Logotipo guardado"
                    : "Sin logotipo guardado"}{" "}
                  · Este chat no publica nada sin tu aprobación.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-5">
                {messages.map((m) =>
                  m.role === "user" ? (
                    <li
                      key={m.id}
                      className="ml-auto flex max-w-[85%] flex-col items-end gap-1.5"
                    >
                      {m.asset_ids.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {m.asset_ids.map((a) => (
                            // eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada
                            <img
                              key={a}
                              src={assetSrc(a)}
                              alt="Adjunto"
                              className="size-16 rounded-xl bg-surface-3 object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-action px-3.5 py-2.5 text-sm text-on-action">
                        {m.content}
                      </p>
                    </li>
                  ) : (
                    <li key={m.id} className="flex flex-col gap-3">
                      <div className="flex max-w-[92%] gap-2">
                        <span
                          aria-hidden
                          className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-[#3cc3be] to-[#0e7c82] text-white"
                        >
                          <Sparkles className="size-4" />
                        </span>
                        <div className="flex flex-col gap-1.5">
                          <p className="text-sm text-ink">{m.content}</p>
                          {m.payload?.memory && (
                            <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-action-soft px-2.5 py-1 text-xs font-medium text-action-strong">
                              <Brain className="size-3.5" aria-hidden />{" "}
                              Memoria: {m.payload.memory.text}
                            </p>
                          )}
                          {m.payload?.links?.map((l) => (
                            <Link
                              key={l.href}
                              href={l.href}
                              className="w-fit text-sm font-medium text-action-strong underline"
                            >
                              {l.label}
                            </Link>
                          ))}
                          {m.asset_ids.length > 0 && m.version_id && (
                            <button
                              type="button"
                              onClick={() => select(m.version_id!)}
                              className="pressable w-fit overflow-hidden rounded-xl"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
                              <img
                                src={assetSrc(m.asset_ids[0])}
                                alt="Imagen importada"
                                className="max-h-56 rounded-xl bg-surface-3 object-contain"
                              />
                            </button>
                          )}
                        </div>
                      </div>
                      {(m.payload?.proposals?.length ?? 0) > 0 && thread && (
                        <div
                          className={clsx(
                            "grid gap-3",
                            m.payload!.proposals!.length > 1 &&
                              "@lg:grid-cols-2 @4xl:grid-cols-3",
                          )}
                        >
                          {m.payload!.proposals!.map((p, i) => (
                            <ProposalCard
                              key={p.versionId}
                              p={p}
                              index={i}
                              color={business.color}
                              threadId={thread.id}
                              projectId={props.projectId}
                              canGenerate={props.generation.available}
                              generationNote={props.generation.note}
                              plannedRefs={plannedRefsFor(p)}
                              attachFiles={attachFilesFor(p)}
                              businessId={business.id}
                              businessName={business.name}
                              images={imagesOf(p.versionId)}
                              selectedId={selectedId}
                              onSelect={select}
                              onNotice={flash}
                              onImported={(id) => {
                                router.refresh();
                                setSelectedId(id);
                              }}
                            />
                          ))}
                        </div>
                      )}
                    </li>
                  ),
                )}
                {pending && (
                  <>
                    <li className="ml-auto max-w-[85%]">
                      <p className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-action/80 px-3.5 py-2.5 text-sm text-on-action">
                        {pending}
                      </p>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />{" "}
                      Preparando propuestas con la identidad y la memoria de{" "}
                      {business.name}…
                    </li>
                  </>
                )}
              </ol>
            )}
            <div ref={endRef} />
          </div>

          {/* Redacción */}
          <div className="border-t border-line/70 bg-surface p-2.5 sm:p-3">
            {notice && (
              <p
                role={notice.tone === "error" ? "alert" : "status"}
                className={clsx(
                  "mb-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
                  notice.tone === "error"
                    ? "bg-danger-soft text-danger"
                    : "bg-action-soft text-action-strong",
                )}
              >
                <span className="flex-1">{notice.text}</span>
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  aria-label="Cerrar aviso"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </p>
            )}
            {(attachments.length > 0 || activeStyle) && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {activeStyle && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-action-soft px-2.5 py-1 text-xs font-medium text-action-strong">
                    <Palette className="size-3.5" aria-hidden /> Estilo:{" "}
                    {activeStyle.name}
                  </span>
                )}
                {attachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 py-0.5 pl-0.5 pr-2 text-xs"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- archivo privado servido por ruta autenticada */}
                    <img
                      src={assetSrc(a.id)}
                      alt=""
                      className="size-6 rounded-full object-cover"
                    />
                    {a.kind === "logo" ? "Logotipo" : "Referencia"}
                    <button
                      type="button"
                      onClick={() =>
                        setAttachments((l) => l.filter((x) => x.id !== a.id))
                      }
                      aria-label={`Quitar ${a.name}`}
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
              className="flex items-end gap-2"
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-label="Adjuntar fotos, logotipos o referencias"
                  disabled={uploading || attachments.length >= 6}
                  className="pressable grid size-11 place-items-center rounded-xl border border-line text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" aria-hidden />
                  ) : (
                    <Paperclip className="size-5" aria-hidden />
                  )}
                </button>
                {menuOpen && (
                  <div className="animate-rise surface-raised absolute bottom-12 left-0 z-20 w-60 rounded-2xl border border-line p-1.5 shadow-float">
                    {(
                      [
                        [
                          "image",
                          ImagePlus,
                          "Foto o referencia",
                          "Fotos del negocio o diseños que te gusten",
                        ],
                        [
                          "logo",
                          Stamp,
                          "Logotipo",
                          "Se guarda como logotipo oficial del negocio",
                        ],
                      ] as const
                    ).map(([k, Icon, t, d]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => {
                          kindRef.current = k;
                          setMenuOpen(false);
                          fileRef.current?.click();
                        }}
                        className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-surface-2"
                      >
                        <Icon
                          className="mt-0.5 size-4 text-action-strong"
                          aria-hidden
                        />
                        <span>
                          <span className="block text-sm font-medium">{t}</span>
                          <span className="block text-xs text-muted">{d}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Elegir imágenes para adjuntar"
                  onChange={(e) => {
                    const files = e.target.files;
                    void attach(files, kindRef.current).then(() => {
                      if (fileRef.current) fileRef.current.value = "";
                    });
                  }}
                />
              </div>
              <label className="flex-1">
                <span className="sr-only">Mensaje para el estudio</span>
                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={1}
                  maxLength={2000}
                  placeholder={`Pide algo para ${business.name}…`}
                  className="input max-h-40 py-2.5"
                  style={{ minHeight: 44, height: 44, resize: "none" }}
                />
              </label>
              <button
                type="submit"
                disabled={!text.trim() || Boolean(pending)}
                aria-label="Enviar"
                className="pressable grid size-11 place-items-center rounded-xl bg-action text-on-action shadow-raised hover:bg-action-strong disabled:opacity-50"
              >
                {pending ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <ArrowUp className="size-5" aria-hidden />
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Vista previa: al lado en escritorio, hoja inferior en el teléfono */}
      <aside
        aria-label="Vista previa y aprobación"
        className="surface-raised hidden min-h-0 overflow-y-auto rounded-3xl border border-line/70 p-4 lg:block"
      >
        {preview}
      </aside>
      {sheetOpen &&
        selectedId &&
        // En el body: la animación de entrada de <main> crea otro contexto de apilamiento.
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-[#0b1320]/50 lg:hidden"
            onClick={() => setSheetOpen(false)}
          >
            <div
              role="dialog"
              aria-label="Vista previa"
              className="animate-rise absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-float"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Cerrar vista previa"
                className="absolute right-3 top-3 grid size-10 place-items-center rounded-xl hover:bg-surface-2"
              >
                <X className="size-5" aria-hidden />
              </button>
              {preview}
            </div>
          </div>,
          document.body,
        )}
      {!sheetOpen && latestImage && (
        <button
          type="button"
          onClick={() => {
            setSelectedId(selectedId ?? latestImage.id);
            setSheetOpen(true);
          }}
          className="pressable fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-full bg-action px-4 text-sm font-semibold text-on-action shadow-float lg:hidden"
        >
          <BadgeCheck className="size-4" aria-hidden /> Revisar y aprobar
        </button>
      )}

      {reviewing &&
        (() => {
          const v = versions.find((x) => x.id === reviewing);
          if (!v?.asset_id) return null;
          return (
            <ReviewDialog
              versionId={v.id}
              assetId={v.asset_id}
              proposal={proposalOf(v.id)}
              readiness={props.readiness}
              prices={props.prices}
              publications={publications.filter(
                (p) => p.creative_version_id === v.id,
              )}
              onClose={() => setReviewing(null)}
              onDone={() => router.refresh()}
            />
          );
        })()}
    </div>
  );
}
