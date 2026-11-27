"""Geometría en coordenadas NORMALIZADAS (0–1), independientes de la resolución."""
from __future__ import annotations

Point = tuple[float, float]


def side_of_line(a: Point, b: Point, p: Point) -> float:
    """>0: p a la IZQUIERDA de la recta dirigida a→b; <0: a la derecha; 0: sobre ella."""
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])


def segments_intersect(p1: Point, p2: Point, a: Point, b: Point) -> bool:
    """¿El desplazamiento p1→p2 cruza el SEGMENTO a–b (no la recta infinita)?"""
    d1 = side_of_line(a, b, p1)
    d2 = side_of_line(a, b, p2)
    d3 = side_of_line(p1, p2, a)
    d4 = side_of_line(p1, p2, b)
    return (d1 * d2 < 0) and (d3 * d4 < 0)


def point_in_polygon(p: Point, poly: list[Point]) -> bool:
    """Ray casting. El polígono puede ser cóncavo."""
    x, y = p
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < xin:
                inside = not inside
    return inside


def anchor_bottom_center(box: tuple[float, float, float, float], width: int, height: int) -> Point:
    """Punto de apoyo (pies) de una caja en píxeles → normalizado."""
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2 / width, y2 / height)
