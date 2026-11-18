#!/bin/bash
# Doble clic en Mac: renderiza el short y le junta el audio. Se queda abierto para que veas el resultado.
cd "$(dirname "$0")" || exit 1
fail() { echo; echo "ERROR: $1"; read -r -p "Presiona Enter para cerrar..."; exit 1; }
command -v node >/dev/null || fail "Falta Node.js (https://nodejs.org)."
command -v ffmpeg >/dev/null || fail "Falta ffmpeg (brew install ffmpeg)."
[ -f audio/mezcla.wav ] || fail "Falta audio/mezcla.wav (corre: cd audio && python3 musica.py && python3 mezcla.py)."
[ -d node_modules ] || npm install || fail "No se pudo instalar (npm install)."
mkdir -p out
npx remotion render src/index.ts Desempleo out/video.mp4 --codec=h264 --crf=16 || fail "Falló el render (mira el mensaje de arriba)."
ffmpeg -y -i out/video.mp4 -i audio/mezcla.wav -map 0:v:0 -map 1:a:0 -vf format=yuv420p -c:v libx264 -crf 20 -c:a aac -b:a 192k -shortest -movflags +faststart afore_desempleo.mp4 || fail "Falló ffmpeg."
echo; echo "Listo: $(pwd)/afore_desempleo.mp4"; read -r -p "Presiona Enter para cerrar..."
