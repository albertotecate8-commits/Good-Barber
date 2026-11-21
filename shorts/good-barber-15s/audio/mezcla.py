"""Mezcla del comercial GOOD BARBER (15 s): canción de Mixkit estirada a 120 BPM y recortada por compases,
efectos de Mixkit colocados por su pico medido, -14 LUFS. Uso: python3 mezcla.py → mezcla.wav"""
import subprocess
import numpy as np

SR, DUR = 48000, 15.0


def leer(path):
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32)
    return x.reshape(-1, 2)


def poner(dst, src, t0, g=1.0):
    i = int(round(t0 * SR))
    if i < 0: src, i = src[-i:], 0
    n = min(len(src), len(dst) - i)
    if n > 0: dst[i:i + n] += src[:n] * g


subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "cancion_mixkit_tech_house_vibes.mp3", "-filter:a", f"atempo={120 / 121.96:.6f}", "-ar", str(SR), "-ac", "2", "/tmp/gb_c120.wav"], check=True)
c = leer("/tmp/gb_c120.wav")
# compás n de la canción estirada empieza en 0.130 + 2n s. Video 0–2: compás 7 (intro que sube); 2–15: compases 8–14 (entra el bajo en el segundo 2)
mus = np.zeros((int(DUR * SR), 2), np.float32)
X = int(0.008 * SR)
for v0, s0, d in [(0.0, 14.130, 2.0), (2.0, 16.130, 13.0)]:
    a = int(round(s0 * SR)); p = c[a:a + int(round(d * SR)) + X].copy()
    r = np.linspace(0, 1, X, dtype=np.float32)[:, None]; p[:X] *= r; p[-X:] *= r[::-1]
    poner(mus, p, v0 - X / SR / 2)
cola = int(0.6 * SR); mus[-cola:] *= np.linspace(1, 0, cola, dtype=np.float32)[:, None] ** 1.5  # el destello final se apaga

FX = {k: leer(f"sfx/{f}") for k, f in {"pop": "sfx-02-pop-largo.wav", "whoosh": "sfx-03-whoosh-aire.wav", "obturador": "sfx-04-obturador-camara.wav",
      "impacto": "sfx-06-impacto-grave.mp3", "swipe": "sfx-07-swipe-rapido.wav", "brillo": "sfx-08-tono-notificacion.wav"}.items()}
PICO = {k: np.argmax(np.abs(v).max(1)) / SR for k, v in FX.items()}
RT = [5.3 + i * 0.9 for i in range(5)]
EVENTOS = [(0.05, "whoosh", 0.55), (0.62, "impacto", 0.45), (0.8, "brillo", 0.22), (1.3, "brillo", 0.18), (1.75, "whoosh", 0.5),
           (2.0, "impacto", 0.85), (2.1, "swipe", 0.35), (2.95, "swipe", 0.45), (3.95, "swipe", 0.45), (4.25, "obturador", 0.35),
           (4.72, "whoosh", 0.5), (5.0, "impacto", 0.55)] + [(t + 0.12, "impacto", 0.45) for t in RT] + [(t + 0.3, "brillo", 0.14) for t in RT] + [
           (9.62, "whoosh", 0.5), (10.0, "impacto", 0.55), (10.15, "swipe", 0.3), (10.62, "pop", 0.35), (11.6, "whoosh", 0.5),
           (12.0, "impacto", 0.9), (12.45, "brillo", 0.25), (12.55, "pop", 0.3), (12.7, "pop", 0.3), (13.0, "swipe", 0.35), (14.4, "brillo", 0.35), (14.45, "whoosh", 0.4)]
sfx = np.zeros_like(mus)
for t, k, g in EVENTOS:
    x = FX[k] / max(1e-6, np.abs(FX[k]).max()); poner(sfx, x, t - PICO[k], g)
mix = mus * 0.7 + sfx * 0.45
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "/tmp/gb_mix.wav"], input=mix.astype(np.float32).tobytes(), check=True)


def medir(f):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([l for l in r.splitlines() if l.strip().startswith("I:")][-1].split()[1]), r


I, _ = medir("/tmp/gb_mix.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "/tmp/gb_mix.wav", "-af", f"volume={-14.0 - I:.2f}dB", "mezcla.wav"], check=True)
I, r = medir("mezcla.wav")
print("\n".join(l for l in r.splitlines()[-12:] if "I:" in l or "Peak" in l))
