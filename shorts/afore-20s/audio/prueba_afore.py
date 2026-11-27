"""Prueba de pronunciación de «Afore Pro»: cada voz gratuita lo dice de 4 formas (1 a 4).
El cliente escucha y elige voz + número. Uso: python3 prueba_afore.py → prueba_afore/voz_*.mp3"""
import asyncio, os, subprocess
import edge_tts
VOCES = {"1_Brian": "en-US-BrianMultilingualNeural", "2_Andrew": "en-US-AndrewMultilingualNeural", "3_Ava": "en-US-AvaMultilingualNeural",
         "4_Jorge": "es-MX-JorgeNeural", "5_Dalia": "es-MX-DaliaNeural"}
# las 4 formas de escribirlo (cambia cómo lo lee la voz)
FORMAS = ["Afore Pro", "Afóre Pro", "Áfore Pro", "A fore Pro"]
NUM = ["Uno", "Dos", "Tres", "Cuatro"]


async def decir(texto, voz, f):
    for k in range(5):
        try:
            await edge_tts.Communicate(texto, voz, rate="+0%", proxy=os.environ.get("HTTPS_PROXY")).save(f); return
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(2 + 2 * k)


async def main():
    os.makedirs("prueba_afore", exist_ok=True)
    for nombre, voz in VOCES.items():
        partes = []
        for i, forma in enumerate(FORMAS):
            f = f"/tmp/pa_{nombre}_{i}.mp3"
            await decir(f"{NUM[i]}. {forma}, asesoría que impulsa tu futuro.", voz, f)
            partes.append(f)
        filt = "".join(f"[{i}:a]apad=pad_dur=0.6,aresample=48000[a{i}];" for i in range(4)) + "".join(f"[a{i}]" for i in range(4)) + "concat=n=4:v=0:a=1"
        subprocess.run(["ffmpeg", "-v", "error", "-y"] + sum([["-i", p] for p in partes], []) + ["-filter_complex", filt, "-b:a", "128k", f"prueba_afore/voz_{nombre}.mp3"], check=True)
        print(nombre)
asyncio.run(main())
