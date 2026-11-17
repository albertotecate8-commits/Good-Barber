# Short animado: Afore Pro (Don Chuy y Ana)

Don Chuy y Ana platican en la plaza frente a la Catedral de Durango; al final llueven monedas y sale el logo
«AFORE PRO – ¡Retira más de tu Afore!». Hecho con la skill *shorts-animados-3d* (Three.js + Remotion), estilo caricatura.

- `src/videos/afore/` — mundo (`world.ts`), personajes (`personajes.ts`, `toon.ts`), tiempos y cámara (`story.ts`),
  globos de diálogo y logo (`Afore.tsx`). `lineas.json` trae los tiempos por palabra; `boca.json`, la boca por cuadro.
- `audio/` — `musica.py` (música original y monedas), `voces.py` (arma el diálogo con las voces), `mezcla.py`.
- Las voces se generan en ElevenLabs y se guardan en `audio/voces/chuy.wav` y `audio/voces/ana.wav`.

## Pasos
```
npm install
cd audio && python voces.py && python musica.py && python mezcla.py && cd ..
npx remotion render src/index.ts AforePro out/video.mp4 --codec h264 --crf 16
ffmpeg -i out/video.mp4 -i audio/mezcla.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest out/afore_pro_final.mp4
```

Créditos: motor, plantillas de dibujo/post y sintetizador de audio de la skill gratuita claude-animated-shorts de Mr omi (licencia MIT, ver `LICENSE-plantillas`), versión en español de Crea con LuisPa.
