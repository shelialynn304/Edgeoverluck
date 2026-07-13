"""Reference implementation of win-pool math, mirroring js/analysis.js."""
from __future__ import annotations

from dataclasses import dataclass, field

from .odds import implied_prob_range, implied_probability, to_decimal_odds


@dataclass
class HorseResult:
    number: int
    fractional_odds: float
    decimal_odds: float
    q: float
    p: float
    fair_decimal_odds: float


@dataclass
class WinAnalysis:
    horses: list = field(default_factory=list)
    overround: float = 0.0
    effective_takeout: float = 0.0


def compute_win_analysis(horses, source_type: str = "adw_screenshot") -> WinAnalysis:
    """horses: list of {"number": int, "fractional_odds": float}"""
    prepped = []
    for h in horses:
        decimal_odds = to_decimal_odds(h["fractional_odds"])
        q = implied_probability(decimal_odds)
        prepped.append({**h, "decimal_odds": decimal_odds, "q": q})

    overround = sum(h["q"] for h in prepped)
    effective_takeout = 1 - (1 / overround) if overround > 0 else 0.0

    results = []
    for h in prepped:
        p = h["q"] / overround if overround > 0 else 0.0
        fair_decimal_odds = (1 / p) if p > 0 else float("inf")
        results.append(
            HorseResult(
                number=h["number"],
                fractional_odds=h["fractional_odds"],
                decimal_odds=h["decimal_odds"],
                q=h["q"],
                p=p,
                fair_decimal_odds=fair_decimal_odds,
            )
        )

    return WinAnalysis(horses=results, overround=overround, effective_takeout=effective_takeout)


@dataclass
class Overlay:
    is_overlay: bool
    edge: float


def compute_overlay(user_prob: float, decimal_odds: float) -> Overlay:
    edge = user_prob * decimal_odds - 1
    return Overlay(is_overlay=edge > 0, edge=edge)
