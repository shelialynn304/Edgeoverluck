import pytest

from .bankroll import bankroll_guardrail, kelly_fraction, recommended_stake


def test_kelly_fraction_positive_edge():
    # Decimal odds 3.0 (2/1), 40% win prob: b=2, f=(0.4*2 - 0.6)/2 = 0.1
    assert kelly_fraction(0.4, 3.0) == pytest.approx(0.1)


def test_kelly_fraction_no_edge_is_zero():
    # Fair coin at even money has zero edge.
    assert kelly_fraction(0.5, 2.0) == pytest.approx(0.0)


def test_kelly_fraction_negative_edge_clamped_to_zero():
    # Bad bet: true win prob far below breakeven.
    assert kelly_fraction(0.1, 2.0) == 0.0


def test_kelly_fraction_zero_or_negative_net_odds():
    assert kelly_fraction(0.5, 1.0) == 0.0  # decimal odds 1.0 -> b=0
    assert kelly_fraction(0.5, 0.5) == 0.0  # b<0, degenerate input


def test_recommended_stake_applies_multiplier():
    rec = recommended_stake(1000, 0.4, 3.0, kelly_multiplier=0.5)
    assert rec.full_kelly_fraction == pytest.approx(0.1)
    assert rec.applied_fraction == pytest.approx(0.05)
    assert rec.stake == pytest.approx(50.0)


def test_recommended_stake_default_half_kelly():
    rec = recommended_stake(1000, 0.4, 3.0)
    assert rec.applied_fraction == pytest.approx(0.05)


def test_bankroll_guardrail_levels():
    assert bankroll_guardrail(1000, 30).level == "ok"
    assert bankroll_guardrail(1000, 60).level == "elevated"
    assert bankroll_guardrail(1000, 150).level == "high"
    assert bankroll_guardrail(1000, 250).level == "severe"


def test_bankroll_guardrail_invalid_bankroll():
    g = bankroll_guardrail(0, 10)
    assert g.level == "unknown"
    assert g.pct_of_bankroll is None
