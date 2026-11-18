"""Voz gratuita (Edge TTS, en-US-BrianMultilingualNeural hablando español), elegida por el cliente.
Una toma por frase, con tiempos por palabra. Uso: python3 tts.py → voz/lN.mp3 y voz/palabras.json"""
import asyncio, json, os
import edge_tts
VOZ = "en-US-BrianMultilingualNeural"
# (texto, palabra ancla, segundo del video en que debe sonar esa palabra)
LINEAS = [
    ("¿Sabías que existe el retiro por desempleo?", "Sabías", 2.0),
    ("Podrías retirar hasta treinta y cinco mil ciento noventa y tres pesos de tu Afore.", "treinta", 6.0),
    ("Solo tres requisitos:", "Solo", 9.6),
    ("No estar dado de alta en el IMSS.", "No", 11.22),
    ("Cien semanas cotizadas.", "Cien", 13.45),
    ("Y cinco años desde tu último retiro por desempleo.", "cinco", 15.35),
    ("Afore Pro te asesora y te acompaña en todo el trámite.", "Afore", 19.0),
    ("Escríbenos hoy por WhatsApp.", "Escríbenos", 24.7),
]
async def una(i, txt):
    for intento in range(5):
        try:
            c = edge_tts.Communicate(txt, VOZ, rate="+5%", boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
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
