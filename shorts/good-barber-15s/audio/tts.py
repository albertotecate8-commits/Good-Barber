"""Voz gratuita para GOOD BARBER (Edge TTS, Brian, la misma del comercial de Afore Pro).
Una toma por frase, con tiempos por palabra. Uso: python3 tts.py → voz/lN.mp3 y voz/palabras.json"""
import asyncio, json, os
import edge_tts
VOZ = "en-US-BrianMultilingualNeural"
# (texto, palabra ancla, segundo del video en que debe sonar esa palabra)
LINEAS = [
    ("Good Barber.", "Good", 0.75),
    ("Tu estilo.", "Tu", 2.15),
    ("Tu personalidad.", "Tu", 2.98),
    ("Tu mejor versión.", "Tu", 4.3),
    ("Conoce nuestros servicios y precios.", "Conoce", 5.55),
    ("Lunes a sábado, de dos de la tarde a ocho de la noche.", "Lunes", 9.62),
    ("Te esperamos en Good Barber.", "Te", 13.22),
]
async def una(i, txt):
    for intento in range(5):
        try:
            c = edge_tts.Communicate(txt, VOZ, rate="+10%", boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
            pal, audio = [], b""
            async for ch in c.stream():
                if ch["type"] == "audio": audio += ch["data"]
                elif ch["type"] == "WordBoundary": pal.append({"w": ch["text"], "s": ch["offset"] / 1e7, "e": (ch["offset"] + ch["duration"]) / 1e7})
            open(f"voz/l{i+1}.mp3", "wb").write(audio)
            return pal
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(2 + 2 * intento)
    raise SystemExit("sin audio: " + txt)
async def main():
    os.makedirs("voz", exist_ok=True)
    res = []
    for i, (t, ancla, seg) in enumerate(LINEAS):
        pal = await una(i, t)
        a = next(p for p in pal if p["w"].strip("¿?.,:").lower() == ancla.lower())
        res.append({"texto": t, "inicio": round(seg - a["s"], 3), "palabras": pal})
    json.dump(res, open("voz/palabras.json", "w"), ensure_ascii=False, indent=1)
    for r in res: print(f'{r["inicio"]:6.2f} → {r["inicio"] + r["palabras"][-1]["e"]:6.2f}  {r["texto"]}')
asyncio.run(main())
