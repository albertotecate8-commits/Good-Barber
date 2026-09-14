# Vídeo en el CMS de Good Barber — auditoría y plan

Estado: **preparado, no implementado.** No hay columnas de vídeo en la base de
datos, ni reproductor en la web pública, ni conexión con HeyGen. Este documento
es la decisión de dónde irá cada cosa cuando se implemente, para no improvisar
el esquema el día que haga falta.

## 1. Cómo está construido el CMS hoy

El contenido público vive en tres sitios, y cada uno tiene una razón:

| Dónde | Cardinalidad | Qué guarda | Vista pública |
|---|---|---|---|
| `settings` | **una sola fila** | Contenido del negocio: `tagline`, `logo_url`, `hero_image_url`, `promo_text`, `promo_active`, contacto | `public_business` |
| `services` | una por servicio | `name`, `description`, `icon`, `price_cents`, `duration_minutes`, `image_url` | `public_services` |
| `barbers` | una por barbero | `name`, `bio`, `photo_url`, `sort_order` | `public_barbers` |

Los archivos van todos al bucket **`media`** de Supabase Storage: lectura
pública, escritura solo para `is_admin()`. El panel sube con `js/media.js` y
`js/image-field.js`; el cliente lee la URL desde la vista pública y la pinta.

El patrón ya establecido es **URL en una columna de la fila a la que pertenece
el contenido**. No hay tabla de medios, y no hace falta: cada activo tiene un
dueño natural.

## 2. Decisión: dónde irá el vídeo

**Seguir el mismo patrón.** Una tabla de medios genérica añadiría una junta y
un ciclo de vida que gestionar a cambio de nada: hoy ningún activo se comparte
entre dos filas.

| Caso de uso | Dónde | Columnas |
|---|---|---|
| Vídeo de bienvenida / del negocio / promocional | `settings` | `video_url`, `video_active`, `video_title`, `video_description` |
| Vídeo por servicio | `services` | `video_url` |
| Vídeo por barbero (presentación) | `barbers` | `video_url` |
| Vídeo de la promoción | `settings` | reutiliza `video_url` + `promo_active` |
| Variante vertical para móvil | `settings` | `video_url_vertical` |

`video_active` va separado de `video_url` a propósito: permite quitar el vídeo
de la web sin perder el que ya estaba subido, igual que `promo_active` hace con
`promo_text`.

## 3. Migración lista para cuando se decida

**No ejecutar todavía.** Es idempotente y no toca RLS: `settings` y `services`
ya restringen escritura a `is_admin()`, y el bucket `media` ya tiene sus
políticas.

```sql
-- Vídeo del negocio (una sola fila)
alter table public.settings add column if not exists video_url text;
alter table public.settings add column if not exists video_active boolean not null default false;
alter table public.settings add column if not exists video_title text;
alter table public.settings add column if not exists video_description text;
alter table public.settings add column if not exists video_url_vertical text;

-- Vídeo por servicio
alter table public.services add column if not exists video_url text;

-- Exponerlo al cliente. Las columnas nuevas van AL FINAL: nada de lo que la
-- web ya consume se desplaza.
create or replace view public.public_business as
  select business_name, tagline, logo_url, hero_image_url, address, phone, whatsapp,
         instagram, promo_text, promo_active, booking_enabled, slot_minutes,
         max_days_ahead, min_hours_notice, timezone, currency,
         video_url, video_active, video_title, video_description, video_url_vertical
  from public.settings
  where id;

create or replace view public.public_services as
  select id, name, description, icon, price_cents, duration_minutes, sort_order,
         image_url, video_url
  from public.services
  where active and public_visible
  order by sort_order;

grant select on public.public_business to anon, authenticated;
grant select on public.public_services to anon, authenticated;
```

## 4. Lo que ya está preparado en el código

`js/media.js` sube archivos por **perfil**, no con los tipos incrustados:

```js
export const PERFIL_IMAGEN = {
  tipos: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
  optimizar: true,
  etiqueta: "imagen",
  formatos: "JPG, PNG o WebP",
};

subirArchivo(file, carpeta, perfil)   // genérico
subirImagen(file, carpeta)            // atajo del perfil de imagen
```

Admitir MP4 será declarar un perfil y pasarlo — la subida, el nombre seguro, el
borrado del archivo anterior y el reemplazo ya son agnósticos del tipo:

```js
// Añadir a js/media.js cuando se implemente:
export const PERFIL_VIDEO = {
  tipos: ["video/mp4", "video/webm"],
  maxBytes: 50 * 1024 * 1024,
  optimizar: false,          // no se reescala vídeo en el navegador
  etiqueta: "vídeo",
  formatos: "MP4 o WebM",
};
// y en EXTENSIONES: "video/mp4": "mp4", "video/webm": "webm"
```

`js/image-field.js` (selector, previsualización, reemplazo, quitar) es
independiente del tipo salvo por la etiqueta `<img>` de la previsualización:
para vídeo hay que pintar un `<video muted playsinline>` en su lugar. Es el
único punto de la interfaz que hay que tocar.

## 5. URLs externas y HeyGen

`subirArchivo` no es obligatorio: las columnas guardan una **URL**, así que un
vídeo alojado fuera (HeyGen, Mux, Cloudflare Stream, un CDN) se pega tal cual
en `video_url` y funciona igual. Es lo recomendable para vídeo: Storage cobra
transferencia y no da streaming adaptativo.

Cuando llegue el momento, el panel debería ofrecer las dos vías en el mismo
campo: subir un archivo al bucket, o pegar una URL.

## 6. Qué falta para implementarlo

1. Ejecutar la migración de la sección 3.
2. Añadir `PERFIL_VIDEO` y sus extensiones a `js/media.js`.
3. Que `image-field.js` pinte `<video>` cuando el activo sea vídeo.
4. Una pestaña **Vídeo** en Configuración, con el mismo patrón que Imágenes.
5. En el cliente, decidir **dónde** se ve y con qué diseño — eso es una
   decisión de producto, no técnica, y toca la portada aprobada.

El punto 5 es el único que requiere aprobación de diseño. Los cuatro primeros
son mecánicos.
