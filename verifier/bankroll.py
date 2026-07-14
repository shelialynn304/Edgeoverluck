"""Reference implementation of bankroll sizing, mirroring js/bankroll.js.

Deliberately does not attempt a risk-of-ruin probability estimate -- that
requires variance assumptions per bet structure that aren't rigorously
modeled here, and an under-verified number is worse than none for a
real-money tool.
"""
from __future__ import annotations

from dataclasses import dataclass


def kelly_fraction(win_prob: float, decimal_odds: float) -> float:
    """Kelly criterion optimal bet fraction of bankroll. Never negative --
    zero means "no edge, don't bet"."""
    b = decimal_odds - 1
    if b <= 0:
        return 0.0
    q = 1 - win_prob
    f = win_prob - q / b
    return f if f > 0 else 0.0


@dataclass
class StakeRecommendation:
    full_kelly_fraction: float
    applied_fraction: float
    stake: float


def recommended_stake(
    bankroll: float,
    win_prob: float,
    decimal_odds: float,
    kelly_multiplier: float = 0.5,
) -> StakeRecommendation:
    full_kelly = kelly_fraction(win_prob, decimal_odds)
    fraction = full_kelly * kelly_multiplier
    return StakeRecommendation(
        full_kelly_fraction=full_kelly,
        applied_fraction=fraction,
        stake=bankroll * fraction,
    )


@dataclass
class Guardrail:
    pct_of_bankroll: float | None
    level: str
    message: str


def bankroll_guardrail(bankroll: float, stake: float) -> Guardrail:
    if bankroll <= 0:
        return Guardrail(pct_of_bankroll=None, level="unknown", message="Bankroll must be a positive amount.")
    pct = stake / bankroll
    level = "ok"
    message = "Within common single-wager guidance (under 5% of bankroll)."
    if pct > 0.2:
        level = "severe"
        message = "Over 20% of bankroll on a single wager -- most bankroll-management guidance considers this a serious risk of ruin."
    elif pct > 0.1:
        level = "high"
        message = "Over 10% of bankroll on a single wager -- higher than most bankroll-management guidance recommends."
    elif pct > 0.05:
        level = "elevated"
        message = "Over 5% of bankroll on a single wager -- above the most conservative common guidance, but not extreme."
    return Guardrail(pct_of_bankroll=pct, level=level, message=message)
