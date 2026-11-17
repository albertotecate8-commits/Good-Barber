# Short animado: Afore Pro (Don Chuy y Ana)

Don Chuy y Ana platican en la plaza frente a la Catedral de Durango; al final llueven monedas y sale el logo
«AFORE PRO – ¡Retira más de tu Afore!». Hecho con la skill *shorts-animados-3d* (Three.js + Remotion), estilo caricatura.

- `src/videos/afore/` — mundo (`world.ts`), personajes (`personajes.ts`, `toon.ts`), tiempos y cámara (`story.ts`),
  globos de diálogo y logo (`Afore.tsx`). `lineas.json` trae los tiempos por palabra; `boca.json`, la boca por cuadro.
- `audio/` — `musica.py` (música original y monedas), `voces.py` (arma el diálogo con las voces), `mezcla.py`.
- Voces: cada personaje dice sus 3 frases en un solo archivo (`audio/voces/chuy.wav`, `audio/voces/ana.wav`, 48 kHz),
  separadas por silencios. Esta versión usa voces locales gratuitas (Piper, español de México: `es_MX-ald` para
  Don Chuy y `es_MX-claude` para Ana, con el tono ajustado) porque ElevenLabs estaba saturado. Para cambiar a
  ElevenLabs basta con reemplazar esos dos archivos y repetir los pasos.

## Pasos
```
npm install
cd audio && python voces.py && python musica.py && python mezcla.py && cd ..
npx remotion render src/index.ts AforePro out/video.mp4 --codec h264 --crf 16
ffmpeg -i out/video.mp4 -i audio/mezcla.wav -map 0:v:0 -map 1:a:0 -vf format=yuv420p -c:v libx264 -crf 21 -c:a aac -b:a 192k -shortest -movflags +faststart out/afore_pro_final.mp4
```

Créditos: motor, plantillas de dibujo/post y sintetizador de audio de la skill gratuita claude-animated-shorts de Mr omi (licencia MIT, ver `LICENSE-plantillas`), versión en español de Crea con LuisPa.
