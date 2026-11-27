# Conexión de las dos Tapo C100 — procedimiento y criterios (Fase 1)

Condiciones: $0, sin equipos en el local, una red Izzi, dos Tapo C100 (Good
Barber y Glamour Studio). Primero una cámara y luego la segunda.

## Paso 0 · Diagnóstico de red (desde el iPhone, en el local)

En la app: **Ajustes → Diagnóstico de red**. Hay que hacerlo con el Wi-Fi del
local y los datos móviles apagados.

1. Tocar «Medir IP pública».
2. Abrir `192.168.0.1` en Safari, entrar con los datos de la etiqueta del
   módem y copiar la **IP WAN**.
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
- La **Tapo C100 solo admite IPv4**, así que IPv6 no es alternativa.
- **No hay RTSP cifrado** (RTSPS).
- La nube de Tapo no ofrece una API de video para terceros.
- Un túnel o VPN necesita software corriendo en un equipo del local, y esos
  equipos están excluidos.

## Seguridad de RTSP (antes de cualquier conexión directa)

- El video y la autenticación **viajan sin cifrar** entre el local y el
  servidor. Una contraseña **no** lo hace seguro. Riesgo residual: un tercero
  en la ruta podría ver el video de clientes.
- En 2026 se publicaron fallas en el servicio RTSP de la C100 V5
  (CVE-2026-75618 y CVE-2026-75619), corregidas en el firmware
  **1.5.4 Build 260528**. Es requisito tener el firmware actualizado.
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

**Cámara 1 (Good Barber)**
1. App Tapo → la cámara → *Ajustes avanzados → Cuenta de la cámara*: crear
   usuario y contraseña (sin caracteres especiales). Actualizar el firmware.
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
5. App: dibujar la línea de la puerta y las zonas de las estaciones, y
   activar «Solicitar análisis».
6. **Validación real:** durante 1 hora, el propietario anota a mano entradas
   y salidas, y se comparan con las del motor. Igual con la ocupación de una
   estación.

**Cámara 2 (Glamour Studio):** repetir los pasos 1–5 con el puerto externo
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
