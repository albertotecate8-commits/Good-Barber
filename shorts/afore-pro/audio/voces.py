# Arma el diálogo con las tomas de voz de ElevenLabs y saca los tiempos que usa la animación.
# Entrada: voces/chuy.wav y voces/ana.wav (cada una con sus 3 frases, separadas por silencios).
# Salida: voz.wav (diálogo armado), ../src/videos/afore/lineas.json (tiempos por palabra) y
#         ../src/videos/afore/boca.json (apertura de boca 0..3 por cuadro y personaje, del volumen de la voz).
# Los tiempos por palabra se reparten dentro de cada frase según las sílabas aproximadas de cada palabra;
# revisa y corrige a mano si hace falta.
import json, re
import numpy as np
from dsp import SR, ns, read_wav, write_wav, lp

FPS = 30
TXT = json.load(open("../src/videos/afore/lineas.json"))["lines"]
ORDER = [("chuy", 0), ("ana", 0), ("chuy", 1), ("ana", 1), ("chuy", 2), ("ana", 2)]
LEAD, GAP, TAIL = 1.45, 0.28, 1.5  # inicio (se ve la Catedral), pausa entre frases, cola final


def load(path):
    x, sr = read_wav(path)
    assert sr == SR, sr
    return x.mean(axis=0)


def segments(x, n_expected):
    """frases separadas por silencios: umbral sobre la envolvente; se queda con las n más largas en orden"""
    env = np.sqrt(np.maximum(lp(x * x, 30), 0))
    thr = 0.06 * np.percentile(env, 99)
    on = env > thr
    # cierra huecos cortos (< 0.35 s) dentro de una frase
    idx = np.flatnonzero(on)
    segs = []
    start = idx[0]; prev = idx[0]
    for i in idx[1:]:
        if i - prev > int(0.35 * SR):
            segs.append([start, prev]); start = i
        prev = i
    segs.append([start, prev])
    segs = [s for s in segs if s[1] - s[0] > int(0.25 * SR)]
    while len(segs) > n_expected:  # junta el hueco más corto
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        k = int(np.argmin(gaps)); segs[k] = [segs[k][0], segs[k + 1][1]]; del segs[k + 1]
    assert len(segs) == n_expected, f"esperaba {n_expected} frases, encontré {len(segs)}"
    pad = int(0.04 * SR)
    return [x[max(0, a - pad): b + pad] for a, b in segs], env, thr


def syll(w):
    return max(1, len(re.findall(r"[aeiouáéíóúü]+", w.lower())))


src = {w: segments(load(f"voces/{w}.wav"), 3)[0] for w in ("chuy", "ana")}
t = LEAD
lines, parts = [], []
for (who, k), base in zip(ORDER, TXT):
    seg = src[who][k]
    d = len(seg) / SR
    # palabras: reparte el tiempo útil por sílabas (con 0.04 s de margen a cada lado)
    words = base["text"].split()
    sy = np.array([syll(w) + 0.35 for w in words], float)
    edges = 0.04 + (d - 0.08) * np.concatenate([[0], np.cumsum(sy) / sy.sum()])
    ws = [{"w": w, "s": round(t + edges[i], 3), "e": round(t + edges[i + 1] - 0.02, 3)} for i, w in enumerate(words)]
    lines.append({"who": who, "text": base["text"], "s": ws[0]["s"], "e": ws[-1]["e"], "words": ws})
    parts.append((who, t, seg))
    t += d + GAP
dur = round(t - GAP + TAIL, 2)
voz = np.zeros(ns(dur))
track = {"chuy": np.zeros(ns(dur)), "ana": np.zeros(ns(dur))}
for who, ts, seg in parts:
    i = ns(ts)
    voz[i:i + len(seg)] += seg
    track[who][i:i + len(seg)] += seg
write_wav("voz.wav", voz)
json.dump({"provisional": False, "lines": lines, "dur": dur}, open("../src/videos/afore/lineas.json", "w"), ensure_ascii=False, indent=1)

# boca: volumen por cuadro -> 0..3
boca = {}
nf = int(round(dur * FPS))
for who, x in track.items():
    env = np.sqrt(np.maximum(lp(x * x, 12), 0))
    ref = np.percentile(env[env > 1e-4], 90) if np.any(env > 1e-4) else 1
    lv = []
    for f in range(nf):
        a, b = ns(f / FPS), ns((f + 1) / FPS)
        v = float(env[a:b].mean()) / ref if b > a else 0
        lv.append(0 if v < 0.12 else 1 if v < 0.35 else 2 if v < 0.7 else 3)
    boca[who] = lv
json.dump(boca, open("../src/videos/afore/boca.json", "w"))
print("duración", dur, "s;", [(l["who"], l["s"], l["e"]) for l in lines])
