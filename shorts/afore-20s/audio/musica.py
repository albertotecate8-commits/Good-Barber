"""Música original para AFORE PRO (20 s, 120 BPM, mi menor): electrónica corporativa épica.
808 con caída de tono, bombo, palmada en 2 y 4, hi-hats con redobles, acordes de piano oscuro y un pad.
Intro sin batería (0–2 s) con subida; entra todo en el segundo 2; cada cambio de escena lleva un golpe.
Uso: python3 musica.py → musica.wav"""
import numpy as np
import wave

SR, DUR, BEAT = 48000, 20.0, 0.5
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


# acordes por compás (2 s): Em – C – G – D
CH = [[52, 55, 59], [48, 52, 55], [43, 47, 50], [50, 54, 57]]
ROOT = [40, 36, 43, 38]


def pluck(midi, d=0.22, v=0.5):  # sierra filtrada corta para el arpegio
    t = tt(d); ph = (m2f(midi) * t) % 1
    return lowpass((2 * ph - 1) * np.exp(-t * 14), 2600) * v


def coin_clink(v=0.5):  # moneda: parciales metálicas
    t = tt(0.6); x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t * dmp) for f, a, dmp in [(3150, 1, 9), (4720, .6, 12), (6600, .4, 16), (8100, .25, 20)])
    return x * v * 0.3


for bar in range(10):
    t0 = bar * 2.0; c = CH[bar % 4]
    full = t0 >= 4.0
    both(pad([m + 12 for m in c] + [c[0]], 2.05, 0.28 if full else 0.34), t0, 1.0)
    for k in range(16 if full else 8):  # arpegio en semicorcheas (en la intro, corcheas)
        st = 0.125 if full else 0.25
        m = [c[0], c[1], c[2], c[1] + 12][k % 4] + 24
        both(pluck(m, 0.2, 0.55 if full else 0.4), t0 + k * st, 1.0, -0.4 + 0.8 * ((k % 4) / 3))
    if full:
        both(b808(m2f(ROOT[bar % 4]), 1.9), t0, 0.75)
        for b in range(4):
            tb = t0 + b * 0.5
            both(kick(), tb, 1.0)                       # bombo en cada golpe
            if b in (1, 3): both(clap(), tb, 0.7)
            both(hat(0.12, 1.1), tb + 0.25, 1.0, 0.3)   # hi-hat abierto a contratiempo
        for h in range(16): both(hat(0.04, 0.45), t0 + h * 0.125, 1.0, -0.3)
both(riser(3.8), 0.1, 1.1)                             # sube hacia la explosión del segundo 4
both(riser(1.8), 14.1, 0.8)                            # sube hacia el cierre
for ti, g in [(4.0, 1.0), (8.0, 0.8), (12.0, 0.7), (16.0, 1.0)]: both(impact(), ti, g)
for ti in [4.5 + 0.3 * i for i in range(10)] + [8.75 + 0.09 * i for i in range(7)]: both(coin_clink(0.6), ti, 1.0, (hash_ := (ti * 7) % 1) - 0.5)
# final: se queda el acorde y se apaga con el destello
fade = np.ones(N); i0 = int(19.3 * SR); fade[i0:] = np.linspace(1, 0, N - i0) ** 1.6
x = np.stack([L * fade, R * fade], 1)
x = np.tanh(x / max(1e-6, np.abs(x).max()) * 1.4) * 0.8
with wave.open("musica.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())
print("musica.wav", x.shape[0] / SR, "s")
