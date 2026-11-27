"""Mezcla del comercial AFORE PRO de 20 s: música original (musica.py) y efectos de Mixkit por su pico medido, a -14 LUFS."""
import subprocess
import numpy as np

SR, DUR = 48000, 20.0


def leer(p):
    return np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout, np.float32).reshape(-1, 2)


def poner(dst, src, t0, g=1.0):
    i = int(round(t0 * SR)); n = min(len(src), len(dst) - i)
    if n > 0 and i >= 0: dst[i:i + n] += src[:n] * g


mus = leer("musica.wav")[: int(DUR * SR)]
FX = {k: leer(f"sfx/{f}") for k, f in {"whoosh": "sfx-03-whoosh-aire.wav", "pop": "sfx-02-pop-largo.wav", "swipe": "sfx-07-swipe-rapido.wav",
      "brillo": "sfx-08-tono-notificacion.wav", "obturador": "sfx-04-obturador-camara.wav"}.items()}
PICO = {k: np.argmax(np.abs(v).max(1)) / SR for k, v in FX.items()}
EVENTOS = [(0.05, "whoosh", 0.6), (1.1, "brillo", 0.25), (2.5, "swipe", 0.3), (2.75, "swipe", 0.25), (3.0, "pop", 0.35), (3.5, "whoosh", 0.4),
           (4.6, "pop", 0.3), (4.75, "swipe", 0.3), (5.75, "pop", 0.35), (6.2, "obturador", 0.3), (7.55, "whoosh", 0.5),
           (8.05, "swipe", 0.3), (8.55, "pop", 0.35), (9.7, "brillo", 0.3), (11.55, "whoosh", 0.5),
           (12.05, "swipe", 0.35), (12.5, "pop", 0.4), (13.25, "pop", 0.4), (14.0, "pop", 0.4), (15.55, "whoosh", 0.5),
           (16.6, "brillo", 0.3), (16.9, "pop", 0.4), (18.6, "brillo", 0.25)]
sfx = np.zeros_like(mus)
for t, k, g in EVENTOS:
    poner(sfx, FX[k] / max(1e-6, np.abs(FX[k]).max()), t - PICO[k], g)
mix = mus * 0.8 + sfx * 0.4
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "/tmp/af_mix.wav"], input=mix.astype(np.float32).tobytes(), check=True)


def medir(f):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float([l for l in r.splitlines() if l.strip().startswith("I:")][-1].split()[1]), r


I, _ = medir("/tmp/af_mix.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "/tmp/af_mix.wav", "-af", f"volume={-14.0 - I:.2f}dB", "mezcla.wav"], check=True)
I, r = medir("mezcla.wav")
print("\n".join(l for l in r.splitlines()[-12:] if "I:" in l or "Peak" in l))
