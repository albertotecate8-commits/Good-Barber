// Plan de video y armado del comando de FFmpeg. Esto MONTA material existente
// (fotos y clips de la biblioteca): no genera video con IA. Las escenas que
// todavía no tienen material quedan como «pendiente» con su prompt para Flow.
import { z } from "zod";

export const MUSIC_LICENSES = ["none", "own", "licensed", "royalty_free"] as const;
export const MUSIC_LICENSE_LABELS: Record<(typeof MUSIC_LICENSES)[number], string> = {
  none: "Sin música",
  own: "Música propia (yo tengo los derechos)",
  licensed: "Música con licencia comprada o cedida",
  royalty_free: "Música libre de regalías (biblioteca con licencia que lo permite)",
};

export const sceneSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  asset_id: z.string().uuid().nullable().default(null),
  duration: z.number().min(1).max(15).default(3),
  on_screen_text: z.string().max(120).default(""),
  voiceover: z.string().max(400).default(""),
  notes: z.string().max(400).default(""),
  flow_prompt: z.string().max(1500).default(""),
});
export type Scene = z.infer<typeof sceneSchema>;

export const videoPlanSchema = z
  .object({
    scenes: z.array(sceneSchema).max(15).default([]),
    cta_text: z.string().max(80).default(""),
    end_card_seconds: z.number().min(0).max(5).default(2),
    background_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#0B0B0D"),
    fade: z.boolean().default(true),
    music: z
      .object({
        asset_id: z.string().uuid().nullable().default(null),
        license: z.enum(MUSIC_LICENSES).default("none"),
        license_detail: z.string().max(500).default(""),
      })
      .default({ asset_id: null, license: "none", license_detail: "" }),
  })
  .superRefine((p, ctx) => {
    if (p.music.asset_id && p.music.license === "none")
      ctx.addIssue({ code: "custom", path: ["music", "license"], message: "Indica la licencia de la música." });
    if (p.music.asset_id && p.music.license !== "own" && p.music.license_detail.trim().length < 5)
      ctx.addIssue({ code: "custom", path: ["music", "license_detail"], message: "Indica de dónde viene la licencia (enlace o descripción)." });
  });
export type VideoPlan = z.infer<typeof videoPlanSchema>;

export const MAX_VIDEO_SECONDS = 90;

export function totalSeconds(plan: VideoPlan) {
  return plan.scenes.reduce((a, s) => a + s.duration, 0) + (plan.cta_text ? plan.end_card_seconds : 0);
}

/** Por qué no se puede montar todavía (null si se puede). */
export function renderBlocker(plan: VideoPlan): string | null {
  if (!plan.scenes.length) return "Agrega al menos una escena.";
  const missing = plan.scenes.filter((s) => !s.asset_id).length;
  if (missing) return `${missing} escena(s) sin material: sube la foto o el clip (grabado o generado en Flow) y asígnalo.`;
  if (totalSeconds(plan) > MAX_VIDEO_SECONDS) return `El video dura más de ${MAX_VIDEO_SECONDS} s.`;
  return null;
}

/** Divide el texto en líneas para drawtext (aproximación por caracteres). */
export function wrapForVideo(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line ? line.length + 1 : 0) + w.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join("\n");
}

export interface RenderInput {
  path: string;
  kind: "image" | "video";
  duration: number;
  textFile: string | null;
}

/** Ruta segura dentro de un filtro de FFmpeg. */
const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

/**
 * Argumentos de FFmpeg (sin shell): escala/recorta cada escena al formato,
 * pone el texto en pantalla dentro de la zona segura, une todo y agrega la
 * música (o silencio) recortada a la duración total.
 */
export function buildFfmpegArgs(opts: {
  inputs: RenderInput[];
  endCard: { seconds: number; textFile: string } | null;
  music: string | null;
  width: number;
  height: number;
  safeBottom: number;
  background: string;
  fade: boolean;
  font: string | null;
  output: string;
}): string[] {
  const { width: W, height: H } = opts;
  const args: string[] = ["-y", "-hide_banner", "-loglevel", "error"];
  for (const inp of opts.inputs) {
    if (inp.kind === "image") args.push("-loop", "1", "-t", String(inp.duration), "-i", inp.path);
    else args.push("-t", String(inp.duration), "-i", inp.path);
  }
  const total = opts.inputs.reduce((a, i) => a + i.duration, 0) + (opts.endCard?.seconds ?? 0);
  let idx = opts.inputs.length;
  if (opts.endCard) {
    args.push("-f", "lavfi", "-t", String(opts.endCard.seconds), "-i", `color=c=${opts.background.replace("#", "0x")}:s=${W}x${H}:r=30`);
    idx++;
  }
  const audioIdx = idx;
  if (opts.music) args.push("-stream_loop", "-1", "-i", opts.music);
  else args.push("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo");

  const fontSize = Math.round(W * 0.055);
  const textY = `h-${opts.safeBottom}-text_h-${Math.round(H * 0.04)}`;
  const draw = (textFile: string, y: string, size: number) =>
    opts.font
      ? `,drawtext=fontfile='${esc(opts.font)}':textfile='${esc(textFile)}':fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.25)}:box=1:boxcolor=black@0.5:boxborderw=${Math.round(size * 0.45)}:x=(w-text_w)/2:y=${y}`
      : "";

  const filters: string[] = [];
  const labels: string[] = [];
  opts.inputs.forEach((inp, i) => {
    const d = inp.duration;
    const fade = opts.fade && d > 1 ? `,fade=t=in:st=0:d=0.3,fade=t=out:st=${(d - 0.3).toFixed(2)}:d=0.3` : "";
    filters.push(
      `[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p,trim=duration=${d},setpts=PTS-STARTPTS${inp.textFile ? draw(inp.textFile, textY, fontSize) : ""}${fade}[v${i}]`,
    );
    labels.push(`[v${i}]`);
  });
  if (opts.endCard) {
    const i = opts.inputs.length;
    filters.push(`[${i}:v]format=yuv420p,setsar=1${draw(opts.endCard.textFile, "(h-text_h)/2", Math.round(fontSize * 1.2))}[v${i}]`);
    labels.push(`[v${i}]`);
  }
  filters.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0[vout]`);
  filters.push(`[${audioIdx}:a]atrim=duration=${total},asetpts=PTS-STARTPTS${opts.music ? `,afade=t=out:st=${Math.max(0, total - 1)}:d=1` : ""}[aout]`);

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", "[vout]", "-map", "[aout]",
    "-t", String(total),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    opts.output,
  );
  return args;
}

/** Texto del comando para copiar y ejecutarlo en tu computadora. */
export function commandText(args: string[]) {
  return ["ffmpeg", ...args.map((a) => (/^[\w./:=+-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`))].join(" ");
}
