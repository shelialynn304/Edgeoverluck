"""Reference implementation of the blackjack house-edge estimate, mirroring
js/blackjack.js.

This is a baseline + rule-adjustment table, not a full combinatorial/basic-
strategy solver. The figures are commonly published approximate rule-effect
estimates (assuming correct basic strategy) and must always be presented as
approximate, never exact.
"""
from __future__ import annotations

from dataclasses import dataclass

BASELINE_HOUSE_EDGE = 0.005  # 6-deck, S17, DAS, no surrender, 3:2 blackjack

DECK_ADJUSTMENT = {
    1: -0.0048,
    2: -0.0032,
    4: -0.0006,
    6: 0.0,
    8: 0.0001,
}

RULE_ADJUSTMENTS = {
    "dealer_hits_soft_17": 0.0022,
    "no_double_after_split": 0.0014,
    "late_surrender": -0.0008,
    "no_resplit_aces": 0.0003,
    "blackjack_pays_six_to_five": 0.0139,
}


@dataclass
class Adjustment:
    label: str
    adjustment: float


@dataclass
class HouseEdgeEstimate:
    edge: float
    breakdown: list[Adjustment]


def estimate_house_edge(
    decks: int,
    dealer_hits_soft_17: bool,
    double_after_split: bool,
    late_surrender: bool,
    resplit_aces: bool,
    blackjack_payout: str,
) -> HouseEdgeEstimate:
    breakdown = [Adjustment("Baseline (6-deck, S17, DAS, 3:2)", BASELINE_HOUSE_EDGE)]

    breakdown.append(Adjustment(f"{decks}-deck shoe", DECK_ADJUSTMENT[decks]))

    if dealer_hits_soft_17:
        breakdown.append(Adjustment("Dealer hits soft 17", RULE_ADJUSTMENTS["dealer_hits_soft_17"]))
    if not double_after_split:
        breakdown.append(Adjustment("No double after split", RULE_ADJUSTMENTS["no_double_after_split"]))
    if late_surrender:
        breakdown.append(Adjustment("Late surrender allowed", RULE_ADJUSTMENTS["late_surrender"]))
    if not resplit_aces:
        breakdown.append(Adjustment("No resplitting aces", RULE_ADJUSTMENTS["no_resplit_aces"]))
    if blackjack_payout == "6:5":
        breakdown.append(Adjustment("Blackjack pays 6:5", RULE_ADJUSTMENTS["blackjack_pays_six_to_five"]))

    edge = sum(b.adjustment for b in breakdown)
    return HouseEdgeEstimate(edge=edge, breakdown=breakdown)
