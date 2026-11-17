# Música original y alegre estilo mariachi para el short de Afore Pro (sintetizada aquí con numpy):
# guitarrón (bajo pulsado), vihuela (rasgueo en contratiempo), dos trompetas en terceras y glockenspiel en las monedas.
# Fa mayor, 126 bpm en 2/4. Debajo del diálogo va suave (sin trompetas al frente); en "¡Que llueva el dinerito!"
# entra el tutti con trompetas, y cierra con un acorde final en el logo.
# Uso: python musica.py  -> music.wav, sfx.wav (monedas, whooshes)   (lee ../src/videos/afore/lineas.json)
import json
import numpy as np
from dsp import SR, ns, rng, pan, place, fades, make_ir, convolve_st, write_wav, dbg
import instruments as I
from sfx_gen import clink, whoosh

D = json.load(open("../src/videos/afore/lineas.json"))
L = D["lines"]
DUR = D["dur"]
def word_t(li, needle):
    for w in L[li]["words"]:
        if needle in w["w"].lower():
            return w["s"]
    return L[li]["s"]
COIN_T = word_t(4, "llueva") - 0.1
LOGO_T = L[5]["s"] - 0.25

BPM = 126
Q = 60 / BPM          # negra
E = Q / 2             # corchea
BAR = 2 * Q
m2f = I.m2f

# progresión por compás (8 compases que se repiten)
PROG = ["F", "F", "C7", "C7", "F", "Bb", "C7", "F"]
CH = {"F": [65, 69, 72], "Bb": [65, 70, 74], "C7": [64, 67, 70, 72]}
ROOT = {"F": (41, 48), "Bb": (46, 41), "C7": (36, 43)}  # (raíz, quinta) del guitarrón
# melodía: (compás, corchea 0..3, duración en corcheas, midi)
MEL = [
    (0, 0, 1, 72), (0, 1, 1, 69), (0, 2, 1, 72), (0, 3, 1, 77),
    (1, 0, 1, 76), (1, 1, 1, 74), (1, 2, 2, 72),
    (2, 0, 1, 70), (2, 1, 1, 67), (2, 2, 1, 70), (2, 3, 1, 76),
    (3, 0, 1, 74), (3, 1, 1, 72), (3, 2, 2, 70),
    (4, 0, 1, 69), (4, 1, 1, 72), (4, 2, 1, 77), (4, 3, 1, 81),
    (5, 0, 1, 79), (5, 1, 1, 77), (5, 2, 1, 76), (5, 3, 1, 74),
    (6, 0, 1, 72), (6, 1, 1, 76), (6, 2, 1, 79), (6, 3, 1, 82),
    (7, 0, 2, 81), (7, 2, 2, 77),
]
SCALE = [65, 67, 69, 70, 72, 74, 76]
def third_below(m):
    pcs = [s % 12 for s in SCALE]
    i = pcs.index(m % 12) if m % 12 in pcs else 0
    j = (i - 2) % 7
    d = (pcs[i] - pcs[j]) % 12
    return m - d

N = ns(DUR + 2)
bed = np.zeros((2, N))     # guitarrón + vihuela
lead = np.zeros((2, N))    # trompetas
spark = np.zeros((2, N))   # glock
r = rng(5)

t0 = 0.0
nbars = int(np.ceil((DUR + 1) / BAR))
for b in range(nbars):
    tb = t0 + b * BAR
    if tb > DUR - 0.2:
        break
    ch = PROG[b % 8]
    big = tb >= COIN_T - 0.05
    # guitarrón: raíz en 1, quinta en 2
    for k, m in enumerate(ROOT[ch]):
        place(bed, pan(I.pluck(m2f(m), vel=0.95 if big else 0.8, r=r, dur=0.7, bright=0.35, pos=0.22), -0.1), tb + k * Q)
    # vihuela: rasgueo en los contratiempos (y en los tiempos, suave)
    for k in range(4):
        tt_ = tb + k * E
        vel = (0.5 if k % 2 else 0.22) * (1.25 if big else 1.0)
        for j, m in enumerate(CH[ch]):
            place(bed, pan(I.pluck(m2f(m + 12 * (j == 0)), vel=vel, r=r, dur=0.28, bright=0.9, pos=0.12), 0.35), tt_ + j * 0.008)

def trumpets(t_start, bars, vel, gate=0.85):
    for (bb, e, ln, m) in MEL:
        if bb >= bars:
            continue
        ts = t_start + bb * BAR + e * E
        if ts > DUR - 0.1:
            continue
        d = ln * E * gate
        place(lead, pan(I.brass(m2f(m), d, vel=vel, r=r, kind="stab", scoop=-30), -0.25), ts)
        place(lead, pan(I.brass(m2f(third_below(m)), d, vel=vel * 0.8, r=r, kind="stab", scoop=-30), 0.25), ts + 0.012)

# entrada: trompetas cortas (sólo el primer compás) mientras se ve la Catedral; luego bajan para el diálogo
trumpets(0.0, 1, 0.55)
# debajo del diálogo: la melodía en glock muy suave, cada 8 compases
for k in range(1, 8):
    ts = k * 8 * BAR
    if ts >= COIN_T - 1:
        break
    for (bb, e, ln, m) in MEL:
        tm = ts + bb * BAR + e * E
        if tm < COIN_T - 0.2:
            place(spark, pan(I.glock(m2f(m + 12), vel=0.18, r=r, dur=1.0), 0.2), tm)
# tutti con las monedas: alineado al siguiente compás
tb_coin = np.ceil((COIN_T - 0.05) / BAR) * BAR
tb_coin = tb_coin if tb_coin - COIN_T < 0.35 else tb_coin - BAR / 2
trumpets(tb_coin, 8, 0.85)
for (bb, e, ln, m) in MEL:
    tm = tb_coin + bb * BAR + e * E
    if tm < DUR - 0.2:
        place(spark, pan(I.glock(m2f(m + 12), vel=0.45, r=r, dur=1.2), 0.3), tm)

# acorde final en el último tiempo fuerte
t_end = DUR - 0.9
for m in [65, 69, 72, 77]:
    place(lead, pan(I.brass(m2f(m), 0.75, vel=0.9, r=r, kind="stab", scoop=-40, fall=0.0), 0.0), t_end)
for m in [41, 53]:
    place(bed, I.pluck(m2f(m), vel=1.0, r=r, dur=1.4, bright=0.4), t_end)

ir = make_ir(1.1, 3, pre=0.01)
mix = bed * 1.0 + lead * 0.55 + spark * 0.7
wet = convolve_st(mix, ir)[:, :N]
music = mix + 0.18 * wet
# a lo largo del diálogo la música va más abajo; sube en el tutti
env = np.ones(N)
tt = np.arange(N) / SR
env *= np.where(tt < L[0]["s"] - 0.1, 1.0, 0.55)
env = np.where(tt >= COIN_T - 0.15, 1.0, env)
k = int(0.12 * SR)
env = np.convolve(env, np.ones(k) / k, mode="same")
music *= env[None, :]
music = fades(music[:, : ns(DUR)], 0.01, 0.6)
music /= np.max(np.abs(music)) + 1e-9
write_wav("music.wav", music * 0.8)

# ---------------- efectos: monedas y whooshes ----------------
sfx = np.zeros((2, ns(DUR)))
rr = rng(11)
import math
def rnd(i, k):
    x = math.sin(i * 127.1 + k * 311.7) * 43758.5453
    return x - math.floor(x)
# cada moneda que cae "tintinea" al tocar el suelo (mismo horario que story.ts)
for i in range(280):
    t0c = COIN_T + rnd(i, 1) * 3.2
    y0 = 9 + 4 * rnd(i, 4)
    tl = t0c + math.sqrt(2 * (y0 - 0.02) / 5.5)
    if tl < DUR - 0.1 and i % 2 == 0:
        c = clink(rr, f0=float(np.exp(rr.uniform(np.log(2600), np.log(5200)))), dur=0.16)
        place(sfx, pan(c, rr.uniform(-0.7, 0.7)), tl, gain=0.22)
# lluvia: brillo continuo de monedas al empezar
for k in range(40):
    tk = COIN_T + 0.05 + k * 0.06
    place(sfx, pan(I.glock(m2f(96 + int(rr.integers(0, 8))), vel=0.25, r=rr, dur=0.5), rr.uniform(-0.6, 0.6)), tk)
# whoosh en la bajada de cámara del inicio y al abrir para las monedas
place(sfx, pan(whoosh(1.4, rr, peak=0.7, f_lo=300, f_hi=1800), 0.0), 0.35, gain=0.5)
place(sfx, pan(whoosh(1.1, rr, peak=0.45, f_lo=400, f_hi=2400), 0.0), COIN_T - 0.2, gain=0.6)
sfx /= np.max(np.abs(sfx)) + 1e-9
write_wav("sfx.wav", sfx * 0.8)
print("musica", DUR, "monedas", COIN_T, "logo", LOGO_T)
