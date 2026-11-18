#!/bin/bash
# Renderiza el short por tramos de 250 cuadros (out/tramos/t_XXXX.mp4) y los junta en out/video.mp4.
# Si se interrumpe, al volver a correrlo salta los tramos que ya están completos.
cd "$(dirname "$0")/.." || exit 1
B=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}
TOTAL=$(node -e 'const d=require("./src/videos/desempleo/palabras.json");console.log(Math.round(d.dur*30))')
mkdir -p out/tramos; : > out/tramos/lista.txt
for ((a=0; a<TOTAL; a+=250)); do
  b=$((a+249)); [ $b -ge $TOTAL ] && b=$((TOTAL-1))
  f=out/tramos/t_$(printf %04d $a).mp4
  if [ ! -f "$f.ok" ]; then
    echo "tramo $a-$b"
    npx remotion render src/index.ts Desempleo "$f" --frames=$a-$b --gl=swangle --browser-executable=$B --concurrency=2 --timeout=400000 --codec=h264 --crf=16 --log=error || { echo "FALLO tramo $a"; exit 1; }
    touch "$f.ok"
  fi
  echo "file 't_$(printf %04d $a).mp4'" >> out/tramos/lista.txt
done
ffmpeg -y -loglevel error -f concat -safe 0 -i out/tramos/lista.txt -c copy out/video.mp4 && echo "LISTO $TOTAL cuadros"
