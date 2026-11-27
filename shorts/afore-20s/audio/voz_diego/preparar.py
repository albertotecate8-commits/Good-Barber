"""Acomoda la voz de Diego (ElevenLabs) en sus escenas: quita silencios de los extremos,
ajusta la velocidad sólo donde hace falta para que quepa, y guarda colocacion.json (inicio de cada frase)."""
import json, subprocess
FRASES = [  # (archivo, inicio en el video, tempo) — toma «a» de cada frase
    ("l1a.mp3", 0.85, 1.0),   # Afore Pro, asesoría que impulsa tu futuro.
    ("l2a.mp3", 4.40, 1.0),   # ¡Inicia enero con más dinero!
    ("l3a.mp3", 7.22, 1.0),   # Retira de tu Afore por desempleo hasta $35,193 pesos.
    ("l4a.mp3", 12.42, 1.12), # Requisitos (un poco más rápido para que quepa)
    ("l5a.mp3", 18.12, 1.0),   # Contáctanos por WhatsApp.
]
out = []
for i, (f, t0, tempo) in enumerate(FRASES):
    dst = f"final_l{i + 1}.wav"
    af = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse"
    if tempo != 1.0: af += f",atempo={tempo}"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f, "-af", af, "-ar", "48000", "-ac", "1", dst], check=True)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dst], capture_output=True, text=True).stdout)
    out.append({"archivo": dst, "inicio": t0, "fin": round(t0 + d, 2)})
    print(f"{t0:6.2f} → {t0 + d:6.2f}  {dst}")
json.dump(out, open("colocacion.json", "w"), indent=1)
