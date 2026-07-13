import pytest

from .exotics import box_cost, enumerate_combinations, key_cost, wheel_cost


def test_exacta_box():
    result = box_cost([1, 2, 3], 2, base=1)
    # n * (n-1) = 3 * 2 = 6
    assert result.combos == 6
    assert result.cost == 6


def test_trifecta_box():
    result = box_cost([1, 2, 3, 4], 3, base=1)
    # n * (n-1) * (n-2) = 4 * 3 * 2 = 24
    assert result.combos == 24
    assert result.cost == 24


def test_superfecta_box():
    result = box_cost([1, 2, 3, 4, 5], 4, base=0.1)
    # n * (n-1) * (n-2) * (n-3) = 5*4*3*2 = 120
    assert result.combos == 120
    assert result.cost == pytest.approx(12.0)


def test_exacta_key_to_win():
    # key horse 1 must finish 1st, 3 others fill 2nd: combos = k = 3
    result = key_cost(1, [2, 3, 4], total_positions=2, key_positions=[0], base=1)
    assert result.combos == 3
    assert sorted(result.combinations) == [[1, 2], [1, 3], [1, 4]]


def test_trifecta_key_to_win():
    # key horse must finish 1st, others (k=3) fill 2nd/3rd: combos = k*(k-1) = 6
    result = key_cost(1, [2, 3, 4], total_positions=3, key_positions=[0], base=0.5)
    assert result.combos == 6
    assert result.cost == 3.0


def test_wheel_with_overlapping_position_groups():
    # Overlapping groups across positions must not double count or drop
    # combinations where the same horse appears in multiple position lists.
    groups = [[1, 2], [2, 3], [1, 3]]
    result = wheel_cost(groups, base=1)
    combos = enumerate_combinations(groups)
    # Every combination must have 3 distinct horses drawn validly per position
    assert result.combos == len(combos)
    for combo in combos:
        assert len(set(combo)) == 3
        assert combo[0] in groups[0]
        assert combo[1] in groups[1]
        assert combo[2] in groups[2]
    # Hand-verified: only 2 valid distinct-horse orderings exist here
    # (1,2,3) and (2,3,1) satisfy all three position constraints.
    assert result.combos == 2


def test_enumerate_combinations_no_repeats():
    combos = enumerate_combinations([[1, 2], [1, 2]])
    # position 2 can't reuse whichever horse position 1 took
    assert combos == [[1, 2], [2, 1]]
