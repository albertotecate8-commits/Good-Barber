# Mezcla final: voz al frente, música y efectos abajo; -14 LUFS integrados, pico real <= -1 dBTP.
# Uso: python musica.py && python mezcla.py  -> mezcla.wav
import numpy as np
from dsp import read_wav, write_wav, integrated, true_peak, dbg, st

def get(p):
    x, _ = read_wav(p)
    return st(x)

voz, music, sfx = get("voz.wav"), get("music.wav"), get("sfx.wav")
n = max(voz.shape[1], music.shape[1], sfx.shape[1])
pad = lambda x: np.pad(x, ((0, 0), (0, n - x.shape[1])))
voz, music, sfx = pad(voz), pad(music), pad(sfx)
lv = integrated(voz)
music *= dbg(lv - 9 - integrated(music))   # música ~9 dB abajo de la voz
sfx *= dbg(lv - 8 - integrated(sfx))       # efectos ~8 dB abajo
mix = voz + music + sfx
mix *= dbg(-14 - integrated(mix))
tp = true_peak(mix)
if tp > -1.0:  # limitador sencillo: compresión suave sólo en los picos
    lim = 10 ** (-1.0 / 20)
    mix = np.tanh(mix / lim) * lim
write_wav("mezcla.wav", mix)
print("LUFS", round(integrated(mix), 2), "pico", round(true_peak(mix), 2))
