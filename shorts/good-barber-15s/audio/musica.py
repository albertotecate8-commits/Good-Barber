"""Música original para GOOD BARBER (15 s, 120 BPM, re menor): beat moderno y elegante.
808 con caída de tono, bombo, palmada en 2 y 4, hi-hats con redobles, acordes de piano oscuro y un pad.
Intro sin batería (0–2 s) con subida; entra todo en el segundo 2; cada cambio de escena lleva un golpe.
Uso: python3 musica.py → musica.wav"""
import numpy as np
import wave

SR, DUR, BEAT = 48000, 15.0, 0.5
N = int(DUR * SR)
rng = np.random.default_rng(7)
t_all = np.arange(N) / SR


def tt(d): return np.arange(int(d * SR)) / SR


def put(buf, x, t, g=1.0):
    i = int(round(t * SR)); n = min(len(x), len(buf) - i)
    if n > 0 and i >= 0: buf[i:i + n] += x[:n] * g


from scipy.signal import lfilter


def lowpass(x, fc):  # un polo, suficiente para suavizar
    a = np.exp(-2 * np.pi * fc / SR)
    return lfilter([1 - a], [1, -a], x)


def m2f(m): return 440 * 2 ** ((m - 69) / 12)


def kick():
    t = tt(0.45); f = 48 + 110 * np.exp(-t * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * 1.0 + rng.standard_normal(len(t)) * np.exp(-t * 300) * 0.15


def b808(f0, d):
    t = tt(d); f = f0 * (1 + 0.6 * np.exp(-t * 40))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.minimum(1, t * 200) * np.exp(-t * 1.1)
    return np.tanh(x * 2.2) * 0.8


def clap():
    t = tt(0.3); n = rng.standard_normal(len(t))
    e = sum(np.exp(-np.maximum(0, t - k) * 120) * (t >= k) for k in (0, 0.011, 0.022)) + np.exp(-t * 18) * 0.6
    x = n * e; x = x - lowpass(x, 900)
    return x * 0.5


def hat(d=0.06, g=1.0):
    t = tt(d); n = rng.standard_normal(len(t)); x = n - lowpass(n, 7000)
    return x * np.exp(-t * 70) * 0.4 * g


def piano(midi, d=1.6, v=0.5):
    t = tt(d); f = m2f(midi); x = np.zeros(len(t))
    for k, a in [(1, 1), (2, 0.45), (3, 0.22), (4, 0.12), (5, 0.06)]:
        x += a * np.sin(2 * np.pi * f * k * t * (1 + 0.0004 * k * k)) * np.exp(-t * (1.6 + k * 0.9))
    return x * np.minimum(1, t * 400) * v * 1.05


def pad(midis, d, v=0.25):
    t = tt(d); x = np.zeros(len(t))
    for m in midis:
        for det in (-0.12, 0.0, 0.12):
            ph = 2 * np.pi * m2f(m + det) * t
            x += (2 * ((ph / (2 * np.pi)) % 1) - 1)  # sierra
    x = lowpass(x / (3 * len(midis)), 1100)
    env = np.minimum(1, t / 0.35) * np.minimum(1, (d - t) / 0.4)
    return x * env * v * 1.6


def riser(d):
    t = tt(d); n = rng.standard_normal(len(t)); parts = np.array_split(np.arange(len(t)), 24)
    x = np.concatenate([n[ix] - lowpass(n[ix], 300 + 5000 * (k / 24) ** 2) for k, ix in enumerate(parts)])  # el filtro abre poco a poco
    return x * (t / d) ** 2.5 * 0.35


def impact():
    t = tt(1.8); boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-t * 9)) / SR) * np.exp(-t * 2.2)
    n = rng.standard_normal(len(t)); noise = lowpass(n, 2500) * np.exp(-t * 6) * 0.4
    return np.tanh((boom + noise) * 1.6) * 0.8


L = np.zeros(N); R = np.zeros(N)
def both(x, t, g=1.0, p=0.0): put(L, x, t, g * (1 - p) ** 0.5 * 1.2); put(R, x, t, g * (1 + p) ** 0.5 * 1.2)


# acordes por compás (2 s): Dm – Bb – Gm – A
CH = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]]
ROOT = [38, 34, 31, 33]
for bar in range(8):
    t0 = bar * 2.0; c = CH[bar % 4]
    both(pad([m + 12 for m in c], 2.05, 0.22 if bar else 0.3), t0, 1.0)
    # piano: arpegio sobrio en corcheas
    for k, m in enumerate([c[0] + 12, c[1] + 12, c[2] + 12, c[1] + 12]):
        both(piano(m, 1.2, 0.55 if bar else 0.75), t0 + k * 0.5, 1.0, -0.3 + 0.2 * k)
    if t0 >= 2.0 and t0 < 15:
        both(b808(m2f(ROOT[bar % 4]), 1.9), t0, 0.9)
        both(b808(m2f(ROOT[bar % 4]), 0.45), t0 + 1.5, 0.6)
        for b in range(4):
            tb = t0 + b * 0.5
            if b in (0, 3) or (b == 2 and bar % 2): both(kick(), tb, 0.95)
            if b in (1, 3): both(clap(), tb, 0.75)
        for h in range(16):  # hi-hats en semicorcheas, con redoble al final de cada 2 compases
            th = t0 + h * 0.125
            both(hat(0.05, 0.9 if h % 2 == 0 else 0.55), th, 1.0, 0.35)
        if bar % 2 == 1:
            for r in range(6): both(hat(0.03, 0.7), t0 + 1.625 + r * 0.0625, 1.0, 0.35)
both(riser(1.9), 0.1, 1.0)              # sube hacia la entrada del bajo
for ti, g in [(2.0, 1.0), (5.0, 0.6), (10.0, 0.6), (12.0, 0.9)]: both(impact(), ti, g)
# final: se queda el acorde y se apaga con el destello
fade = np.ones(N); i0 = int(14.3 * SR); fade[i0:] = np.linspace(1, 0, N - i0) ** 1.6
x = np.stack([L * fade, R * fade], 1)
x = np.tanh(x / max(1e-6, np.abs(x).max()) * 1.4) * 0.8
with wave.open("musica.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
print("musica.wav", x.shape[0] / SR, "s")
