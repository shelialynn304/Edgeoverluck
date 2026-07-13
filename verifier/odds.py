"""Reference implementation of odds parsing/conversion, mirroring js/odds.js.

This is the source of truth the JS math is checked against. Keep the two in
sync deliberately -- any formula change should land in both places.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

STANDARD_INCREMENTS = [
    1 / 9, 1 / 5, 2 / 5, 1 / 2, 3 / 5, 4 / 5, 1, 6 / 5, 7 / 5, 3 / 2, 8 / 5,
    9 / 5, 2, 5 / 2, 3, 7 / 2, 4, 9 / 2, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30,
    50, 99,
]

EVEN_ALIASES = {"EVEN", "EVN", "1-1", "1/1", "EV"}

_FRACTION_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)$")
_DASH_RE = re.compile(r"^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$")
_INT_RE = re.compile(r"^(\d+(?:\.\d+)?)$")


def parse_odds_display(raw) -> float | None:
    """Parses a displayed odds string into fractional odds (e.g. '5/2' -> 2.5)."""
    if raw is None:
        return None
    s = str(raw).strip().upper()
    if s == "":
        return None
    if s in EVEN_ALIASES:
        return 1.0

    m = _FRACTION_RE.match(s)
    if m:
        b = float(m.group(2))
        if b == 0:
            return None
        return float(m.group(1)) / b

    m = _DASH_RE.match(s)
    if m:
        b = float(m.group(2))
        if b == 0:
            return None
        return float(m.group(1)) / b

    m = _INT_RE.match(s)
    if m:
        return float(m.group(1))

    return None


def to_decimal_odds(fractional_odds: float) -> float:
    return fractional_odds + 1


def implied_probability(decimal_odds: float) -> float:
    return 1 / decimal_odds


def next_increment_up(fractional_odds: float) -> float:
    for inc in STANDARD_INCREMENTS:
        if inc > fractional_odds + 1e-9:
            return inc
    return fractional_odds


@dataclass
class ProbRange:
    low: float
    high: float
    point: float
    is_range: bool


def implied_prob_range(fractional_odds: float, source_type: str) -> ProbRange:
    decimal_odds = to_decimal_odds(fractional_odds)
    point = implied_probability(decimal_odds)

    if source_type != "tote_board":
        return ProbRange(low=point, high=point, point=point, is_range=False)

    upper_fractional = next_increment_up(fractional_odds)
    low = implied_probability(to_decimal_odds(upper_fractional))
    return ProbRange(low=low, high=point, point=point, is_range=True)
