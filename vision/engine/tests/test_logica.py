from datetime import datetime, time, timezone

from sbv_engine.aggregate import TrafficAggregator, hour_start
from sbv_engine.counting import CountingLine, LineCounter
from sbv_engine.geometry import point_in_polygon, segments_intersect
from sbv_engine.schedule import DayHours, is_open
from sbv_engine.zones import StationZone, ZoneTracker

# Línea horizontal en y=0.5 de x=0.2 a x=0.8; interior = derecha de A→B (abajo en imagen).
LINE = CountingLine("L1", "C1", (0.2, 0.5), (0.8, 0.5), entry_side="left")


def walk(counter, tid, ys, x=0.5, t0=0.0, dt=0.2):
    out = []
    for i, y in enumerate(ys):
        c = counter.update(tid, (x, y), t0 + i * dt)
        if c:
            out.append(c.direction)
    return out


def test_entrada_y_salida():
    lc = LineCounter(LINE)
    # A→B va hacia +x; con y hacia abajo, "izquierda" (producto cruz > 0) es y > 0.5
    assert walk(lc, 1, [0.3, 0.4, 0.6, 0.7]) == ["line_entry"]
    lc2 = LineCounter(LINE)
    assert walk(lc2, 2, [0.7, 0.6, 0.4, 0.3]) == ["line_exit"]


def test_temblor_sobre_la_linea_no_duplica():
    lc = LineCounter(LINE, min_seconds_between=2.0)
    ys = [0.3, 0.45, 0.55, 0.45, 0.55, 0.45, 0.6, 0.7]
    assert walk(lc, 1, ys).count("line_entry") == 1


def test_un_track_cuenta_una_entrada_maximo():
    lc = LineCounter(LINE, min_seconds_between=0.0)
    ys = [0.3, 0.7, 0.3, 0.7, 0.3, 0.7]
    res = walk(lc, 1, ys, dt=5)
    assert res.count("line_entry") == 1 and res.count("line_exit") == 1


def test_cruzar_fuera_del_segmento_no_cuenta():
    lc = LineCounter(LINE)
    assert walk(lc, 1, [0.3, 0.7], x=0.95) == []  # pasa por fuera del extremo B
    assert not segments_intersect((0.95, 0.3), (0.95, 0.7), LINE.point_a, LINE.point_b)


def test_dos_personas_dos_entradas():
    lc = LineCounter(LINE)
    assert walk(lc, 1, [0.3, 0.7]) == ["line_entry"]
    assert walk(lc, 2, [0.3, 0.7], x=0.4) == ["line_entry"]


def test_zona_permanencia_y_tolerancia():
    poly = [(0.1, 0.1), (0.4, 0.1), (0.4, 0.4), (0.1, 0.4)]
    z = ZoneTracker(StationZone("S1", "B1", "C1", poly, dwell_seconds=60, release_grace_seconds=15))
    inside, outside = [(0.2, 0.2)], [(0.9, 0.9)]
    events = []
    for t in range(0, 59):
        e = z.update(inside, float(t))
        events.append(e)
    assert all(e is None for e in events) and z.state == "free"  # 58 s: aún no
    assert z.update(inside, 60.0).kind == "occupied"
    for t in range(61, 70):
        assert z.update(outside, float(t)) is None  # dentro de la tolerancia
    assert z.update(inside, 70.0) is None and z.state == "occupied"  # regresó: sigue ocupada
    for t in range(71, 86):
        z.update(outside, float(t))
    assert z.update(outside, 86.0).kind == "free"
    secs, sessions = z.take_occupied_seconds()
    assert sessions == 1 and 80 <= secs <= 90


def test_zona_paso_rapido_no_ocupa():
    poly = [(0.1, 0.1), (0.4, 0.1), (0.4, 0.4), (0.1, 0.4)]
    z = ZoneTracker(StationZone("S1", "B1", "C1", poly, dwell_seconds=60, release_grace_seconds=15))
    for t in range(0, 30):
        z.update([(0.2, 0.2)], float(t))
    for t in range(30, 120):
        z.update([], float(t))
    assert z.state == "free" and z.take_occupied_seconds() == (0.0, 0)


def test_point_in_polygon_concavo():
    L = [(0, 0), (1, 0), (1, 0.4), (0.4, 0.4), (0.4, 1), (0, 1)]
    assert point_in_polygon((0.2, 0.8), L) and not point_in_polygon((0.8, 0.8), L)


def test_horario_good_barber_ciudad_de_mexico():
    gb = [DayHours(0, True, None, None)] + [DayHours(d, False, time(14), time(20)) for d in range(1, 6)] + [
        DayHours(6, False, time(11), time(20))]
    tz = "America/Mexico_City"
    lunes_1500 = datetime(2026, 11, 30, 21, 0, tzinfo=timezone.utc)  # 15:00 local
    lunes_2300 = datetime(2026, 12, 1, 5, 0, tzinfo=timezone.utc)  # 23:00 local
    domingo = datetime(2026, 11, 29, 20, 0, tzinfo=timezone.utc)
    assert is_open(gb, lunes_1500, tz) is True
    assert is_open(gb, lunes_2300, tz) is False
    assert is_open(gb, domingo, tz) is False
    assert is_open([], lunes_1500, tz) is None  # Glamour Studio sin horario: desconocido


def test_agregado_por_hora_incremental_y_huecos():
    ag = TrafficAggregator("C1", "B1")
    t0 = datetime(2026, 11, 27, 20, 0, tzinfo=timezone.utc).timestamp()
    for i in range(0, 600, 2):  # 10 min a 0.5 fps
        ag.observe(t0 + i, people_in_frame=2)
    ag.crossing(t0 + 30, "line_entry")
    first = ag.drain()
    assert len(first) == 1 and first[0].entries == 1 and 590 <= first[0].observed_seconds <= 600
    ag.observe(t0 + 900, 1)  # hueco de 5 min (cámara caída): no suma observado
    ag.crossing(t0 + 901, "line_exit")
    second = ag.drain()
    assert second[0].entries == 0 and second[0].exits == 1 and second[0].observed_seconds == 0
    assert first[0].visits_estimated == 1 and hour_start(t0) == first[0].hour


def test_agregador_secundario_no_inventa_personas():
    t0 = datetime(2026, 11, 27, 20, 0, tzinfo=timezone.utc).timestamp()
    prim = TrafficAggregator("C1", "GB", measures_people=True)
    sec = TrafficAggregator("C1", "GS", measures_people=False)
    for i in range(0, 60, 2):
        prim.observe(t0 + i, 3); sec.observe(t0 + i, 3)
    sec.crossing(t0 + 10, "line_entry")
    p, q = prim.drain()[0], sec.drain()[0]
    assert p.people_detected_max == 3 and q.people_detected_max is None
    assert q.entries == 1 and q.observed_seconds > 0 and p.entries == 0
