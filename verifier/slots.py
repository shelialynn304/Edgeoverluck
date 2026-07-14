"""Reference implementation of the slots expected-value estimate, mirroring
js/slots.js.

True RTP is set by the machine's hidden reel weightings and cannot be
derived or verified from outside the machine -- always required as an
input, never estimated or defaulted. Variance/volatility is not modeled
numerically; only a qualitative note is given based on a user-supplied
volatility label.
"""
from __future__ import annotations

VOLATILITY_NOTES = {
    "low": "Low volatility: smaller, more frequent wins. Actual results tend to track close to the expected value over a session.",
    "medium": "Medium volatility: a mix of small wins and occasional larger ones. Session results can swing noticeably from the expected value.",
    "high": "High volatility: wins are rarer but larger. Session results can differ drastically from the expected value even over hundreds of spins -- the long-run average only shows up over a very large number of spins.",
}


def expected_loss_per_spin(bet_amount: float, rtp: float) -> float:
    return bet_amount * (1 - rtp)


def expected_loss_per_session(bet_amount: float, rtp: float, spins: int) -> float:
    return expected_loss_per_spin(bet_amount, rtp) * spins


def volatility_note(volatility: str) -> str | None:
    return VOLATILITY_NOTES.get(volatility)
