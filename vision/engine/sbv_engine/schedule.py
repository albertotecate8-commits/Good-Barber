"""Horario comercial por negocio (misma regla que la app: 0 = domingo … 6 = sábado)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo


@dataclass(frozen=True)
class DayHours:
    weekday: int
    is_closed: bool
    opens_at: time | None
    closes_at: time | None


def is_open(hours: list[DayHours], when: datetime, tz: str) -> bool | None:
    """True abierto · False cerrado · None horario sin registrar para ese día."""
    local = when.astimezone(ZoneInfo(tz))
    weekday = (local.weekday() + 1) % 7  # Python: lunes=0 → JS: domingo=0
    day = next((h for h in hours if h.weekday == weekday), None)
    if day is None:
        return None
    if day.is_closed or day.opens_at is None or day.closes_at is None:
        return False
    return day.opens_at <= local.time() < day.closes_at
