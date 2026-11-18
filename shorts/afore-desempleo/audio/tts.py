# Genera la narración con Edge TTS (gratis) y guarda los tiempos por palabra.
# Uso: python tts.py [velocidad, p. ej. +8%]  -> voz_edge.mp3, palabras_edge.json
import asyncio, json, os, sys
import edge_tts
RATE = sys.argv[1] if len(sys.argv) > 1 else "+0%"
TEXT = " ".join(open("guion.txt", encoding="utf-8").read().split())
async def main():
    c = edge_tts.Communicate(TEXT, "es-MX-JorgeNeural", rate=RATE, boundary="WordBoundary",
                             proxy=os.environ.get("HTTPS_PROXY"))
    words, audio = [], bytearray()
    async for ch in c.stream():
        if ch["type"] == "audio": audio += ch["data"]
        elif ch["type"] == "WordBoundary":
            s = ch["offset"] / 1e7; words.append({"w": ch["text"], "s": round(s, 3), "e": round(s + ch["duration"] / 1e7, 3)})
    open("voz_edge.mp3", "wb").write(audio)
    json.dump(words, open("palabras_edge.json", "w"), ensure_ascii=False, indent=0)
    print(len(words), "palabras; última termina en", words[-1]["e"], "s")
asyncio.run(main())
