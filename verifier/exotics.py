"""Reference implementation of the exotic ticket cost engine, mirroring
js/exotics.js. Box/key/wheel all reduce to enumerating position groups so
overlapping horse groups can never silently break a shortcut formula.
"""
from __future__ import annotations

from dataclasses import dataclass, field


def enumerate_combinations(position_groups):
    """position_groups: list of lists of horse numbers, one list per finish
    position. Returns every valid ordered combination (distinct horse per
    position)."""
    results = []
    path = []

    def backtrack(idx):
        if idx == len(position_groups):
            results.append(list(path))
            return
        for horse in position_groups[idx]:
            if horse in path:
                continue
            path.append(horse)
            backtrack(idx + 1)
            path.pop()

    backtrack(0)
    return results


@dataclass
class CostResult:
    combos: int
    cost: float
    combinations: list = field(default_factory=list)


def _cost_from_combos(combos, base) -> CostResult:
    return CostResult(combos=len(combos), cost=len(combos) * base, combinations=combos)


def box_cost(horses, positions, base) -> CostResult:
    groups = [list(horses) for _ in range(positions)]
    return _cost_from_combos(enumerate_combinations(groups), base)


def key_cost(key_horse, others, total_positions, key_positions, base) -> CostResult:
    groups = []
    for pos in range(total_positions):
        groups.append([key_horse] if pos in key_positions else list(others))
    return _cost_from_combos(enumerate_combinations(groups), base)


def wheel_cost(position_groups, base) -> CostResult:
    return _cost_from_combos(enumerate_combinations(position_groups), base)
