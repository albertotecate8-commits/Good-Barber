"""Narración completa con las voces mexicanas de Piper (gratis, locales): leen con reglas del español,
así que «Afore» suena «a-fó-re». Uso: PIPER_DIR=... python3 narracion_piper.py → prueba_afore/narracion_piper_*.mp3"""
import os, subprocess, wave
from piper import PiperVoice
FRASES = ["Afore Pro, asesoría que impulsa tu futuro.", "¡Inicia enero con más dinero!",
          "Retira de tu Afore por desempleo hasta treinta y cinco mil ciento noventa y tres pesos.",
          "No haber retirado en cinco años, no estar vigente en el IMSS, y mínimo dos años cotizados.", "Contáctanos por WhatsApp."]
MODELOS = {"ald": "vits-piper-es_MX-ald-medium/es_MX-ald-medium", "claude": "vits-piper-es_MX-claude-high/es_MX-claude-high"}
base = os.environ["PIPER_DIR"]
for nombre, mod in MODELOS.items():
    voz = PiperVoice.load(os.path.join(base, mod + ".onnx"))
    partes = []
    for i, f in enumerate(FRASES):
        out = f"/tmp/np_{nombre}_{i}.wav"
        with wave.open(out, "wb") as w:
            voz.synthesize_wav(f, w)
        partes.append(out)
    filt = "".join(f"[{i}:a]apad=pad_dur=0.5,aresample=48000[a{i}];" for i in range(len(partes))) + "".join(f"[a{i}]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=0:a=1"
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", p] for p in partes], []) + ["-filter_complex", filt, "-b:a", "128k", f"prueba_afore/narracion_piper_{nombre}.mp3"], check=True)
    print(nombre)
