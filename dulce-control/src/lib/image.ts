/** Reduce la foto del ticket (las de celular pesan 3–8 MB) a un JPEG legible. */
export async function compressImage(file: File, maxSide = 1800, quality = 0.82): Promise<{ blob: Blob; base64: string; url: string }> {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w = "width" in bitmap ? bitmap.width : 0;
  const h = "height" in bitmap ? bitmap.height : 0;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo procesar la imagen"))), "image/jpeg", quality));
  const base64 = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.readAsDataURL(blob);
  });
  return { blob, base64, url: URL.createObjectURL(blob) };
}
