"""Narrador del comercial de 20 s: Brian (Edge TTS, gratis), la voz que el cliente eligió para Afore Pro.
Una toma por frase, con tiempos por palabra. Uso: python3 tts.py → voz/lN.mp3 y voz/palabras.json"""
import asyncio, json, os
import edge_tts
VOZ = "en-US-BrianMultilingualNeural"
# (texto, palabra ancla, segundo del video en que debe sonar esa palabra)
LINEAS = [  # narrador: lee lo que dice el video, cada frase en su escena
    ("Afore Pro, asesoría que impulsa tu futuro.", "Afore", 0.85),
    ("¡Inicia enero con más dinero!", "Inicia", 4.45),
    ("Retira de tu Afore por desempleo hasta treinta y cinco mil ciento noventa y tres pesos.", "Retira", 7.55, "+10%"),
    ("No haber retirado en cinco años, no estar vigente en el IMSS, y mínimo dos años cotizados.", "No", 12.35, "+14%"),
    ("Contáctanos por WhatsApp.", "Contáctanos", 17.88),
]
async def una(i, txt, rate="+5%"):
    for intento in range(5):
        try:
            c = edge_tts.Communicate(txt, VOZ, rate=rate, boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
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
    for i, (t, ancla, seg, *r) in enumerate(LINEAS):
        pal = await una(i, t, r[0] if r else "+5%")
        a = next(p for p in pal if p["w"].strip("¿?.,:").lower() == ancla.lower())
        res.append({"texto": t, "inicio": round(seg - a["s"], 3), "palabras": pal})
    json.dump(res, open("voz/palabras.json", "w"), ensure_ascii=False, indent=1)
    for r in res: print(f'{r["inicio"]:6.2f} → {r["inicio"] + r["palabras"][-1]["e"]:6.2f}  {r["texto"]}')
asyncio.run(main())
