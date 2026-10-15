import "server-only";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

// Almacenamiento en disco SOLO para desarrollo. Las rutas se validan para que
// nunca salgan de la carpeta raíz. Los comentarios turbopackIgnore evitan que
// el empaquetador incluya todo el proyecto en el servidor por estas rutas
// dinámicas (este módulo no se usa en producción).

export function localRoot(): string {
  return path.resolve(/*turbopackIgnore: true*/ process.env.MKT_LOCAL_STORAGE_DIR ?? path.join(process.cwd(), ".local-storage"));
}

export function resolveLocal(storagePath: string): string {
  const root = localRoot();
  const full = path.resolve(/*turbopackIgnore: true*/ root, storagePath);
  if (!full.startsWith(root + path.sep)) throw new Error("Ruta de archivo no permitida.");
  return full;
}

export async function removeLocal(storagePath: string) {
  await fsp.rm(/*turbopackIgnore: true*/ resolveLocal(storagePath), { force: true });
}

export async function statLocal(storagePath: string) {
  try {
    return await fsp.stat(/*turbopackIgnore: true*/ resolveLocal(storagePath));
  } catch {
    return null;
  }
}

export function openLocalStream(storagePath: string) {
  return fs.createReadStream(/*turbopackIgnore: true*/ resolveLocal(storagePath));
}

/**
 * Escribe el flujo en un archivo temporal sin rebasar maxBytes y lo mueve a su
 * ruta final solo si todo salió bien. Devuelve tamaño y primeros bytes.
 */
export async function writeLocalStream(
  storagePath: string,
  body: ReadableStream<Uint8Array>,
  maxBytes: number,
): Promise<{ size: number; head: Uint8Array }> {
  const finalPath = resolveLocal(storagePath);
  await fsp.mkdir(/*turbopackIgnore: true*/ path.dirname(finalPath), { recursive: true });
  const tmp = `${finalPath}.${process.pid}.${Date.now()}.part`;
  const handle = await fsp.open(/*turbopackIgnore: true*/ tmp, "wx");
  let size = 0;
  const head = new Uint8Array(64);
  let headLen = 0;
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("El archivo supera el tamaño máximo permitido.");
      }
      if (headLen < head.length) {
        const n = Math.min(head.length - headLen, value.byteLength);
        head.set(value.subarray(0, n), headLen);
        headLen += n;
      }
      await handle.write(value);
    }
    await handle.close();
    await fsp.rename(/*turbopackIgnore: true*/ tmp, finalPath);
    return { size, head: head.slice(0, headLen) };
  } catch (e) {
    await handle.close().catch(() => {});
    await fsp.rm(/*turbopackIgnore: true*/ tmp, { force: true });
    throw e;
  }
}
