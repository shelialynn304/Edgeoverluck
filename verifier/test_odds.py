import math

import pytest

from .odds import (
    implied_prob_range,
    implied_probability,
    next_increment_up,
    parse_odds_display,
    to_decimal_odds,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("5/2", 2.5),
        ("5-2", 2.5),
        ("9-2", 4.5),
        ("9/5", 1.8),
        ("3", 3.0),
        ("EVEN", 1.0),
        ("EVN", 1.0),
        ("1-1", 1.0),
        ("even", 1.0),
        (" 7/2 ", 3.5),
        ("bogus", None),
        (None, None),
        ("", None),
        ("5/0", None),
    ],
)
def test_parse_odds_display(raw, expected):
    result = parse_odds_display(raw)
    if expected is None:
        assert result is None
    else:
        assert result == pytest.approx(expected)


def test_to_decimal_odds():
    assert to_decimal_odds(2.5) == pytest.approx(3.5)
    assert to_decimal_odds(1.0) == pytest.approx(2.0)


def test_implied_probability():
    # decimal odds 4/1 (5.0) -> implied prob 20%
    assert implied_probability(5.0) == pytest.approx(0.2)


def test_next_increment_up():
    assert next_increment_up(2.5) == pytest.approx(3)
    assert next_increment_up(1.0) == pytest.approx(6 / 5)
    assert next_increment_up(99) == pytest.approx(99)  # top of table


def test_implied_prob_range_tote_board():
    # Board shows 5/2 (2.5). Actual could be up to just under 3.
    r = implied_prob_range(2.5, "tote_board")
    assert r.is_range is True
    assert r.point == pytest.approx(1 / 3.5)  # best case, displayed value
    assert r.high == pytest.approx(r.point)
    assert r.low == pytest.approx(1 / 4)  # worst case, next increment (3/1 -> decimal 4)
    assert r.low < r.high


def test_implied_prob_range_adw_is_exact():
    r = implied_prob_range(2.5, "adw_screenshot")
    assert r.is_range is False
    assert r.low == r.high == r.point
    assert r.point == pytest.approx(1 / 3.5)
