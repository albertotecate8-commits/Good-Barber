# Música original y alegre (sintetizada con numpy) + efectos para el short "Dos vecinos".
# Guitarrón (bajo pulsado), vihuela en contratiempo, glockenspiel suave; trompetas solo en el cierre.
# En "Espera... ¿qué?" la música se corta un momento y vuelve en "Fíjate". Los efectos caen en su cuadro
# (whoosh en cada cambio de lugar y movimiento grande, brillos de glock en las buenas noticias). Nada de pops de caricatura.
# Uso: python musica.py -> music.wav, sfx.wav   (lee ../src/videos/desempleo/palabras.json)
import json
import numpy as np
from dsp import SR, ns, rng, pan, place, fades, make_ir, convolve_st, write_wav
import instruments as I
from sfx_gen import whoosh, flag_flutter

D = json.load(open("../src/videos/desempleo/palabras.json"))
WD = D["words"]; DUR = D["dur"]
W = lambda i: WD[i]["s"]          # segundo en que empieza la palabra i
F = lambda fr: fr / 30.0          # cuadro -> segundos
STOP0, STOP1 = W(96) - 0.05, W(107) - 0.05   # "Espera... ¿qué?" hasta "Fíjate": sin música
CTA = W(205) - 4 / 30

BPM = 112; Q = 60 / BPM; E = Q / 2; BAR = 2 * Q
m2f = I.m2f
PROG = ["F", "F", "C7", "C7", "F", "Bb", "C7", "F"]
CH = {"F": [65, 69, 72], "Bb": [65, 70, 74], "C7": [64, 67, 70, 72]}
ROOT = {"F": (41, 48), "Bb": (46, 41), "C7": (36, 43)}
MEL = [(0, 0, 1, 72), (0, 1, 1, 69), (0, 2, 1, 72), (0, 3, 1, 77), (1, 0, 1, 76), (1, 1, 1, 74), (1, 2, 2, 72),
       (2, 0, 1, 70), (2, 1, 1, 67), (2, 2, 1, 70), (2, 3, 1, 76), (3, 0, 1, 74), (3, 1, 1, 72), (3, 2, 2, 70),
       (4, 0, 1, 69), (4, 1, 1, 72), (4, 2, 1, 77), (4, 3, 1, 81), (5, 0, 1, 79), (5, 1, 1, 77), (5, 2, 1, 76), (5, 3, 1, 74),
       (6, 0, 1, 72), (6, 1, 1, 76), (6, 2, 1, 79), (6, 3, 1, 82), (7, 0, 2, 81), (7, 2, 2, 77)]
N = ns(DUR + 2)
bed, lead, spark = np.zeros((2, N)), np.zeros((2, N)), np.zeros((2, N))
r = rng(7)
nbars = int(np.ceil((DUR + 1) / BAR))
for b in range(nbars):
    tb = b * BAR
    if tb > DUR - 0.3: break
    ch = PROG[b % 8]; big = tb >= CTA - 0.05
    for k, m in enumerate(ROOT[ch]):
        t = tb + k * Q
        if STOP0 <= t < STOP1: continue
        place(bed, pan(I.pluck(m2f(m), vel=0.95 if big else 0.8, r=r, dur=0.7, bright=0.35, pos=0.22), -0.1), t)
    for k in range(4):
        t = tb + k * E
        if STOP0 <= t < STOP1: continue
        vel = (0.5 if k % 2 else 0.22) * (1.25 if big else 1.0)
        for j, m in enumerate(CH[ch]):
            place(bed, pan(I.pluck(m2f(m + 12 * (j == 0)), vel=vel, r=r, dur=0.28, bright=0.9, pos=0.12), 0.35), t + j * 0.008)
# glock con la melodía, muy suave, cada 8 compases (no compite con la voz)
for k in range(0, 9):
    ts = k * 8 * BAR
    for (bb, e, ln, m) in MEL:
        tm = ts + bb * BAR + e * E
        if tm >= CTA - 0.3 or STOP0 - 0.3 <= tm < STOP1: continue
        place(spark, pan(I.glock(m2f(m + 12), vel=0.14, r=r, dur=1.0), 0.2), tm)
# cierre: trompetas en terceras desde el compás del llamado
def third_below(m):
    sc = [65, 67, 69, 70, 72, 74, 76]; pcs = [s % 12 for s in sc]
    i = pcs.index(m % 12) if m % 12 in pcs else 0
    return m - (pcs[i] - pcs[(i - 2) % 7]) % 12
tb0 = np.ceil(CTA / BAR) * BAR - BAR / 2
for (bb, e, ln, m) in MEL:
    ts = tb0 + bb * BAR + e * E
    if ts > DUR - 0.9: continue
    d = ln * E * 0.85
    place(lead, pan(I.brass(m2f(m), d, vel=0.7, r=r, kind="stab", scoop=-30), -0.25), ts)
    place(lead, pan(I.brass(m2f(third_below(m)), d, vel=0.55, r=r, kind="stab", scoop=-30), 0.25), ts + 0.012)
t_end = WD[-1]["s"]  # acorde final con la última palabra
for m in [65, 69, 72, 77]: place(lead, pan(I.brass(m2f(m), 0.6, vel=0.85, r=r, kind="stab", scoop=-40, fall=0.0), 0.0), t_end)
for m in [41, 53]: place(bed, I.pluck(m2f(m), vel=1.0, r=r, dur=1.2, bright=0.4), t_end)
ir = make_ir(1.0, 3, pre=0.01)
mix = bed + lead * 0.55 + spark * 0.8
music = mix + 0.18 * convolve_st(mix, ir)[:, :N]
tt = np.arange(N) / SR
env = np.where(tt >= CTA - 0.1, 1.25, 1.0)
k = int(0.1 * SR); env = np.convolve(env, np.ones(k) / k, mode="same")
music = fades((music * env[None, :])[:, : ns(DUR)], 0.005, 0.35)
music /= np.max(np.abs(music)) + 1e-9
write_wav("music.wav", music * 0.8)

# ---------------- efectos ----------------
sfx = np.zeros((2, ns(DUR))); rr = rng(11)
cambios = [207, 518, 595, 720, 820, 1403]                   # destellos (cambio de lugar)
moves = [98, 196, 300, 348, 462, 566, 1024, 1170, 1236, 1292, 1366, 1530, 1640]  # deslizamientos grandes de cámara
for fr in cambios: place(sfx, pan(whoosh(0.7, rr, peak=0.45, f_lo=500, f_hi=2600), 0.0), F(fr) - 0.35, gain=0.5)
for fr in moves: place(sfx, pan(whoosh(0.9, rr, peak=0.5, f_lo=300, f_hi=1600), rr.uniform(-0.4, 0.4)), F(fr) - 0.6, gain=0.28)
def chime(t, notes, vel=0.35, step=0.07, p=0.2):
    for i, m in enumerate(notes): place(sfx, pan(I.glock(m2f(m), vel=vel, r=rr, dur=1.0), p), t + i * step)
chime(W(13) - 0.1, [84, 88, 91, 96, 100])                     # la lluvia de billetes de Ramiro
place(sfx, pan(flag_flutter(1.6, rr), -0.3), W(13), gain=0.35)
chime(W(30) + 0.05, [72], vel=0.3)                             # la moneda solitaria de Toño
chime(W(62) - 0.15, [77, 81, 84, 89], vel=0.32)                # aparece el cochinito de la Afore
place(sfx, I.timpani(m2f(41), vel=0.5, r=rr, dur=1.2), W(62) - 0.15, gain=0.6)
chime(W(95) - 0.08, [88, 96], vel=0.4, step=0.09)              # palomita en el celular
chime(W(127) - 0.05, [84, 88, 91, 96], vel=0.32)              # "le regresan más"
for i, w in enumerate([152, 160, 165, 174]):                   # los requisitos, uno por uno
    place(sfx, pan(I.vibes(m2f([72, 76, 79, 84][i]), vel=0.45, r=rr, dur=1.0), -0.2 + 0.13 * i), W(w) - 0.08)
chime(W(203) - 0.05, [79, 84, 88], vel=0.3)                    # Ramiro le presta a Toño
place(sfx, I.cymbal(vel=0.35, r=rr, dur=1.8, bright=0.8), CTA, gain=0.5)  # entra el logo
sfx /= np.max(np.abs(sfx)) + 1e-9
write_wav("sfx.wav", sfx * 0.8)
print("música", DUR, "s; corte", round(STOP0, 2), "-", round(STOP1, 2), "; cierre", round(CTA, 2))
