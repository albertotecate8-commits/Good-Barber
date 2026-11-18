# Short "Dos vecinos" — Afore Pro, retiro por desempleo

Short vertical 1080x1920, 30 fps, 59.6 s. Estilo caricatura de la skill *shorts-animados-3d*: personajes 2D planos en un
mundo 3D (Three.js + Remotion), tinta, desenfoque, luz cálida con sombras azul-violeta. Sin subtítulos.

## Guion aprobado
Ver `audio/guion.txt`. Datos usados (solo los que dio Afore Pro): hasta $35,193 (nunca garantizado); requisitos: no estar
dado de alta en el IMSS, mínimo 100 semanas cotizadas, 5 años desde el último retiro por desempleo; no darse de alta durante
el trámite; ~45 días (aproximado); prevalidación gratuita con la CURP; honorarios 30 % de lo retirado; WhatsApp 618 367 7047.
Texto legal en pantalla al final: asesoría privada, el trámite oficial es gratuito, no se garantiza autorización ni monto,
el titular realiza personalmente sus validaciones.

## Pasos
1. Voz (gratis, Edge TTS, voz es-MX-JorgeNeural): `cd audio && python tts.py +28% && python recorta.py`
   -> `voz.wav` y `src/videos/desempleo/palabras.json` (tiempos por palabra; todo se sincroniza con ese archivo).
2. Música y efectos: `python musica.py && python mezcla.py` -> `mezcla.wav` (-14 LUFS).
3. Fotos sueltas para revisar: `node scripts/fotos.mjs out/f_ 40,320,900 0.5`
4. Video: `npx remotion render src/index.ts Desempleo out/video.mp4 --codec=h264 --crf=16`
   (en Linux sin GPU: `--gl=swangle --browser-executable=<chrome-headless-shell> --concurrency=2 --timeout=400000`)
5. Junta imagen y audio:
   `ffmpeg -i out/video.mp4 -i audio/mezcla.wav -map 0:v:0 -map 1:a:0 -vf format=yuv420p -c:v libx264 -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart afore_desempleo.mp4`
6. Medición: `python herramientas/medir_30fps.py afore_desempleo.mp4 out/medida`

`RENDERIZAR.command` (Mac) y `RENDERIZAR.bat` (Windows) hacen los pasos 4 y 5 con doble clic (requieren Node y ffmpeg
instalados y `npm install` hecho una vez).

Plantillas y motor: skill de Crea con LuisPa, basada en claude-animated-shorts de Mr omi (licencia MIT, ver LICENSE-plantillas).
