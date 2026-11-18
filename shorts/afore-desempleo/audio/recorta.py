# Quita las pausas largas de la narración (deja ~0.16 s entre frases y ~0.12 s en comas)
# y recalcula los tiempos por palabra. Entrada: voz_edge.mp3, palabras_edge.json
# Salida: voz.wav (48 kHz) y ../src/palabras.json  (todo el video se sincroniza con ese archivo)
import json, subprocess, numpy as np, wave
SR = 48000
raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", "voz_edge.mp3", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
W = json.load(open("palabras_edge.json"))
LEAD = 0.05  # la voz empieza casi en el cuadro 1
keep, t_out, out = [], 0.0, []
cur = max(0, W[0]["s"] - LEAD)
for i, w in enumerate(W):
    if i + 1 < len(W):
        g = W[i + 1]["s"] - w["e"]
        target = 0.16 if g > 0.6 else 0.12 if g > 0.22 else g
        if g > target:
            cut_a = w["e"] + target / 2; cut_b = W[i + 1]["s"] - target / 2
            keep.append((cur, cut_a)); cur = cut_b
keep.append((cur, W[-1]["e"] + 0.25))
# mapa de tiempo viejo -> nuevo
def remap(t):
    acc = 0.0
    for a, b in keep:
        if t <= b: return acc + max(0, t - a)
        acc += b - a
    return acc
fade = int(0.006 * SR); parts = []
for a, b in keep:
    seg = x[int(a * SR): int(b * SR)].copy()
    if len(seg) > 2 * fade:
        seg[:fade] *= np.linspace(0, 1, fade); seg[-fade:] *= np.linspace(1, 0, fade)
    parts.append(seg)
y = np.concatenate(parts)
y = y / (np.abs(y).max() + 1e-9) * 0.89
with wave.open("voz.wav", "wb") as f:
    f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((y * 32767).astype(np.int16).tobytes())
out = [{"w": w["w"], "s": round(remap(w["s"]), 3), "e": round(remap(w["e"]), 3)} for w in W]
dur = len(y) / SR
json.dump({"dur": round(dur, 3), "words": out}, open("../src/palabras.json", "w"), ensure_ascii=False, indent=0)
print("duración", round(dur, 2), "s;", len(out), "palabras;", round(len(out) / dur, 2), "palabras/s")
