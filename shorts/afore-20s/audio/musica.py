"""Música original para AFORE PRO (20 s, 120 BPM, Re mayor): cálida y de confianza.
Piano en arpegios, cuerdas suaves, bajo redondo, batería ligera (bombo suave, chasquidos, shaker)
y una campana en los momentos clave. Crece poco a poco y resuelve en Re mayor sobre el logo.
Uso: python3 musica.py → musica.wav"""
import wave
import numpy as np
from scipy.signal import lfilter

SR, DUR = 48000, 20.0
N = int(DUR * SR)
rng = np.random.default_rng(11)


def tt(d): return np.arange(int(d * SR)) / SR
def m2f(m): return 440 * 2 ** ((m - 69) / 12)
def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); return lfilter([1 - a], [1, -a], x)


L = np.zeros(N); R = np.zeros(N)
def put(x, t, g=1.0, p=0.0):
    i = int(round(t * SR)); n = min(len(x), N - i)
    if n > 0 and i >= 0: L[i:i + n] += x[:n] * g * (1 - p); R[i:i + n] += x[:n] * g * (1 + p)


def piano(m, d=2.0, v=0.5):
    t = tt(d); f = m2f(m); x = np.zeros(len(t))
    for k, a in [(1, 1), (2, 0.5), (3, 0.25), (4, 0.14), (5, 0.07), (6, 0.04)]:
        x += a * np.sin(2 * np.pi * f * k * t * (1 + 0.0003 * k * k)) * np.exp(-t * (1.1 + 0.7 * k))
    x += 0.15 * np.sin(2 * np.pi * f * 1.003 * t) * np.exp(-t * 1.0)  # leve coro
    return lowpass(x * np.minimum(1, t * 300), 5000) * v


def strings(ms, d, v=0.25):
    t = tt(d); x = np.zeros(len(t))
    for m in ms:
        for det in (-0.08, 0.0, 0.08):
            ph = (m2f(m + det) * t) % 1; x += 2 * ph - 1
    x = lowpass(lowpass(x / (3 * len(ms)), 1500), 2200)
    vib = 1 + 0.03 * np.sin(2 * np.pi * 5 * t)
    return x * vib * np.minimum(1, t / 0.6) * np.minimum(1, (d - t) / 0.5) * v


def bass(m, d, v=0.5):
    t = tt(d); f = m2f(m); x = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return x * np.minimum(1, t * 80) * np.exp(-t * 0.7) * np.minimum(1, (d - t) / 0.05) * v


def kick(v=0.6):
    t = tt(0.35); f = 50 + 70 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * v


def snap(v=0.35):
    t = tt(0.15); n = rng.standard_normal(len(t)); x = n - lowpass(n, 1800)
    return lowpass(x, 6000) * np.exp(-t * 45) * v


def shaker(v=0.12):
    t = tt(0.09); n = rng.standard_normal(len(t)); x = n - lowpass(n, 5000)
    return x * np.sin(np.pi * np.clip(t / 0.09, 0, 1)) ** 2 * v


def bell(m, v=0.35):
    t = tt(2.5); f = m2f(m)
    x = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * dmp) for k, a, dmp in [(1, 1, 1.6), (2.76, 0.4, 3), (5.4, 0.2, 5)])
    return x * np.minimum(1, t * 500) * v


def swell(d, v=0.3):  # subida suave de ruido filtrado (para transiciones)
    t = tt(d); n = rng.standard_normal(len(t)); parts = np.array_split(np.arange(len(t)), 20)
    x = np.concatenate([lowpass(n[ix], 300 + 3000 * (k / 20) ** 2) for k, ix in enumerate(parts)])
    return x * (t / d) ** 2 * v


def soft_boom(v=0.5):
    t = tt(2.0); return np.sin(2 * np.pi * np.cumsum(45 + 25 * np.exp(-t * 6)) / SR) * np.exp(-t * 2.5) * v


# Re mayor: D – A – Bm – G (I – V – vi – IV), un acorde por compás (2 s)
CH = [[62, 66, 69], [61, 64, 69], [62, 66, 71], [62, 67, 71]]
ROOT = [38, 45, 47, 43]
for bar in range(10):
    t0 = bar * 2.0; c = CH[bar % 4]
    lvl = 0.75 if t0 < 4 else 1.0
    # piano: arpegio en corcheas (raíz abajo, notas del acorde arriba)
    pat = [c[0] - 12, c[1], c[2], c[1] + 12, c[2], c[1], c[0] + 12, c[1]]
    for k, m in enumerate(pat): put(piano(m, 1.6, 0.42 * lvl), t0 + k * 0.25, 1.0, -0.25 + 0.5 * (k % 2))
    put(strings([m - 12 for m in c] + [c[0]], 2.1, 0.22 if t0 < 4 else 0.3), t0, 1.0)
    if t0 >= 4.0:
        put(bass(ROOT[bar % 4], 1.95, 0.45), t0)
        for b in range(4):
            tb = t0 + b * 0.5
            if b in (0, 2): put(kick(0.55), tb)
            if b in (1, 3): put(snap(0.3), tb, 1.0, 0.15)
        for h in range(8): put(shaker(0.12 if h % 2 else 0.07), t0 + h * 0.25 + 0.125, 1.0, -0.3)
    if t0 >= 16.0:  # el cierre se abre: cuerdas una octava arriba
        put(strings(c, 2.1, 0.18), t0, 1.0)
put(swell(3.6, 0.25), 0.3)
put(swell(1.8, 0.2), 14.1)
for ti, g in [(4.0, 0.5), (8.0, 0.35), (12.0, 0.3), (16.0, 0.5)]: put(soft_boom(g), ti)
# campanas en momentos clave: logo, «ENERO», la cifra, cada requisito, WhatsApp
for ti, m in [(1.1, 78), (4.75, 81), (9.6, 78), (9.75, 83), (12.5, 74), (13.25, 76), (14.0, 78), (17.0, 81), (17.25, 86)]:
    put(bell(m, 0.22), ti, 1.0, 0.2)
# final: acorde de Re mayor que se sostiene y se apaga
put(strings([50, 54, 57, 62], 1.9, 0.3), 18.0)
x = np.stack([L, R], 1)
fade = np.ones(N); i0 = int(19.2 * SR); fade[i0:] = np.linspace(1, 0, N - i0) ** 1.5
x = x * fade[:, None]
x = np.tanh(x / max(1e-6, np.abs(x).max()) * 1.2) * 0.85
with wave.open("musica.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
print("musica.wav", N / SR, "s")
