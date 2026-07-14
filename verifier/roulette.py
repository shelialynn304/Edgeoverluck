"""Reference implementation of roulette bet EV/house-edge, mirroring
js/roulette.js.

Every standard inside/outside bet pays (36 / numbers_covered) - 1 to one,
which makes every one of them carry the *same* house edge on a given wheel:
edge = 1 - 36/pocket_count. This is a well-established property of roulette;
the anomalous "top line" 0-00-1-2-3 bet on American wheels is deliberately
not offered as a bet type.
"""
from __future__ import annotations

from dataclasses import dataclass

WHEEL_POCKETS = {"american": 38, "european": 37}

BET_NUMBERS_COVERED = {
    "straight": 1,
    "split": 2,
    "street": 3,
    "corner": 4,
    "six_line": 6,
    "column": 12,
    "dozen": 12,
    "even_money": 18,  # red/black, even/odd, high/low
}


def payout_for(numbers_covered: int) -> float:
    return 36 / numbers_covered - 1


def house_edge(wheel_type: str, bet_type: str, en_partage: bool = False) -> float:
    pockets = WHEEL_POCKETS[wheel_type]
    edge = 1 - 36 / pockets
    if en_partage and wheel_type == "european" and bet_type == "even_money":
        edge = edge / 2
    return edge


@dataclass
class BetAnalysis:
    pocket_count: int
    numbers_covered: int
    payout_to_one: float
    house_edge: float
    expected_value: float


def analyze_bet(wheel_type: str, bet_type: str, bet_amount: float, en_partage: bool = False) -> BetAnalysis:
    numbers_covered = BET_NUMBERS_COVERED[bet_type]
    payout = payout_for(numbers_covered)
    edge = house_edge(wheel_type, bet_type, en_partage)
    expected_value = -edge * bet_amount
    return BetAnalysis(
        pocket_count=WHEEL_POCKETS[wheel_type],
        numbers_covered=numbers_covered,
        payout_to_one=payout,
        house_edge=edge,
        expected_value=expected_value,
    )
