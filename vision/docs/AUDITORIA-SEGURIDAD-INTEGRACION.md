# Auditoría de seguridad e integración — previa a la Etapa 2

Fecha: 27 de noviembre de 2026 · Alcance: Smart Business Vision (`vision/`),
app de Good Barber (raíz), Finanzas (`finanzas/`), cámaras, conectividad y
motor de visión.

**Restricciones respetadas en esta auditoría:** no se modificó ninguna app
existente, no se conectó nada a Supabase real, no se desplegó, no se crearon
recursos en la nube y no se activó ningún pago.

---

## 0. Resumen ejecutivo

| Tema | Resultado | Bloquea Etapa 2 |
|---|---|---|
| `vision` dentro del proyecto Supabase de Good Barber | **No modifica** esquema, datos, permisos ni Edge Functions de Good Barber (probado en PostgreSQL local con el esquema real del repo). Se revierte al 100 %. | No, pero requiere tu autorización |
| Defecto encontrado en `vision` | Impedía **borrar en Auth** la cuenta del único propietario (que sería el admin de Good Barber). **Corregido** en la migración (nunca aplicada) y cubierto por pruebas. | Resuelto |
| Efecto cruzado real | Toda cuenta **nueva** creada en ese proyecto recibe automáticamente un perfil «barbero» en Good Barber (por un trigger existente de Good Barber). | Se evita usando solo la cuenta de admin actual |
| Clave del motor (`service_role`) | En un proyecto compartido daría al servidor de Oracle acceso total a **clientes y citas** de Good Barber. Se propone un rol de base de datos mínimo. | Sí: decisión de diseño |
| Respaldo | El respaldo diario actual **no incluye** `vision`. Se probó el procedimiento de restauración correcto. | No |
| Zona horaria | Durango → `America/Mexico_City` (UTC−6). Corregido en la documentación. | No |
| Motor de visión | Candidatos con licencia permisiva y soporte ARM64 verificado: **YOLOX / NanoDet-Plus / PP-PicoDet + ONNX Runtime o ncnn + ByteTrack (supervision)**. Ultralytics YOLO es AGPL-3.0. | No; falta elegir |
| Oracle Always Free | Hay reportes (no confirmados por Oracle) de que en 2026 el cupo ARM gratuito bajó de 4 OCPU/24 GB a **2 OCPU/12 GB**. Se planifica para el caso peor. | Pendiente de verificar al dar de alta |
| Conectividad Izzi → Oracle | **No se puede determinar desde aquí.** Sin equipo en el local, solo es posible si hay IP pública (sin CGNAT) y reenvío de puertos. Aun así, el RTSP viajaría **sin cifrar** y en 2026 se publicaron fallas en el servicio RTSP de la C100. Ver §5. | **Sí: riesgo principal** |

---

## 1. Integración con Supabase de Good Barber

### 1.1 Qué se auditó (solo lectura)

| Componente | Archivos | Cómo usa la base |
|---|---|---|
| App de administración | `js/*.js`, `supabase-config.js` | Cliente `supabase-js` con esquema por defecto `public`; ninguna llamada a `.schema()` |
| Web pública y reservas | `cliente/`, `reservar/` | Vistas `public_*` y RPC `book_appointment`, `public_available_slots` (rol `anon`) |
| Esquema | `supabase/schema.sql` + 8 migraciones en `supabase/migrations/` | Todo en `public`; trigger `on_auth_user_created` en `auth.users`; políticas en `storage.objects` (bucket `media`) |
| Edge Functions | `admin-create-barber`, `bootstrap-admin`, `send-appointment-push` | Solo tablas de `public` con `service_role`; `deleteUser` en caso de error |
| Respaldo | `.github/workflows/backup-database.yml`, `BACKUP.md` | `pg_dump --schema=public --no-owner --no-privileges` cifrado |
| Finanzas | `finanzas/` | **Otro proyecto Supabase** (`mwskrwkkiuifedatuvca`). `vision` no tiene ningún punto de contacto con él |

### 1.2 Prueba de no interferencia (PostgreSQL local)

Script reproducible: `vision/supabase/tests/integracion/run.sh`. Carga el
esquema **real** de Good Barber del repositorio (sin modificarlo), crea datos
de prueba (admin, barbero, cliente, servicio) y compara instantáneas:
volcado completo de `public` (estructura + datos + funciones + políticas +
triggers), volcado de `auth` y `storage`, y una «sonda» que cuenta lo que ven
`anon`, el barbero y el admin en cada tabla y vista de `public`.

| Paso | Resultado |
|---|---|
| Aplicar las migraciones de `vision` | `public` **idéntico** · visibilidad de anon/barbero/admin **idéntica** · `auth` y `storage` **idénticos** · sin triggers nuevos de usuario en `auth.users` |
| Dar acceso a `vision` a la cuenta existente del admin | `public` **idéntico**; el barbero ve 0 datos de `vision`; el admin sigue viendo sus clientes |
| Borrar en Auth la cuenta propietaria de `vision` | **Fallaba** (defecto) → corregido → ahora funciona y la membresía se borra en cascada |
| `DROP SCHEMA vision CASCADE` | `public`, visibilidad, FK y triggers internos de `auth.users` vuelven **exactamente** al estado original |
| Respaldo/restauración | Ver §2 |

Único cambio técnico fuera de `vision` (esperado y reversible): 3 llaves
foráneas de tablas de `vision` hacia `auth.users` (`members.user_id`,
`security_events.reviewed_by`, `service_logs.created_by`), que PostgreSQL
implementa con triggers internos (2 → 8). No cambian el comportamiento de
Auth salvo que, al borrar una cuenta, también se borra/limpia su fila en
`vision`.

### 1.3 Hallazgos

**H1 — Defecto (corregido): `vision` podía bloquear el borrado de cuentas.**
El trigger `vision.protect_last_owner` impedía quitar al último propietario
también cuando el borrado venía en cascada desde `auth.users`. En el proyecto
compartido, eso habría hecho fallar el borrado de la cuenta de admin desde el
panel de Supabase. Corrección en
`supabase/migrations/20261127120000_vision_etapa1_base.sql`: los borrados en
cascada (`pg_trigger_depth() > 1`) no se bloquean. Nuevas pruebas en
`10_rls_tests.sql` y en el script de integración.

**H2 — Efecto cruzado (existente en Good Barber, no en `vision`).**
`public.handle_new_auth_user()` crea un perfil `barber` activo para **cada**
cuenta nueva de Auth. Si se crea una cuenta solo para `vision` en ese
proyecto, ese usuario podría entrar a la app de Good Barber y ver (probado):
catálogo de servicios, `settings` (nombre, dirección, teléfono, % de reparto
por defecto), cortes destacados, carrusel y su propio perfil. **No** ve
clientes, citas, registros de servicio ni cortes semanales.
*Mitigación propuesta:* en esta fase, usar `vision` **solo con la cuenta de
administrador que ya existe** (probado: cero cambios). Si más adelante hace
falta otra cuenta, decidir entre desactivar su perfil en Good Barber
(`profiles.active = false`, cambia un dato de Good Barber → requiere tu
autorización) o un proyecto separado.

**H3 — Riesgo de diseño: la `service_role` del motor.**
La `service_role` se salta todo el RLS del proyecto. Si el motor de visión
(Oracle) la usara en el proyecto compartido y ese servidor se viera
comprometido, quedarían expuestos los **clientes, teléfonos y citas** de Good
Barber. *Propuesta:* un rol de PostgreSQL exclusivo, p. ej. `vision_engine`,
con permisos solo de escritura en las tablas de resultados de `vision`, y
conexión directa por el pooler de Supabase. La contraseña la definirías tú en
el SQL Editor; nunca en el repositorio. (No implementado: requiere tu
autorización y se diseñará en la Etapa 2.)

**H4 — Configuración compartida de Auth.**
Agregar la URL de la app a *Redirect URLs* no afecta a Good Barber, pero las
plantillas de correo y el límite de envío de correos del proyecto se
comparten: los correos de recuperación saldrían con la plantilla de Good
Barber y consumirían el mismo cupo de envío.

**H5 — Cupos compartidos del plan gratuito.**
500 MB de base por proyecto. Estimación de `vision` (no medida): ~3 MB/año de
métricas por hora de 2 cámaras, ~10 MB/año de ocupación con ~6 estaciones y
~30–40 MB/año de eventos de cruce si hubiera ~200 cruces diarios por negocio.
Antes de aplicar hay que revisar el tamaño actual de la base de Good Barber
(Dashboard → Database → tamaño) y fijar una retención para `vision_events`.

**H6 — Proyecto separado no es $0.**
Supabase permite 2 proyectos gratuitos **activos** sumando todas las
organizaciones donde eres propietario o admin; ya existen Good Barber y
Finanzas. Un tercero exigiría pausar uno o pagar.

**H7 — Revisión propia de la app `vision`.**
Sin `innerHTML`/`dangerouslySetInnerHTML` ni `eval`; la sesión vive en el
almacenamiento del navegador (normal en `supabase-js`), por lo que una CSP
estricta es importante. La CSP necesita `'unsafe-inline'` en scripts por la
exportación estática de Next.js. Mejora menor propuesta: `list_members`
muestra los correos de los miembros también al rol «solo lectura»; puede
limitarse a propietario/administrador.

### 1.4 Edge Functions y Finanzas

- `admin-create-barber` / `bootstrap-admin`: solo `public.profiles`,
  `public.barbers` y la RPC `promote_first_admin`; no leen esquemas ajenos. El
  borrado de cuentas en caso de error ya no puede ser bloqueado por `vision`.
- `send-appointment-push`: lee `notification_queue`, `push_subscriptions`,
  `profiles` (admins activos), `settings` y `barbers`. Una cuenta de `vision`
  no tiene suscripciones push ni es admin → sin efecto.
- `finanzas/supabase/functions/anotar`: otro proyecto → sin relación.
- Reservas públicas (`anon`): su visibilidad y todas las funciones de
  `public` quedaron idénticas (volcado de `public` sin diferencias).

---

## 2. Respaldo y recuperación

| Comprobación (PostgreSQL local) | Resultado |
|---|---|
| ¿El workflow actual (`--schema=public`) respalda `vision`? | **No.** Hoy los datos de `vision` no quedarían respaldados |
| ¿Respaldar `vision` cambia el respaldo de Good Barber? | No: son volcados independientes |
| Restauración en un proyecto donde existen las cuentas de Auth: migración **base** de `vision` (sin datos iniciales) + datos del respaldo | Negocios, estaciones, miembros y horarios = **2/1/1/7**, igual al original; RLS y permisos funcionan; `anon` sigue sin acceso |

Lecciones para el procedimiento:

1. **Orden correcto:** primero `…_vision_etapa1_base.sql`, después un respaldo
   **solo de datos** de `vision`. No ejecutar la migración de datos iniciales
   antes de restaurar (crearía un segundo establecimiento).
2. El workflow usa `--no-privileges`: los permisos no viajan en el respaldo;
   la migración base los vuelve a crear (comprobado).
3. Igual que Good Barber (`BACKUP.md`, caso B): si se pierde el proyecto
   completo, las cuentas de Auth cambian de id y `vision.members` debe
   volver a enlazarse por correo.
4. **Propuesta (requiere autorización, modifica un archivo existente):** un
   paso adicional en `backup-database.yml` que genere un **segundo artifact**
   cifrado con `pg_dump --schema=vision --data-only`. Así el respaldo actual
   de Good Barber no cambia en nada.
5. Antes de aplicar `vision` en producción: ejecutar manualmente el respaldo
   («Run workflow») y comprobar que el archivo se puede descifrar.

---

## 3. Zona horaria

Durango, México → `America/Mexico_City` (UTC−6 todo el año desde la
eliminación del horario de verano en 2022). Ya era el valor por defecto en la
migración y en la app; se corrigió la nota equivocada de `PENDIENTES.md`.

---

## 4. Motor de visión: comparación técnica

### 4.1 Licencias (verificadas en los metadatos de PyPI cuando se indica)

| Opción | Licencia del código | Pesos preentrenados | ¿Sirve sin pagar y sin obligación de publicar código? |
|---|---|---|---|
| **YOLOX** (Nano/Tiny/S) | Apache-2.0 (PyPI ✔) | Apache-2.0 (repo oficial) | **Sí** |
| **NanoDet-Plus** | Apache-2.0 | Apache-2.0 | **Sí** |
| **PP-PicoDet** (PaddleDetection) | Apache-2.0 | Apache-2.0 | **Sí** (verificar en el repo al elegir) |
| **RTMDet** (MMDetection) | Apache-2.0 (PyPI `mmdet` ✔) | Apache-2.0 | **Sí** |
| **D-FINE / RT-DETR** (repos originales) | Apache-2.0 | Apache-2.0 | Sí, pero pesado en CPU |
| **RF-DETR** | Apache-2.0 (PyPI ✔) | Algunos tamaños con licencia distinta | Revisar peso por peso |
| Ultralytics YOLOv8 / YOLO11 / RT-DETR de Ultralytics | **AGPL-3.0** (PyPI ✔) | AGPL-3.0 | Uso interno defendible, pero con obligaciones AGPL; licencia comercial de pago |
| YOLOv5 / YOLOv10 | AGPL-3.0 | AGPL-3.0 | Igual que arriba |
| YOLOv6, YOLOv7, YOLOv9 | GPL-3.0 | — | Evitar |
| YOLO-NAS | Apache-2.0 | **Prohíben uso comercial** | **No** |
| DEIMv2 | — | **Prohíbe uso comercial** | **No** |
| MobileNet-SSD (TF) / HOG (OpenCV) | Apache-2.0 | Apache-2.0 | Sí, pero precisión baja con personas parciales u oclusiones |

Complementos (todos sin costo):

| Pieza | Licencia | ARM64 (aarch64) |
|---|---|---|
| ONNX Runtime 1.32 | MIT | Rueda oficial ✔ |
| ncnn | BSD-3 | Rueda oficial ✔ |
| OpenVINO 2026.4 | Apache-2.0 | Rueda ✔ (optimizado sobre todo para Intel) |
| LiteRT / tflite-runtime | Apache-2.0 | Rueda ✔ |
| OpenCV (headless) | Apache-2.0 | Rueda ✔ |
| supervision (ByteTrack, líneas y zonas) | MIT | Python puro ✔ |
| Norfair (tracker alternativo) | BSD-3 | Python puro ✔ |
| YOLOX (paquete de entrenamiento) | Apache-2.0 | Sin rueda ARM; **no hace falta**: se exporta a ONNX una vez y se ejecuta con ONNX Runtime |

Nota sobre datos de entrenamiento: los pesos preentrenados usan COCO (anotaciones
CC BY 4.0; imágenes de Flickr con licencias variadas). Es la práctica
habitual, pero conviene saberlo.

### 4.2 Carga computacional (cifras de referencia)

Valores de las tablas que publica cada proyecto, tomados de conocimiento previo; **no se volvieron a verificar en esta sesión**. Se confirmarán en cada repositorio al elegir el modelo.

| Modelo | Entrada | Parámetros | GFLOPs | AP COCO |
|---|---|---|---|---|
| PP-PicoDet-S | 320 | 0.99 M | 0.73 | 29.1 |
| NanoDet-Plus-m | 320 / 416 | 1.17 M | 0.9 / 1.52 | 27.0 / 30.4 |
| YOLOX-Nano | 416 | 0.91 M | 1.08 | 25.8 |
| NanoDet-Plus-m-1.5x | 416 | 2.44 M | 2.97 | 34.1 |
| YOLOX-Tiny | 416 | 5.06 M | 6.45 | 32.8 |
| YOLO11n (AGPL) | 640 | 2.6 M | 6.5 | 39.5 |
| YOLOv8n (AGPL) | 640 | 3.2 M | 8.7 | 37.3 |
| RTMDet-tiny | 640 | 4.8 M | 8.1 | 41.1 |
| D-FINE-N | 640 | 4 M | 7 | 42.8 |

Solo interesa la clase «persona». Con cámaras fijas en interiores, el AP
general de COCO subestima el desempeño real.

### 4.3 Capacidad estimada para dos C100 (**estimación, no medición**)

No se descargaron ni ejecutaron modelos: la instrucción fue no instalar el
motor, y el entorno bloqueó descargas de binarios externos. Supuestos:

- Se analiza `stream2` (baja resolución; la resolución exacta de la C100 se
  confirmará con VLC en la Etapa 2) y no se decodifica `stream1`.
- Para contar cruces en una puerta hacen falta **~5–10 cuadros analizados
  por segundo** por cámara (una persona cruza en ~1 s). Ocupación y
  vigilancia nocturna necesitan mucho menos (1–2 cps; de noche, detección de
  movimiento con OpenCV MOG2 y el detector solo para confirmar).
- Presupuesto: 2 cámaras × ~8 cps ≈ **16 inferencias/s** en horario comercial.

| Recurso | Estimado para 2 cámaras | Cupo Oracle (caso peor reportado: 2 OCPU / 12 GB) |
|---|---|---|
| RAM | ~0.6–1.5 GB (Python + ONNX Runtime + OpenCV + 2 decodificadores) | Holgado |
| CPU, modelos ~1–1.5 GFLOPs (PicoDet-S, NanoDet-Plus-m, YOLOX-Nano) a 320–416 | Probablemente < 1 núcleo | Holgado |
| CPU, modelos ~6–9 GFLOPs (YOLOX-Tiny, YOLO11n, RTMDet-tiny) | Probablemente 1–2 núcleos; puede requerir bajar resolución o cps | Justo |
| CPU, transformadores (D-FINE, RT-DETR) | Probablemente insuficiente a 8 cps | No recomendado |
| Red entrante | ~0.5–1 Mbps por cámara en `stream2` (por confirmar) | La entrada a Oracle no se cobra; depende de tu **subida** en Izzi |

**Recomendación técnica:** probar en la Etapa 3, con clips reales grabados
en el local (y borrados después), tres candidatos: **NanoDet-Plus-m**,
**YOLOX-Nano/Tiny** y **PP-PicoDet-S**. Todos se exportarían a ONNX y se
ejecutarían con ONNX Runtime o ncnn sobre ARM64, con ByteTrack, líneas y
zonas de `supervision`. Criterios de aceptación medidos: cps sostenidos,
CPU, RAM y precisión de entradas y salidas contra un conteo manual.
Ultralytics queda como alternativa solo si aceptas por escrito las
condiciones de AGPL-3.0.

---

## 5. Cámaras y conectividad Izzi → Oracle

Restricción respetada: **exactamente dos Tapo C100** (una por negocio), sin
puentes, sin otro equipo en el local y sin servicios contratados.

### 5.1 Datos verificados

- Las cámaras Tapo usan **RTSP en el puerto 554** (`/stream1` alta calidad,
  `/stream2` baja calidad) y ONVIF en el 2020. Requieren crear una «Cuenta de
  cámara» en la app Tapo (FAQ oficial de TP-Link).
- TP-Link no publica un límite de sesiones RTSP simultáneas para la C100; hay
  reportes de fallas cuando varios clientes leen a la vez. **Se probará.**
- **2026:** dos fallas en el **servicio RTSP** de la C100/C101 V5
  (CVE-2026-75618, caída por puntero nulo; CVE-2026-75619, desbordamiento de
  memoria con usuario autenticado). Corregidas en el firmware
  **1.5.4 Build 260528**. Hay advertencias anteriores (CVE-2025-14300,
  CVE-2026-0918). La recomendación del fabricante y de los analistas es
  **restringir el RTSP a IP de confianza**.
- izzi publica cómo abrir puertos en sus módems (Arris TG3442, Hitron CHITA,
  Technicolor CGA4233, etc.). Eso **solo sirve si hay IP pública real**.
- Con CGNAT no es posible recibir conexiones entrantes por IPv4. Una petición
  ciudadana antigua (no verificada para 2026) reporta que izzi cobraba
  600–800 MXN/mes por IP pública. Eso violaría el presupuesto de $0.

### 5.2 Opciones evaluadas

| Opción | ¿Sin equipo extra y $0? | Viabilidad | Riesgo |
|---|---|---|---|
| A. Reenvío del puerto 554 → cada cámara, con IP pública sin CGNAT | Sí | Solo si no hay CGNAT y el módem lo permite | **Alto**: video de clientes y credenciales sin cifrar por internet; servicio RTSP con fallas recientes expuesto a escaneos. Cambiar el puerto **no** protege |
| A'. Igual que A, con **restricción por IP de origen** = IP fija de Oracle | Sí | Depende de que el módem izzi tenga ese campo (no confirmado) | Medio: cierra los escaneos, pero el video sigue **sin cifrar** en el trayecto |
| B. IPv6 directo a la cámara | Sí | Desconocido: no hay evidencia de que la C100 use IPv6 para RTSP | A verificar en el módem |
| C. Pedir IP pública a izzi | Solo si es gratis | Variable por zona | Mismo riesgo que A |
| D. VPN/túnel (Tailscale, ZeroTier, WireGuard) | **No**: requiere software en un equipo del local; ni la cámara ni el módem de izzi lo ejecutan | Excluida por tus restricciones | — |
| E. Nube de Tapo | No hay API oficial de video para terceros; las no oficiales violan términos | Descartada | — |
| F. iPhone como puente | No permanece en el local; iOS no procesa RTSP en segundo plano | Excluida | — |

### 5.3 Conclusión

Con las restricciones actuales, la única vía técnica es **A/A'** y depende de
tres hechos de tu red que no se pueden comprobar desde aquí:

1. **¿Hay CGNAT?** Si lo hay y izzi no da IP pública gratis, el análisis
   continuo en Oracle **no es viable con $0 sin un equipo en el local**. Ese
   sería el bloqueo, con su evidencia.
2. **¿El módem permite restringir por IP de origen?** Si no, abrir el 554
   expone las cámaras a todo internet. **No lo recomiendo.**
3. **¿Cuánta subida tiene el plan de izzi?** Determina si caben dos flujos
   continuos.

Aun en el mejor caso (A'), el video **viajaría sin cifrar** entre Durango y
Oracle. Eso es un riesgo de privacidad para tus clientes. Además, la
videovigilancia de personas identificables requiere aviso de privacidad
conforme a la LFPDPPP, haya análisis o no.

### 5.4 Evidencia que necesito que recojas (5–10 minutos, sin abrir nada)

1. Desde el iPhone conectado al Wi-Fi del local, entra al módem
   (normalmente `http://192.168.0.1`) y toma captura de la **IP WAN/Internet**.
2. En el mismo iPhone y Wi-Fi, abre una página de «cuál es mi IP» y toma
   captura. **Si las IP no coinciden, o la WAN empieza con 100.64–100.127,
   10., 172.16–31. o 192.168., hay CGNAT.**
3. Captura de la sección de **reenvío de puertos / firewall** del módem: ¿hay
   un campo de «IP de origen» o «IP remota permitida»? Anota también el
   modelo del módem.
4. ¿El módem muestra una **dirección IPv6** de internet? Captura.
5. En la app Tapo, de cada cámara: **versión de hardware y de firmware**
   (para confirmar ≥ 1.5.4 Build 260528 si es V5).
6. Una prueba de velocidad en el local (especialmente la **subida**).

Con eso, la Etapa 2 empieza en la red local: VLC → `rtsp://IP/stream2`, una
sola cámara, sin abrir ningún puerto.

---

## 6. Qué se probó y dónde

| Ámbito | Qué se probó | Con qué | Limitaciones |
|---|---|---|---|
| **PostgreSQL local** (16, desechable) | Migraciones de `vision` (2 veces, idempotencia); RLS para anon, cuenta ajena, viewer, admin y owner; validaciones; borrado en cascada desde Auth; **no interferencia con el esquema real de Good Barber**; reversión con `DROP SCHEMA`; respaldo y restauración | `supabase/tests/run.sh`, `supabase/tests/integracion/run.sh` | `auth`, `storage` y los roles de Supabase son **simulados** (`00_*stub*.sql`). Supabase usa otra versión de PostgreSQL y PostgREST. El esquema de Good Barber es el **del repositorio**; el de producción podría diferir si se cambió a mano |
| **Supabase simulado** (navegador) | Login correcto y erróneo, navegación, dashboard «Pendiente» y con datos de motor simulados, alta de estación con validación, horarios, cámaras | Playwright + Chromium emulando iPhone 14; respuestas REST/Auth falsas | No es Safari ni un iPhone real; no prueba RLS real vía API ni JWT reales |
| **Pruebas unitarias** | Horarios, indicadores («nunca inventar»), validación, errores, detección de `service_role` en el frontend | Vitest (23 pruebas) | Lógica pura |
| **No probado en servicios reales** | Supabase real (Data API con esquema `vision`, Auth, correos, PKCE), Cloudflare Pages, PWA instalada en iPhone, cámaras/RTSP, red izzi, Oracle, inferencia de modelos, rendimiento ARM | — | Todo pendiente de tu autorización |

---

## 7. Archivos implicados

**Leídos, sin modificar:** `supabase/schema.sql`, `supabase/migrations/*.sql`
(8), `supabase/functions/*/index.ts` (3), `js/*.js`, `supabase-config.js`,
`finanzas/supabase/schema.sql`, `finanzas/supabase-config.js`,
`finanzas/supabase/functions/anotar/index.ts`,
`.github/workflows/backup-database.yml`, `BACKUP.md`.

**Modificados en `vision/` en esta auditoría:**

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261127120000_vision_etapa1_base.sql` | Corrección H1 (cascada desde Auth) |
| `supabase/tests/10_rls_tests.sql` | Prueba de regresión de H1 |
| `docs/PENDIENTES.md` | Zona horaria: Durango → `America/Mexico_City` |
| `docs/ARQUITECTURA.md` | Referencia a esta auditoría (Oracle 2026) |

**Nuevos:** `docs/AUDITORIA-SEGURIDAD-INTEGRACION.md` (este informe),
`supabase/tests/integracion/run.sh`,
`supabase/tests/integracion/00_stub_supabase_completo.sql`,
`10_semilla_good_barber.sql`, `20_sonda.sql` y `21_ejecutar_sonda.sql`.

**Se modificarían solo con tu autorización:**
`.github/workflows/backup-database.yml` (segundo artifact de `vision`) y la
configuración del proyecto Supabase de Good Barber (SQL, Exposed schemas,
Redirect URLs).

---

## 8. Decisiones que requieren tu autorización

1. **Supabase — proyecto de Good Barber con esquema `vision`**, con estas
   condiciones: (a) respaldo manual previo; (b) usar **solo la cuenta de
   admin existente** (H2); (c) plan de reversión `DROP SCHEMA vision CASCADE`
   + quitar `vision` de *Exposed schemas*. ¿Autorizas?
2. **Rol mínimo para el motor (H3)** en lugar de `service_role`. ¿Autorizas
   diseñarlo para la Etapa 2?
3. **Respaldo de `vision`** como segundo artifact en `backup-database.yml`.
   ¿Autorizas modificar ese archivo?
4. **Candidatos de modelo:** NanoDet-Plus / YOLOX / PP-PicoDet (Apache-2.0)
   para medir en la Etapa 3, descartando AGPL/GPL y pesos no comerciales.
   ¿De acuerdo?
5. **Oracle Always Free:** el alta pide tarjeta para verificar identidad;
   los límites ARM de 2026 no están confirmados. ¿Autorizas el alta (sin
   «upgrade»)? ¿O prefieres esperar a resolver la conectividad (§5) primero?
   **Recomiendo esperar.**
6. **Conectividad:** enviar la evidencia de §5.4. Si hay CGNAT sin IP pública
   gratuita, tendrás que elegir entre: (a) aceptar el bloqueo y operar con
   las alertas nativas de Tapo + la app administrativa; (b) relajar alguna
   restricción (equipo en el local o costo de IP pública); o (c) otra
   alternativa que propongas. **No abriré ningún puerto sin tu aprobación
   explícita, por escrito, de la opción y sus riesgos.**
7. **Cámaras:** ¿quieres que la app **impida** registrar más de una cámara por
   negocio? Hoy permite agregar más desde Ajustes.

---

## Fuentes externas consultadas

- Supabase — precios y facturación (2 proyectos gratuitos activos, 500 MB/proyecto, pausa por inactividad): https://supabase.com/pricing · https://supabase.com/docs/guides/platform/billing-faq · https://supabase.com/changelog/33121-relaxing-database-size-limit-on-free-plan-0-5-gb-database-size-per-project
- TP-Link — RTSP/ONVIF en cámaras Tapo: https://www.tp-link.com/latam/support/faq/4465/
- TP-Link — Aviso de seguridad C100/C101 (CVE-2026-75618/75619): https://www.tp-link.com/us/support/faq/5251 · https://nvd.nist.gov/vuln/detail/CVE-2026-75619
- izzi — configurar puertos del módem: https://ayudaizzi.izzi.mx/hc/es/articles/4407995943322-Configura-los-puertos-de-tu-m%C3%B3dem-izzi
- Petición sobre IP pública en izzi (antigua, no verificada): https://www.change.org/p/que-izzi-abra-los-puertos-y-deje-de-cobrar-por-ip-publica
- CGNAT y cámaras IP: https://arquibuild.com/cgnat-camaras-ip/ · https://mejorconexion.mx/blog/como-abrir-puertos-router-mexico.html
- Oracle Always Free (página oficial; **no accesible desde este entorno**): https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm
- Reporte de reducción de cupo ARM en 2026 (**no verificado**): https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/
- Licencias de detectores: https://robotinaction.tech/model-licenses.html · https://www.lightly.ai/blog/best-ultralytics-alternatives-in-2026 · https://savant-ai.io/blog/yolo-commercial-licensing/
- Metadatos de licencia y ruedas ARM64: consultados directamente en `https://pypi.org/pypi/<paquete>/json`.
