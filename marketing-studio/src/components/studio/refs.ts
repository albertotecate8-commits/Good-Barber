"use client";

import type { ReferenceRole } from "@/lib/studio/propose";
import { assetSrc } from "./types";

/** Reduce una imagen de la Biblioteca a < 512 px (lo que acepta FLUX.2 como referencia). */
export async function downscaledReference(assetId: string, maxSide = 511): Promise<Blob> {
  const res = await fetch(assetSrc(assetId));
  if (!res.ok) throw new Error("No se pudo leer la referencia.");
  const bmp = await createImageBitmap(await res.blob());
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(bmp.width * scale));
  canvas.height = Math.max(1, Math.floor(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.86));
  if (!blob) throw new Error("No se pudo preparar la referencia.");
  return blob;
}

/** Archivo de la Biblioteca listo para compartir o adjuntar (logotipo, referencias). */
export async function libraryFile(assetId: string, name: string): Promise<File> {
  const res = await fetch(assetSrc(assetId));
  if (!res.ok) throw new Error("No se pudo leer el archivo.");
  const blob = await res.blob();
  const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/svg+xml" ? "svg" : "jpg";
  return new File([blob], `${name}.${ext}`, { type: blob.type });
}

export interface PlannedReference {
  role: ReferenceRole;
  assetId: string;
  label: string;
}

export async function buildReferenceForm(refs: PlannedReference[], base: Record<string, string>): Promise<FormData> {
  const form = new FormData();
  for (const [k, v] of Object.entries(base)) form.append(k, v);
  form.append("refs", JSON.stringify(refs.map((r) => ({ role: r.role, assetId: r.assetId }))));
  const blobs = await Promise.all(refs.map((r) => downscaledReference(r.assetId)));
  blobs.forEach((b, i) => form.append(`ref_${i}`, b, `ref-${i}.jpg`));
  return form;
}
