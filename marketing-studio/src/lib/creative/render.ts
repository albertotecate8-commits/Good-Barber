import "server-only";
// Las rutas temporales son dinámicas: turbopackIgnore evita que el empaquetador
// incluya todo el proyecto en el servidor por ellas.
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverlessHost } from "@/lib/hosting";
import { readAssetBytes, storeGeneratedAsset } from "@/lib/storage/server-store";
import { buildFfmpegArgs, renderBlocker, totalSeconds, wrapForVideo, type VideoPlan } from "./video";
import type { CreativeFormat } from "./formats";

const run = promisify(execFile);

export interface FfmpegStatus {
  available: boolean;
  reason: string | null;
  bin: string;
  font: string | null;
}

const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "C:/Windows/Fonts/arialbd.ttf",
];

let cached: FfmpegStatus | null = null;

/** FFmpeg es software libre local. En hostings sin servidor no existe: se informa y se ofrece el comando. */
export async function ffmpegStatus(): Promise<FfmpegStatus> {
  if (cached) return cached;
  const bin = process.env.MKT_FFMPEG_PATH || "ffmpeg";
  const font = [process.env.MKT_VIDEO_FONT, ...FONT_CANDIDATES].find((f): f is string => Boolean(f && fs.existsSync(/*turbopackIgnore: true*/ f))) ?? null;
  const host = serverlessHost();
  if (host) {
    cached = { available: false, reason: `El plan gratuito de ${host} no incluye FFmpeg. Copia el comando y móntalo en tu computadora.`, bin, font };
    return cached;
  }
  try {
    await run(bin, ["-version"], { timeout: 5000 });
    cached = { available: true, reason: null, bin, font };
  } catch {
    cached = { available: false, reason: "FFmpeg no está instalado en este servidor (o MKT_FFMPEG_PATH es incorrecto).", bin, font };
  }
  return cached;
}

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/avif": ".avif",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
  "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/ogg": ".ogg",
};

export type RenderResult =
  | { ok: true; assetId: string; seconds: number; probe: string; command: string[] }
  | { ok: false; message: string };

export async function renderVideo(
  supabase: SupabaseClient,
  project: { id: string; business_id: string; title: string },
  plan: VideoPlan,
  format: CreativeFormat,
): Promise<RenderResult> {
  const status = await ffmpegStatus();
  if (!status.available) return { ok: false, message: status.reason ?? "FFmpeg no disponible." };
  const blocker = renderBlocker(plan);
  if (blocker) return { ok: false, message: blocker };

  // Solo archivos del mismo negocio, leídos con la sesión del usuario (RLS).
  const ids = [...new Set([...plan.scenes.map((s) => s.asset_id!), ...(plan.music.asset_id ? [plan.music.asset_id] : [])])];
  const { data: assets, error } = await supabase
    .from("mkt_assets")
    .select("id,business_id,kind,mime_type,storage_backend,storage_path,upload_status")
    .in("id", ids);
  if (error) return { ok: false, message: error.message };
  const byId = new Map((assets ?? []).map((a) => [a.id as string, a]));
  for (const id of ids) {
    const a = byId.get(id);
    if (!a || a.business_id !== project.business_id || a.upload_status !== "ready") return { ok: false, message: "Un archivo del video no existe o es de otro negocio." };
  }
  for (const s of plan.scenes) {
    const a = byId.get(s.asset_id!)!;
    if (!a.mime_type.startsWith("image/") && !a.mime_type.startsWith("video/")) return { ok: false, message: "Cada escena debe usar una imagen o un video." };
    if (a.mime_type === "image/svg+xml") return { ok: false, message: "Las escenas no pueden usar SVG; usa PNG o JPG." };
  }
  if (plan.music.asset_id && !byId.get(plan.music.asset_id)!.mime_type.startsWith("audio/")) return { ok: false, message: "La música debe ser un archivo de audio." };

  const dir = await fsp.mkdtemp(path.join(/*turbopackIgnore: true*/ os.tmpdir(), "mkt-video-"));
  try {
    const files = new Map<string, string>();
    for (const id of ids) {
      const a = byId.get(id)!;
      const file = path.join(/*turbopackIgnore: true*/ dir, `${files.size}${EXT[a.mime_type] ?? ""}`);
      await fsp.writeFile(file, await readAssetBytes(supabase, a));
      files.set(id, file);
    }
    const maxChars = Math.max(10, Math.floor((format.width * 0.8) / (format.width * 0.055 * 0.58)));
    const inputs = await Promise.all(
      plan.scenes.map(async (s, i) => {
        let textFile: string | null = null;
        if (s.on_screen_text.trim() && status.font) {
          textFile = path.join(/*turbopackIgnore: true*/ dir, `t${i}.txt`);
          await fsp.writeFile(textFile, wrapForVideo(s.on_screen_text, maxChars));
        }
        const a = byId.get(s.asset_id!)!;
        return { path: files.get(s.asset_id!)!, kind: a.mime_type.startsWith("video/") ? ("video" as const) : ("image" as const), duration: s.duration, textFile };
      }),
    );
    let endCard: { seconds: number; textFile: string } | null = null;
    if (plan.cta_text.trim() && plan.end_card_seconds > 0) {
      const f = path.join(/*turbopackIgnore: true*/ dir, "cta.txt");
      await fsp.writeFile(f, wrapForVideo(plan.cta_text, maxChars));
      endCard = { seconds: plan.end_card_seconds, textFile: f };
    }
    const output = path.join(/*turbopackIgnore: true*/ dir, "salida.mp4");
    const args = buildFfmpegArgs({
      inputs,
      endCard,
      music: plan.music.asset_id ? files.get(plan.music.asset_id)! : null,
      width: format.width,
      height: format.height,
      safeBottom: format.safe.bottom,
      background: plan.background_color,
      fade: plan.fade,
      font: status.font,
      output,
    });
    try {
      await run(status.bin, args, { timeout: 240_000, maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
      const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message).split("\n").filter(Boolean).slice(-2).join(" ");
      return { ok: false, message: `FFmpeg no pudo montar el video: ${msg.slice(0, 300)}` };
    }
    let probe = "";
    try {
      const { stdout } = await run(status.bin.replace(/ffmpeg(\.exe)?$/, "ffprobe$1"), ["-v", "error", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "compact=p=0:nk=1", output], { timeout: 15000 });
      probe = stdout.trim().replace(/\n/g, " · ");
    } catch {
      probe = "";
    }
    const data = await fsp.readFile(/*turbopackIgnore: true*/ output);
    const stored = await storeGeneratedAsset(supabase, {
      businessId: project.business_id,
      data,
      mime: "video/mp4",
      fileName: `${project.title}.mp4`,
      kind: "video",
      origin: "code_edited",
      title: `${project.title} — montaje`,
      description: "Montado con FFmpeg a partir de material de la biblioteca (no generado con IA).",
      tags: ["estudio", "montaje"],
    });
    if (!stored.ok) return stored;
    return { ok: true, assetId: stored.id, seconds: totalSeconds(plan), probe, command: args };
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}
