# Auditoría de seguridad e integración — previa a la Etapa 2

Fecha: 27 de noviembre de 2026 (revisión 2: proyecto de Supabase
independiente) · Alcance: Smart Business Vision (`vision/`), cámaras,
conectividad y motor de visión.

**Restricciones respetadas en esta auditoría:** no se modificó ninguna app
existente, no se conectó nada a Supabase real, no se desplegó, no se crearon
recursos en la nube y no se activó ningún pago.

---

## 0. Resumen ejecutivo

**Decisión vigente del propietario:** Smart Business Vision usará un
**proyecto de Supabase nuevo e independiente**. No usará el de Good Barber
ni el de Finanzas.

| Tema | Resultado | Bloquea la Etapa 2 |
|---|---|---|
| Interferencia con Good Barber / Finanzas | **Eliminada por diseño:** proyectos distintos, sin Auth, base ni permisos compartidos. El frontend rechaza las URL de esos dos proyectos | No |
| Límite del plan gratuito | Ya hay 2 proyectos gratuitos activos (Good Barber y Finanzas). Hay que confirmar, al crearlo, que el tercero sea Free sin pausar otros ni pagar | **Sí**, hasta confirmarlo |
| Seguridad propia de Vision (RLS, roles, Auth) | Probada en PostgreSQL local: anon, cuenta ajena, viewer, admin, owner, motor y borrado desde Auth | No |
| Credenciales del motor | Rol nuevo `vision_engine` con permisos mínimos. Ni la app ni el motor usan `service_role` | No |
| Defecto corregido (revisión 1) | `protect_last_owner` bloqueaba el borrado en cascada desde Auth. Corregido y con prueba | Resuelto |
| Respaldo | Propio de Vision, separado del de Good Barber. Restauración probada localmente | No (requiere autorización) |
| Zona horaria | Durango → `America/Mexico_City` (UTC−6) | No |
| Motor de visión | Candidatos Apache-2.0 con ARM64 verificado (§4) | No; falta elegir |
| Oracle Always Free | Cupo ARM de 2026 sin confirmar; se planifica para 2 OCPU / 12 GB | Pendiente |
| Conectividad izzi → Oracle | **Riesgo principal:** depende de CGNAT, de que el módem restrinja por IP de origen y de aceptar RTSP sin cifrar (§5) | **Sí** |

---

## 1. Supabase: proyecto independiente

### 1.1 Qué cambia respecto de la revisión 1

En la revisión 1 se auditó instalar `vision` dentro del proyecto de Good
Barber. Se comprobó en PostgreSQL local que no alteraba `public`, `auth` ni
`storage`, pero aparecieron riesgos propios de compartir:

- Toda cuenta nueva recibía un perfil «barbero» en Good Barber (H2).
- La clave del motor habría dado acceso a clientes y citas (H3).
- Auth, plantillas de correo y cupos eran compartidos (H4, H5).

Con un **proyecto independiente esos riesgos desaparecen**:

| Riesgo de la revisión 1 | Estado |
|---|---|
| H2 — perfil «barbero» automático para cuentas nuevas | **No aplica**: el proyecto de Vision no tiene el trigger de Good Barber |
| H3 — `service_role` del motor con acceso a clientes y citas | **No aplica**; además el motor ya no usa `service_role` (§1.3) |
| H4 — Auth, plantillas y límite de correos compartidos | **No aplica**: Auth propio |
| H5 — 500 MB compartidos con Good Barber | **No aplica**: 500 MB propios |
| Necesidad de modificar el respaldo de Good Barber | **No aplica**: respaldo propio (§2) |
| H1 — borrado en Auth bloqueado por `protect_last_owner` | **Sigue siendo relevante y está corregido**: también afectaría al propio proyecto de Vision |

La prueba de integración con el esquema de Good Barber
(`supabase/tests/integracion/`) se **retiró**, porque ya no aplica. Su
resultado (sin diferencias en `public`/`auth`/`storage`; reversión total)
queda registrado en el historial de git, en el commit de la revisión 1.

### 1.2 Protección contra conexiones equivocadas

`src/lib/env.ts` bloquea el arranque en cualquiera de estos casos (con
pruebas unitarias):

- La URL es la de Good Barber (`sisgfnykjzovnaxylxyq`) o la de Finanzas
  (`mwskrwkkiuifedatuvca`).
- La clave es `service_role` o `sb_secret_…`.
- Falta alguna variable.

### 1.3 Credenciales del motor: rol `vision_engine`

Nueva migración `20261127120200_vision_rol_motor.sql`. Crea el rol sin login
`vision_engine`, con permisos y políticas RLS explícitas:

- **Lee** la configuración: sitio, negocios, horarios, cámaras, estaciones y
  líneas.
- **Escribe** resultados: latido, salud de cámaras, métricas por hora, estado
  en vivo y eventos. Los eventos son solo de inserción.
- **No puede:** leer `members`, empleados ni servicios; leer `auth`; cambiar
  la configuración; borrar filas; revisar eventos de seguridad; ejecutar
  `list_members` ni `review_security_event`.

Lo prueba `10_rls_tests.sql` con un usuario que hereda del rol. El usuario
con login lo crea el propietario en la Etapa 2, con una contraseña que nunca
pasa por el repositorio (`BASE-DE-DATOS.md` §6). **Por verificar en el
proyecto real:** que el pooler de Supabase acepte usuarios personalizados.

### 1.4 Hallazgos vigentes de la app

- **H1 (corregido):** el borrado en cascada desde Auth ya no se bloquea.
- **H7:** sin `innerHTML`/`dangerouslySetInnerHTML` ni `eval`. La sesión vive
  en el almacenamiento del navegador, lo normal en `supabase-js`. La CSP
  necesita `'unsafe-inline'` en scripts por la exportación estática.
  Mejora menor propuesta: limitar `list_members` (correos) a
  propietario/administrador.
- **Nuevo, de configuración:** el proyecto nuevo trae `public` expuesto en
  la Data API. Estará vacío, así que es inofensivo, pero puede quitarse de
  *Exposed schemas* (`BASE-DE-DATOS.md` §3.6).

---

## 2. Respaldo y recuperación (de Vision)

- El respaldo actual del repositorio es de Good Barber y **no se modifica**.
- Propuesta: workflow **separado**, `backup-vision.yml` (texto completo en
  `BASE-DE-DATOS.md` §7). Usaría secretos propios y generaría un artifact
  cifrado con `pg_dump --schema=vision --data-only`. **No se ha creado:**
  requiere tu autorización y los secretos.
- Ensayo de restauración (PostgreSQL local, ahora dentro de
  `supabase/tests/run.sh`), en una base nueva con las mismas cuentas de Auth:
  1. Se aplican todas las migraciones **excepto** las de datos iniciales.
  2. Se restauran los datos del respaldo.
  3. Resultado: **mismas filas en las 19 tablas**; RLS correcto (viewer ve 2
     negocios) y `anon` sin acceso.
- Si se pierde el proyecto completo, las cuentas de Auth cambian de id y
  `vision.members` debe volver a enlazarse por correo.
- Reversión total: `drop schema vision cascade; drop role vision_engine;` o
  eliminar el proyecto. Las otras apps no se ven afectadas.

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
| **PostgreSQL local** (16, desechable) | Migraciones (2 veces, idempotencia); RLS para anon, cuenta ajena, viewer, admin y owner; validaciones; **rol del motor** (permitido y prohibido); borrado en cascada desde Auth; **respaldo y restauración** | `supabase/tests/run.sh` | `auth` y los roles de Supabase son **simulados** (`00_supabase_stub.sql`). Supabase usa otra versión de PostgreSQL y PostgREST |
| Histórico (revisión 1) | No interferencia con el esquema real de Good Barber | Script retirado (ver historial de git) | Ya no aplica: proyecto independiente |
| **Supabase simulado** (navegador) | Login correcto y erróneo, navegación, dashboard «Pendiente» y con datos de motor simulados, alta de estación con validación, horarios, cámaras | Playwright + Chromium emulando iPhone 14; respuestas REST/Auth falsas | No es Safari ni un iPhone real; no prueba RLS real vía API ni JWT reales |
| **Pruebas unitarias** | Horarios, indicadores («nunca inventar»), validación, errores, rechazo de `service_role` y de los proyectos de Good Barber/Finanzas | Vitest (24 pruebas) | Lógica pura |
| **No probado en servicios reales** | Proyecto real de Supabase (Data API con `vision`, Auth, correos, PKCE, pooler con usuario del motor, Security Advisor); Cloudflare Pages; PWA instalada en iPhone; cámaras/RTSP; red izzi; Oracle; inferencia; rendimiento ARM | — | Pendiente de que crees el proyecto y de tus autorizaciones |

---

## 7. Archivos implicados

**Apps existentes:** ninguna modificada. Good Barber y Finanzas no se usan
ni se leen en tiempo de ejecución.

**Cambios en `vision/` (revisión 2):**

| Archivo | Cambio |
|---|---|
| `supabase/migrations/20261127120200_vision_rol_motor.sql` | **Nuevo:** rol `vision_engine` de permisos mínimos |
| `supabase/tests/10_rls_tests.sql` | Pruebas del rol del motor |
| `supabase/tests/run.sh` | Ensayo de respaldo y restauración |
| `supabase/tests/integracion/` | **Eliminado** (era específico del proyecto compartido) |
| `src/lib/env.ts`, `src/lib/domain/misc.test.ts` | Rechazo de las URL de Good Barber y Finanzas, con prueba |
| `.env.example`, `README.md` | Proyecto propio; credenciales del motor fuera del frontend |
| `docs/BASE-DE-DATOS.md` | Reescrito: crear, configurar y conectar el proyecto nuevo; usuario del motor; respaldo |
| `docs/ARQUITECTURA.md`, `docs/PENDIENTES.md` | Proyecto independiente y motor sin `service_role` |
| `docs/AUDITORIA-SEGURIDAD-INTEGRACION.md` | Este informe |

**Cambios de la revisión 1 que se conservan:** corrección H1 en
`…_vision_etapa1_base.sql`; zona horaria Durango.

---

## 8. Decisiones que requieren tu autorización

1. **Crear el proyecto de Supabase de Vision** (lo haces tú, `BASE-DE-DATOS.md`
   §3). Confirma que quede en Free sin pausar ni pagar. Después envíame
   **solo** la Project URL y la clave publishable.
2. **Respaldo propio** (`backup-vision.yml` + 2 secretos de GitHub).
   ¿Autorizas crearlo cuando exista el proyecto?
3. **Candidatos de modelo:** NanoDet-Plus / YOLOX / PP-PicoDet (Apache-2.0)
   para medir en la Etapa 3, descartando AGPL/GPL y pesos no comerciales.
   ¿De acuerdo?
4. **Oracle Always Free:** recomiendo esperar a resolver la conectividad (§5).
5. **Conectividad:** enviar la evidencia de §5.4. **No abriré ningún puerto
   sin tu aprobación explícita, por escrito, de la opción y sus riesgos.**
6. **Cámaras:** ¿quieres que la app **impida** registrar más de una cámara por
   negocio? Hoy permite agregar más desde Ajustes.
7. **Mejora menor:** ¿limitar los correos de `list_members` a
   propietario/administrador?

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
