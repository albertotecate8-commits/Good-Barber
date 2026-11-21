"""Muestras de voz gratuitas para GOOD BARBER (otras voces además de Brian), para elegir de oído.
Edge TTS (en línea, gratis) y Piper (local, gratis). Uso: PIPER_DIR=... python3 muestras.py"""
import asyncio
import os
import subprocess
import wave

import edge_tts

GUION = [
    "Good Barber.",
    "Tu estilo. Tu personalidad. Tu mejor versión.",
    "Conoce nuestros servicios y precios.",
    "Lunes a sábado, de dos de la tarde a ocho de la noche.",
    "Te esperamos en Good Barber.",
]
EDGE = {"1_Jorge_Mexico": "es-MX-JorgeNeural", "2_Alonso_EUA": "es-US-AlonsoNeural", "3_Gonzalo_Colombia": "es-CO-GonzaloNeural",
        "4_Andrew": "en-US-AndrewMultilingualNeural", "5_Dalia_Mexico": "es-MX-DaliaNeural", "6_Paloma_EUA": "es-US-PalomaNeural",
        "7_Ava": "en-US-AvaMultilingualNeural", "8_Emma": "en-US-EmmaMultilingualNeural"}
PIPER = {"8_Piper_ald": "vits-piper-es_MX-ald-medium/es_MX-ald-medium", "9_Piper_claude": "vits-piper-es_MX-claude-high/es_MX-claude-high"}
PAUSA = 0.35


def juntar(partes, salida):
    """Une las frases, recorta el silencio de cada una y deja una pausa corta entre ellas."""
    filt = "".join(f"[{i}:a]silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                   f"apad=pad_dur={PAUSA},aresample=48000,aformat=channel_layouts=mono[a{i}];" for i in range(len(partes)))
    filt += "".join(f"[a{i}]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=0:a=1"
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", p] for p in partes], []) + ["-filter_complex", filt, "-b:a", "128k", salida], check=True)
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", salida], capture_output=True, text=True).stdout.strip()
    print(os.path.basename(salida), d, "s")


async def edge():
    for nombre, v in EDGE.items():
        partes = []
        for i, l in enumerate(GUION):
            f = f"/tmp/m_{nombre}_{i}.mp3"
            for intento in range(5):  # el servicio a veces no responde: reintentar
                try:
                    await edge_tts.Communicate(l, v, rate="+5%", proxy=os.environ.get("HTTPS_PROXY")).save(f)
                    break
                except edge_tts.exceptions.NoAudioReceived:
                    await asyncio.sleep(2 + 2 * intento)
            partes.append(f)
        juntar(partes, f"muestras/voz_{nombre}.mp3")


def piper(base):
    import numpy as np
    import sherpa_onnx
    for nombre, mod in PIPER.items():
        d = os.path.join(base, os.path.dirname(mod))
        tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(vits=sherpa_onnx.OfflineTtsVitsModelConfig(
            model=os.path.join(base, mod + ".onnx"), tokens=os.path.join(d, "tokens.txt"), data_dir=os.path.join(d, "espeak-ng-data")))))
        partes = []
        for i, l in enumerate(GUION):
            a = tts.generate(l, sid=0, speed=1.05)
            x = (np.clip(np.array(a.samples), -1, 1) * 32767).astype(np.int16)
            f = f"/tmp/p_{nombre}_{i}.wav"
            with wave.open(f, "wb") as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(a.sample_rate); w.writeframes(x.tobytes())
            partes.append(f)
        juntar(partes, f"muestras/voz_{nombre}.mp3")


os.makedirs("muestras", exist_ok=True)
asyncio.run(edge())
if os.environ.get("PIPER_DIR"):
    piper(os.environ["PIPER_DIR"])
