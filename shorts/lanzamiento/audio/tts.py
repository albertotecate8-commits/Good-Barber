"""Voz gratuita (Edge TTS, es-MX-JorgeNeural): una toma por frase, con tiempos por palabra.
Uso: python3 tts.py   → voz/l1.mp3 ... voz/l5.mp3 y voz/palabras.json"""
import asyncio, json, os, sys
import edge_tts
LINEAS = [
    "¿Estás sin empleo y necesitas dinero?",
    "Podrías retirar hasta treinta y cinco mil ciento noventa y tres pesos de tu Afore.",
    "Solo necesitas cumplir tres requisitos: no estar dado de alta en el IMSS, tener mínimo cien semanas cotizadas, y que hayan pasado cinco años desde tu último retiro por desempleo.",
    "En Afore Pro te ayudamos a conocer tus opciones, y te acompañamos durante el proceso.",
    "Contacta hoy a Afore Pro. Estamos para asesorarte.",
]
RATES = ["+8%", "+8%", "+18%", "+12%", "+12%"]  # la frase de requisitos va un poco más rápida para caber
async def una(i, txt):
    c = edge_tts.Communicate(txt, "es-MX-JorgeNeural", rate=RATES[i], boundary="WordBoundary", proxy=os.environ.get("HTTPS_PROXY"))
    pal, audio = [], b""
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary": pal.append({"w": ch["text"], "s": ch["offset"] / 1e7, "e": (ch["offset"] + ch["duration"]) / 1e7})
    open(f"voz/l{i+1}.mp3", "wb").write(audio)
    return pal
async def main():
    os.makedirs("voz", exist_ok=True)
    res = [await una(i, t) for i, t in enumerate(LINEAS)]
    json.dump(res, open("voz/palabras.json", "w"), ensure_ascii=False, indent=1)
asyncio.run(main())
