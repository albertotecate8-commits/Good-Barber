"""Más voces mexicanas gratuitas para GOOD BARBER: variantes de Jorge y Dalia (Edge TTS, cambiando tono y velocidad)
y las voces mexicanas de Piper (locales). Uso: PIPER_DIR=... python3 muestras_mx.py"""
import asyncio, os, subprocess, wave
GUION = ["Good Barber.", "Tu estilo. Tu personalidad. Tu mejor versión.", "Conoce nuestros servicios y precios.",
         "Lunes a sábado, de dos de la tarde a ocho de la noche.", "Te esperamos en Good Barber."]
EDGE = {  # nombre: (voz, velocidad, tono)
    "M1_Jorge_grave": ("es-MX-JorgeNeural", "-4%", "-9Hz"),
    "M2_Jorge_energia": ("es-MX-JorgeNeural", "+14%", "+3Hz"),
    "M3_Dalia_calida": ("es-MX-DaliaNeural", "-2%", "-6Hz"),
    "M4_Dalia_energia": ("es-MX-DaliaNeural", "+12%", "+4Hz"),
}
PIPER = {"M5_Piper_ald": "vits-piper-es_MX-ald-medium/es_MX-ald-medium", "M6_Piper_claude": "vits-piper-es_MX-claude-high/es_MX-claude-high"}


def juntar(partes, salida):
    f = "".join(f"[{i}:a]silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
                f"apad=pad_dur=0.35,aresample=48000,aformat=channel_layouts=mono[a{i}];" for i in range(len(partes)))
    f += "".join(f"[a{i}]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=0:a=1"
    subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", p] for p in partes], []) + ["-filter_complex", f, "-b:a", "128k", salida], check=True)
    print(os.path.basename(salida))


async def edge():
    import edge_tts
    for n, (v, rate, pitch) in EDGE.items():
        partes = []
        for i, l in enumerate(GUION):
            f = f"/tmp/mx_{n}_{i}.mp3"
            for k in range(5):
                try:
                    await edge_tts.Communicate(l, v, rate=rate, pitch=pitch, proxy=os.environ.get("HTTPS_PROXY")).save(f); break
                except edge_tts.exceptions.NoAudioReceived:  # el servicio a veces no responde
                    await asyncio.sleep(2 + 2 * k)
            partes.append(f)
        juntar(partes, f"muestras/voz_{n}.mp3")


def piper(base):
    from piper import PiperVoice
    for n, mod in PIPER.items():
        voz = PiperVoice.load(os.path.join(base, mod + ".onnx"))
        partes = []
        for i, l in enumerate(GUION):
            f = f"/tmp/mx_{n}_{i}.wav"
            with wave.open(f, "wb") as w:
                voz.synthesize_wav(l, w)
            partes.append(f)
        juntar(partes, f"muestras/voz_{n}.mp3")


os.makedirs("muestras", exist_ok=True)
if os.environ.get("SOLO_PIPER") != "1":
    asyncio.run(edge())
if os.environ.get("PIPER_DIR"):
    piper(os.environ["PIPER_DIR"])
