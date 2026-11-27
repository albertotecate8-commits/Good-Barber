# Conexión de las dos Tapo C110 — procedimiento y criterios (Fase 1)

Condiciones: $0, sin equipos en el local, una red Izzi y **dos Tapo C110**
(corrección del propietario: no son C100). **La primera C110 ve los espacios
de ambos negocios.** Primero una cámara y luego la segunda.

## Ficha técnica verificada de la Tapo C110

| Aspecto | Dato | Fuente |
|---|---|---|
| Resolución | 3 MP, 2304 × 1296 (16:9), H.264 | Ficha técnica de TP-Link |
| RTSP | Puerto **554**: `/stream1` (alta) y `/stream2` (baja) | FAQ 2680 de TP-Link |
| ONVIF | Profile S, puerto **2020** | FAQ 2680 y comparador de TP-Link |
| Requisito | Crear la «Cuenta de cámara» en la app Tapo (y activar ONVIF si se usara) | Guías de RTSP de Tapo |
| Límite | Solo **2 de 3** a la vez: Tapo Care, grabación en microSD y NVR/RTSP/ONVIF | FAQ de TP-Link |
| Seguridad | **CVE-2026-6250** (alta): inyección en el servicio **ONVIF** de la C110 v2; corregida desde el firmware **1.5.4 Build 260428**. ONVIF **no** se expone nunca y el motor no lo usa | Aviso de seguridad 5128 de TP-Link |
| Estabilidad | Hay reportes de `stream1` (HD) lento o inestable por RTSP; el motor usa **`stream2`** | Comunidad TP-Link |
| IPv6 / cifrado | Las cámaras Tapo solo usan **IPv4**; no hay **RTSPS** | FAQ de Tapo; no hay evidencia de lo contrario |

Para la C110 no se encontraron avisos de RTSP; las fallas RTSP de 2026
(CVE-2026-75618/75619) eran de la C100/C101 y **no aplican**.

Una cámara puede observar estaciones y puertas de **cualquiera de los dos
negocios** (Ajustes → Cámaras → «Líneas de entrada y salida» → «Las
entradas cuentan para»). Las métricas se guardan por cámara **y** por negocio.

## Paso 0 · Diagnóstico de red (desde el iPhone, en el local)

En la app: **Ajustes → Diagnóstico de red**. Hay que hacerlo con el Wi-Fi del
local y los datos móviles apagados.

1. Tocar «Medir IP pública».
2. Abrir en Safari la dirección «Router» de *Ajustes → Wi-Fi → (i)* (en el
   local: `192.168.1.1`), entrar con los datos de la etiqueta del módem y
   copiar la **IP WAN**.
3. Solo mirar, sin guardar nada: ¿el reenvío de puertos tiene un campo de
   **IP de origen / IP remota**?
4. Tocar «Guardar diagnóstico». El resultado queda en la base y lo leo
   directamente.

No se abre ningún puerto ni se cambia nada en el módem.

## Decisión según el resultado

| Resultado | Qué significa | Conexión remota con $0 y sin equipos |
|---|---|---|
| **CGNAT** (WAN en 100.64.0.0/10) | Izzi comparte la IP; nada de internet entra al módem | **Imposible.** Abrir puertos no sirve |
| **NAT del proveedor** (WAN pública ≠ IP pública) | Igual que CGNAT, con otro rango | **Imposible** (repetir una vez para descartar cambio de IP) |
| **Doble NAT** (WAN privada) | Hay otro router delante del módem | **Imposible** desde este módem |
| **IP pública** + **sí** hay filtro por IP de origen | El módem puede aceptar conexiones solo desde el servidor | **Viable con riesgos controlados** (ver Seguridad) → continuar |
| **IP pública** + **no** hay filtro | Habría que abrir RTSP a todo internet | **No recomendado:** expone las cámaras a escaneos y a fallas conocidas del servicio RTSP |

Datos verificados que cierran otras vías:
- La **Tapo C110 solo admite IPv4**, así que IPv6 no es alternativa.
- **No hay RTSP cifrado** (RTSPS).
- La nube de Tapo no ofrece una API de video para terceros.
- Un túnel o VPN necesita software corriendo en un equipo del local, y esos
  equipos están excluidos.

## Seguridad de RTSP (antes de cualquier conexión directa)

- El video y la autenticación **viajan sin cifrar** entre el local y el
  servidor. Una contraseña **no** lo hace seguro. Riesgo residual: un tercero
  en la ruta podría ver el video de clientes.
- C110: **CVE-2026-6250** en el servicio **ONVIF** (puerto 2020), corregida en
  el firmware **1.5.4 Build 260428** (C110 v2). Es requisito tener el firmware
  actualizado, **no reenviar nunca el puerto 2020** y dejar ONVIF apagado.
- Mitigaciones obligatorias si se continúa:
  - Filtro por IP de origen (solo la IP del servidor).
  - Puerto externo distinto por cámara (cambiar el puerto no protege; solo
    evita choques).
  - «Cuenta de cámara» con contraseña única.
  - Solo `stream2` (baja resolución).
  - El motor registra cada desconexión.
- Requisito legal aparte: aviso de privacidad de videovigilancia (LFPDPPP).

## Oracle Cloud Always Free (requisitos actuales)

- **Cupo ARM (A1):** 2 OCPU y 12 GB al mes según las fuentes de 2026. La
  documentación oficial en caché todavía dice 4/24; se planifica con 2/12.
- **Registro:** lo hace el propietario. Pide **tarjeta para verificar
  identidad** (sin cargo si la cuenta se queda en Always Free y no se hace
  «upgrade»). Ningún conector puede hacerlo.
- **Región:** elegir una de México si tiene capacidad A1 (puede salir «Out of
  capacity»; hay que reintentar o cambiar de zona de disponibilidad).
- **Reclamo de instancias inactivas:** no aplica a un motor activo (usa CPU
  todo el tiempo).
- **Capacidad para dos cámaras:** el rendimiento en ARM **no se ha medido**.
  Se mide en la propia VM con las cámaras reales; no se extrapola de pruebas
  con videos públicos.

## Procedimiento (solo si la decisión es «viable»)

**Cámara 1 (la C110 que ve ambos espacios)**
1. App Tapo → la cámara → *Ajustes avanzados → Cuenta de la cámara*: crear
   usuario y contraseña (sin caracteres especiales). Actualizar el firmware a
   la versión más reciente (≥ 1.5.4 Build 260428 en C110 v2). Dejar ONVIF
   apagado. Anotar la **versión de hardware** (v1/v2) que muestra la app.
2. Prueba local, en el Wi-Fi del local: en el iPhone, la app gratuita **VLC**
   → *Red → Abrir red* → `rtsp://USUARIO:CONTRASEÑA@IP-DE-LA-CÁMARA:554/stream2`.
   La IP de la cámara aparece en la app Tapo (información del dispositivo).
   Esta prueba usa el iPhone solo un momento; no se queda en el local.
3. Módem: reservar la IP de la cámara (DHCP) y crear el reenvío
   *puerto externo 55401 → cámara:554*, **con IP de origen = IP del servidor
   Oracle**.
4. Servidor: instalar el motor (`vision/engine`), crear el usuario limitado
   del motor (`BASE-DE-DATOS.md` §6) y guardar la URL RTSP **solo** como
   variable de entorno.
5. App: dibujar **una línea por puerta**, eligiendo para cuál negocio cuenta
   (Good Barber o Glamour Studio), dibujar las zonas de las estaciones de
   ambos negocios y activar «Solicitar análisis».
6. **Validación real:** durante 1 hora, el propietario anota a mano entradas
   y salidas, y se comparan con las del motor. Igual con la ocupación de una
   estación.

**Cámara 2 (segunda C110):** repetir los pasos 1–5 con el puerto externo
55402. Después, medir CPU, memoria y estabilidad con **las dos cámaras
simultáneas** durante al menos un día comercial.

## Si no es viable

Queda como evidencia el diagnóstico guardado: IP pública, IP WAN del módem,
proveedor y la fecha. Alternativas **sin contratar nada**:

1. Preguntar a Izzi si da IP pública **sin costo**. Si cobra, no se contrata.
2. Operar con lo que ya funciona: alertas nativas de Tapo + app
   administrativa (horarios, estaciones, configuración), sin conteo
   automático.
3. Que el propietario decida relajar una restricción, por ejemplo usar un
   equipo que **ya tenga** en el local. No se propone comprar nada.

## Análisis con la captura del Wi-Fi del local (27 nov 2026)

| Dato de la captura | Lectura |
|---|---|
| Red `IZZI-268F-5G`, Wi-Fi 6 | Equipo de Izzi |
| iPhone `192.168.1.35/24`, «Router» `192.168.1.1` | Red local privada detrás del módem (normal). **No** indica por sí solo si hay CGNAT |
| IPv6: 3 direcciones, router `fe80::1` | Izzi entrega **IPv6** en el local. No sirve para las cámaras: la Tapo C110 solo usa IPv4 |

Para decidir faltan **dos números**: la **IP pública IPv4** (la que ve
internet) y la **IP WAN IPv4 del módem**. También hace falta saber si el
módem permite filtrar por IP de origen.

## ¿Existe una conexión segura sin exponer RTSP a internet? (conclusión técnica)

Una conexión **cifrada** necesita que algo dentro del local inicie un túnel
de salida (WireGuard, Tailscale, cloudflared) o que la cámara cifre el
video. Con las condiciones actuales nada de eso es posible:

- La Tapo C110 **no cifra RTSP** (no hay RTSPS) y no puede ejecutar un túnel.
- El módem de Izzi no ofrece servidor ni cliente VPN para el usuario.
- El iPhone no puede quedarse en el local, e iOS no mantiene un túnel ni
  procesa video en segundo plano.
- La nube de Tapo (cifrada) **no tiene una API de video para terceros**; las
  bibliotecas no oficiales violan sus términos.
- IPv6 no aplica: las cámaras solo usan IPv4.

**Resultado:** con $0 y sin equipos adicionales **no existe una vía cifrada**.
La única vía técnica es el reenvío del puerto RTSP **restringido por IP de
origen** a la IP del servidor, con el video **sin cifrar** en el trayecto. Y
solo funciona si la línea tiene **IP pública sin CGNAT**.
