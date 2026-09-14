// Subida de imágenes públicas al bucket `media` que ya existe en Supabase.
//
// Seguridad: no se crea ninguna política nueva. El bucket ya tiene lectura
// pública y escritura restringida a administradores (media_admin_insert /
// _update / _delete, todas con is_admin()). Si un barbero o un anónimo
// intentara subir algo, Storage lo rechaza en el servidor — esto de aquí
// solo evita enseñarle un botón que no va a funcionar.

function sb() {
  return window.supabaseClient;
}

const BUCKET = "media";

// Perfil de subida: qué acepta, cuánto pesa como máximo y si se reescala.
// Está parametrizado —y no incrustado en cada función— para que admitir otro
// tipo de archivo público (por ejemplo un MP4) sea declarar un perfil, sin
// tocar la subida, el borrado ni el componente de interfaz.
// Hoy solo se usa el de imagen: es el único que tiene interfaz.
export const PERFIL_IMAGEN = {
  tipos: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024, // 5 MB
  optimizar: true,
  etiqueta: "imagen",
  formatos: "JPG, PNG o WebP",
};

// Compatibilidad con lo que ya importa este módulo.
export const TIPOS_ACEPTADOS = PERFIL_IMAGEN.tipos;
export const MAX_BYTES = PERFIL_IMAGEN.maxBytes;
// Por encima de este ancho la imagen se reescala antes de subir: una foto de
// 4000px no aporta nada en una tarjeta de 400px y multiplica la descarga.
const ANCHO_MAX = 1600;
const CALIDAD = 0.85;

export function validarArchivo(file, perfil = PERFIL_IMAGEN) {
  const max = (perfil.maxBytes / 1024 / 1024).toFixed(0);
  if (!file) return `Elige una ${perfil.etiqueta}.`;
  if (!perfil.tipos.includes(file.type)) return `Formato no admitido. Usa ${perfil.formatos}.`;
  if (file.size > perfil.maxBytes) {
    return `La ${perfil.etiqueta} pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. El máximo son ${max} MB.`;
  }
  return null;
}

export function validarImagen(file) {
  return validarArchivo(file, PERFIL_IMAGEN);
}

// Nombre de archivo seguro: nunca se usa el que trae el usuario. Se compone
// carpeta/marca-de-tiempo-aleatorio.ext, así que no hay forma de escaparse de
// la carpeta ni de colisionar con otro archivo.
const EXTENSIONES = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
};

function nombreSeguro(carpeta, tipo) {
  const ext = EXTENSIONES[tipo] || "bin";
  const azar = Math.random().toString(36).slice(2, 10);
  return `${carpeta}/${Date.now()}-${azar}.${ext}`;
}

// Reescala en el navegador si hace falta. Si algo falla (canvas bloqueado,
// imagen corrupta), se sube el archivo original: es preferible una imagen
// grande a ninguna.
async function optimizar(file) {
  if (file.type === "image/webp" && file.size < 400 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (bitmap.width <= ANCHO_MAX) { bitmap.close?.(); return file; }
    const escala = ANCHO_MAX / bitmap.width;
    const lienzo = document.createElement("canvas");
    lienzo.width = ANCHO_MAX;
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close?.();
    const blob = await new Promise((r) => lienzo.toBlob(r, "image/jpeg", CALIDAD));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

// Sube y devuelve la URL pública. `carpeta` agrupa por tipo de contenido
// (logo, hero, barberos, servicios) para que el bucket siga siendo legible.
export async function subirArchivo(file, carpeta, perfil = PERFIL_IMAGEN) {
  const problema = validarArchivo(file, perfil);
  if (problema) throw new Error(problema);
  const cuerpo = perfil.optimizar ? await optimizar(file) : file;
  const ruta = nombreSeguro(carpeta, cuerpo.type || file.type);
  const { error } = await sb().storage.from(BUCKET).upload(ruta, cuerpo, {
    contentType: cuerpo.type || file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = sb().storage.from(BUCKET).getPublicUrl(ruta);
  return data.publicUrl;
}

export async function subirImagen(file, carpeta) {
  return subirArchivo(file, carpeta, PERFIL_IMAGEN);
}

// De una URL pública a la ruta dentro del bucket. Devuelve null si la URL no
// pertenece a este bucket — así nunca se intenta borrar algo ajeno.
export function rutaDesdeUrl(url) {
  if (typeof url !== "string") return null;
  const marca = `/storage/v1/object/public/${BUCKET}/`;
  const i = url.indexOf(marca);
  if (i === -1) return null;
  const ruta = url.slice(i + marca.length).split("?")[0];
  return ruta ? decodeURIComponent(ruta) : null;
}

// Borra el archivo anterior al reemplazar, para no dejar huérfanos. Sirve
// para cualquier archivo del bucket, no solo imágenes.
// Nunca lanza: si el borrado falla, el cambio de imagen ya está hecho y el
// archivo suelto es un problema menor que perder la operación.
export async function borrarImagen(url) {
  const ruta = rutaDesdeUrl(url);
  if (!ruta) return false;
  try {
    const { error } = await sb().storage.from(BUCKET).remove([ruta]);
    return !error;
  } catch {
    return false;
  }
}

// Reemplazo atómico desde el punto de vista del usuario: primero sube la
// nueva, y solo si eso funciona borra la anterior. Si la subida falla, la
// imagen que ya estaba publicada sigue intacta.
export async function reemplazarImagen(file, carpeta, urlAnterior) {
  const nueva = await subirImagen(file, carpeta);
  if (urlAnterior && urlAnterior !== nueva) await borrarImagen(urlAnterior);
  return nueva;
}
