"""Mezcla del comercial (27 s): canción de Mixkit recortada por compases a 120 BPM, voz Edge TTS,
efectos de Mixkit colocados por su pico medido, y normalización a -14 LUFS.
Uso: python3 mezcla.py   → mezcla.wav"""
import json
import subprocess
import numpy as np

SR = 48000
DUR = 27.0


def leer(path, mono=False):
    cmd = ["ffmpeg", "-v", "error", "-i", path, "-ac", "1" if mono else "2", "-ar", str(SR), "-f", "f32le", "-"]
    x = np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)
    return x.reshape(-1, 1) if mono else x.reshape(-1, 2)


def poner(dst, src, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i < 0:
        src, i = src[-i:], 0
    n = min(len(src), len(dst) - i)
    if n > 0:
        dst[i:i + n] += src[:n] * gain


# --- música: estirada de ~121.96 a 120 BPM y recortada en compases (cada compás = 2.000 s) -------------
cancion = leer("cancion_mixkit_tech_house_vibes.mp3")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "cancion_mixkit_tech_house_vibes.mp3", "-filter:a", f"atempo={120 / 121.96:.6f}",
                "-ar", str(SR), "-ac", "2", "/tmp/cancion120.wav"], check=True)
c120 = leer("/tmp/cancion120.wav")
# (inicio en el video, inicio en la canción estirada, duración): compases 5-7 intro, 8 entra el bajo (drop),
# 40-44 parte ligera (requisitos), 9-13 energía completa
TRAMOS = [(0.0, 10.130, 6.0), (6.0, 16.130, 2.0), (8.0, 80.130, 10.0), (18.0, 18.130, 9.0)]
musica = np.zeros((int(DUR * SR), 2), np.float32)
X = int(0.008 * SR)  # 8 ms de empalme para que no truene
for v0, s0, d in TRAMOS:
    a = int(round(s0 * SR)); n = int(round(d * SR)) + X
    pedazo = c120[a:a + n].copy()
    rampa = np.linspace(0, 1, X, dtype=np.float32)[:, None]
    pedazo[:X] *= rampa; pedazo[-X:] *= rampa[::-1]
    poner(musica, pedazo, v0 - X / SR / 2)
cola = int(0.12 * SR); musica[-cola:] *= np.linspace(1, 0, cola, dtype=np.float32)[:, None]

# --- voz: una toma por frase, en su lugar --------------------------------------------------------------
# cada frase en el segundo que calcula tts.py (su palabra ancla cae en su beat)
VOZ = [(i + 1, l["inicio"]) for i, l in enumerate(json.load(open("voz/palabras.json")))]
voz = np.zeros((int(DUR * SR), 1), np.float32)
for i, t0 in VOZ:
    poner(voz, leer(f"voz/l{i}.mp3", mono=True), t0)
voz = np.repeat(voz, 2, axis=1)

# --- efectos (Mixkit): el pico de cada archivo cae justo en su tiempo ----------------------------------
FX = {k: leer(f"sfx/{f}") for k, f in {
    "click": "sfx-01-click-doble-mouse.wav", "pop": "sfx-02-pop-largo.wav", "whoosh": "sfx-03-whoosh-aire.wav",
    "obturador": "sfx-04-obturador-camara.wav", "gota": "sfx-05-gota-agua-cueva.wav", "impacto": "sfx-06-impacto-grave.mp3",
    "swipe": "sfx-07-swipe-rapido.wav", "tono": "sfx-08-tono-notificacion.wav"}.items()}
PICO = {k: np.argmax(np.abs(v).max(1)) / SR for k, v in FX.items()}
EVENTOS = [
    (0.55, "whoosh", 0.35), (1.0, "pop", 0.5), (1.5, "click", 0.6), (1.85, "obturador", 0.6), (2.0, "obturador", 0.7),
    (2.6, "swipe", 0.35), (2.75, "pop", 0.3), (3.0, "swipe", 0.35), (3.5, "click", 0.6), (3.55, "whoosh", 0.4),
    (4.0, "pop", 0.45), (4.08, "pop", 0.4), (4.16, "pop", 0.4), (4.55, "gota", 0.8), (4.8, "swipe", 0.35),
    (5.1, "click", 0.5), (5.75, "whoosh", 0.4), (6.0, "impacto", 0.9), (6.5, "pop", 0.4), (7.05, "pop", 0.3), (7.5, "swipe", 0.35),
    (8.0, "whoosh", 0.3), (9.0, "pop", 0.3), (9.08, "pop", 0.3), (9.16, "pop", 0.3),
    (10.75, "click", 0.5), (11.0, "whoosh", 0.25), (11.25, "pop", 0.35), (12.5, "tono", 0.25),
    (12.85, "click", 0.5), (13.0, "whoosh", 0.25), (13.25, "pop", 0.35), (14.5, "tono", 0.25),
    (14.85, "click", 0.5), (15.0, "whoosh", 0.25), (15.25, "pop", 0.35), (17.0, "tono", 0.25), (17.5, "swipe", 0.3),
    (18.0, "whoosh", 0.45), (18.55, "gota", 0.6), (19.0, "whoosh", 0.4), (19.25, "swipe", 0.3),
    (20.0, "click", 0.5), (20.5, "pop", 0.4), (20.55, "whoosh", 0.35), (21.0, "pop", 0.35), (21.08, "pop", 0.3), (21.5, "pop", 0.35),
    (21.75, "swipe", 0.35), (21.85, "click", 0.3), (22.1, "click", 0.3), (22.35, "click", 0.3), (22.6, "click", 0.3),
    (23.2, "click", 0.6), (23.3, "whoosh", 0.5), (24.0, "whoosh", 0.45), (24.5, "obturador", 0.7),
    (25.0, "swipe", 0.4), (25.25, "pop", 0.45), (26.15, "obturador", 0.6), (26.35, "whoosh", 0.45), (26.86, "impacto", 0.55),
]
sfx = np.zeros((int(DUR * SR), 2), np.float32)
for t, k, g in EVENTOS:
    x = FX[k] / max(1e-6, np.abs(FX[k]).max())
    poner(sfx, x, t - PICO[k], g)

# --- mezcla: la música baja bajo la voz ------------------------------------------------------------------
# la música baja cuando hay voz: actividad de voz suavizada (entra en 0.1 s, sale en 0.3 s)
act = (np.convolve(np.abs(voz[:, 0]), np.ones(2400) / 2400, mode="same") > 0.004).astype(np.float32)
k = int(0.3 * SR); act = np.convolve(act, np.ones(k) / k, mode="same"); act = np.clip(act * 1.6, 0, 1)
duck = 1 - 0.76 * act
mix = musica * 0.55 * duck[:, None] + voz * 1.0 + sfx * 0.42
for nombre, st in [("musica", musica * 0.55 * duck[:, None]), ("voz", voz), ("efectos", sfx * 0.42)]:  # para revisar el balance
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-", f"/tmp/stem_{nombre}.wav"], input=st.astype(np.float32).tobytes(), check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", str(SR), "mezcla.wav"], input=mix.astype(np.float32).tobytes(), check=True)
def medir(f):
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", f, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
    linea = [l for l in r.splitlines() if l.strip().startswith("I:")][-1]
    return float(linea.split()[1]), r


# loudnorm de una pasada queda cerca; se corrige la ganancia para caer en -14.0 exacto
I, _ = medir("mezcla.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", "mezcla.wav", "-af", f"volume={-14.0 - I:.2f}dB", "/tmp/mezcla_aj.wav"], check=True)
subprocess.run(["mv", "/tmp/mezcla_aj.wav", "mezcla.wav"], check=True)
I, r = medir("mezcla.wav")
print("\n".join(r.strip().splitlines()[-12:]))
json.dump({"picos": PICO}, open("picos_medidos.json", "w"), indent=1)
