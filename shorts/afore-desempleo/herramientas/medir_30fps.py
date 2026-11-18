"""Analiza un short a 30 cuadros por segundo, TODOS los cuadros.

Saca:
  hojas/hoja_NNN.jpg  -> 60 cuadros (2 s) por hoja, con número de cuadro
  medidas.csv         -> por cuadro: desplazamiento x/y (px a 1080 de ancho), zoom (%),
                         giro (grados), diferencia (cortes), brillo, contraste, saturación
  resumen.json        -> cortes, % de cuadros con cámara en movimiento, movimientos
                         (inicio, fin, duración, tipo, curva)
Uso: /usr/bin/python3 medir_30fps.py video.mp4 carpeta_salida
"""
import csv
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw

W, H = 270, 480          # tamaño para medir (escala 0.25 de 1080x1920)
TW, TH = 108, 192        # miniatura en la hoja
ESCALA = 1080 / W


def cuadros(ruta):
    cmd = ["ffmpeg", "-v", "error", "-i", ruta, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = W * H * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).reshape(H, W, 3)


def movimiento(prev_g, g, orb, bf):
    """Escala, giro y traslación entre dos cuadros (puntos ORB + afín parcial)."""
    k1, d1 = orb.detectAndCompute(prev_g, None)
    k2, d2 = orb.detectAndCompute(g, None)
    if d1 is None or d2 is None or len(k1) < 12 or len(k2) < 12:
        return None
    m = bf.match(d1, d2)
    if len(m) < 12:
        return None
    a = np.float32([k1[x.queryIdx].pt for x in m])
    b = np.float32([k2[x.trainIdx].pt for x in m])
    M, inl = cv2.estimateAffinePartial2D(a, b, method=cv2.RANSAC, ransacReprojThreshold=1.5)
    if M is None or inl is None or inl.sum() < 10:
        return None
    s = float(np.hypot(M[0, 0], M[1, 0]))
    ang = float(np.degrees(np.arctan2(M[1, 0], M[0, 0])))
    # traslación del centro del cuadro
    cx, cy = W / 2, H / 2
    nx = M[0, 0] * cx + M[0, 1] * cy + M[0, 2]
    ny = M[1, 0] * cx + M[1, 1] * cy + M[1, 2]
    return (nx - cx) * ESCALA, (ny - cy) * ESCALA, (s - 1) * 100, ang


def main():
    ruta, out = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(out, "hojas"), exist_ok=True)
    orb = cv2.ORB_create(800)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    filas, hoja, prev_g = [], [], None
    for i, rgb in enumerate(cuadros(ruta)):
        g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
        lum = g.astype(np.float32) / 255
        fila = {"cuadro": i, "seg": round(i / 30, 3), "dx": 0.0, "dy": 0.0, "zoom_pct": 0.0, "giro": 0.0,
                "dif": 0.0, "brillo": round(float(lum.mean()), 3), "contraste": round(float(lum.std()), 3),
                "saturacion": round(float(hsv[..., 1].mean() / 255), 3), "sin_medida": 0}
        if prev_g is not None:
            fila["dif"] = round(float(np.abs(g.astype(np.int16) - prev_g.astype(np.int16)).mean()), 2)
            r = movimiento(prev_g, g, orb, bf)
            if r is None:
                fila["sin_medida"] = 1
            else:
                fila["dx"], fila["dy"], fila["zoom_pct"], fila["giro"] = (round(v, 3) for v in r)
        filas.append(fila)
        prev_g = g

        hoja.append((i, Image.fromarray(rgb).resize((TW, TH))))
        if len(hoja) == 60:
            guardar_hoja(hoja, out)
            hoja = []
    if hoja:
        guardar_hoja(hoja, out)

    with open(os.path.join(out, "medidas.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(filas[0].keys()))
        w.writeheader()
        w.writerows(filas)
    json.dump(resumen(filas), open(os.path.join(out, "resumen.json"), "w"), indent=1, ensure_ascii=False)
    print(json.dumps(resumen(filas)["general"], ensure_ascii=False))


def guardar_hoja(hoja, out):
    cols, rows = 10, 6
    img = Image.new("RGB", (cols * TW, rows * (TH + 14)), (20, 20, 20))
    d = ImageDraw.Draw(img)
    for k, (i, im) in enumerate(hoja):
        x, y = (k % cols) * TW, (k // cols) * (TH + 14)
        img.paste(im, (x, y + 14))
        d.text((x + 3, y + 1), f"{i}  {i / 30:.2f}s", fill=(255, 220, 0))
    img.save(os.path.join(out, "hojas", f"hoja_{hoja[0][0] // 60:03d}.jpg"), quality=85)


def resumen(filas):
    n = len(filas)
    dif = np.array([f["dif"] for f in filas])
    med = np.median(dif[1:]) if n > 1 else 0
    cortes = [f["cuadro"] for f in filas[1:] if f["dif"] > max(25, 6 * med) or (f["sin_medida"] and f["dif"] > 15)]
    vel = np.array([np.hypot(f["dx"], f["dy"]) for f in filas])
    zoom = np.array([abs(f["zoom_pct"]) for f in filas])
    giro = np.array([abs(f["giro"]) for f in filas])
    # «se mueve» = desplazamiento > 0.3 px/cuadro a 1080, o zoom > 0.03 %/cuadro, o giro > 0.02°
    mov = (vel > 0.3) | (zoom > 0.03) | (giro > 0.02)
    for c in cortes:
        mov[c] = False
    # tramos de movimiento seguidos (permitiendo huecos de 2 cuadros)
    tramos, ini, hueco = [], None, 0
    for i, m in enumerate(mov):
        if m:
            if ini is None:
                ini = i
            hueco = 0
        elif ini is not None:
            hueco += 1
            if hueco > 2:
                tramos.append((ini, i - hueco))
                ini, hueco = None, 0
    if ini is not None:
        tramos.append((ini, n - 1))
    movs = []
    for a, b in tramos:
        if b - a < 3:
            continue
        v = vel[a:b + 1]
        z = np.array([filas[k]["zoom_pct"] for k in range(a, b + 1)])
        tipo = "acercamiento" if z.mean() > 0.03 else "alejamiento" if z.mean() < -0.03 else "paneo/deriva"
        fuerza = np.maximum(v, np.abs(z) * 10)
        pico = int(np.argmax(fuerza))
        movs.append({"inicio": a, "fin": b, "cuadros": b - a + 1, "tipo": tipo,
                     "px_por_cuadro_max": round(float(v.max()), 2), "zoom_total_pct": round(float(z.sum()), 2),
                     "pico_en": f"{round(100 * pico / max(1, b - a))}% del tramo"})
    return {
        "general": {
            "cuadros": n, "segundos": round(n / 30, 2), "cortes": len(cortes),
            "pct_cuadros_camara_moviendose": round(100 * mov.mean(), 1),
            "pct_cuadros_con_zoom": round(100 * (zoom > 0.03).mean(), 1),
            "brillo_medio": round(float(np.mean([f["brillo"] for f in filas])), 3),
            "contraste_medio": round(float(np.mean([f["contraste"] for f in filas])), 3),
            "saturacion_media": round(float(np.mean([f["saturacion"] for f in filas])), 3),
            "movimientos": len(movs),
            "duracion_mediana_movimiento_cuadros": int(np.median([m["cuadros"] for m in movs])) if movs else 0,
        },
        "cortes_en_cuadro": cortes,
        "movimientos": movs,
    }


if __name__ == "__main__":
    main()
