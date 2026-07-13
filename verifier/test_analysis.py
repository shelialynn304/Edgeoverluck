import pytest

from .analysis import compute_overlay, compute_win_analysis


def test_compute_win_analysis_worked_example():
    # q1 = 0.5 (fractional 1/1), q2 = q3 = 0.3 (fractional 7/3, decimal 10/3)
    horses = [
        {"number": 1, "fractional_odds": 1.0},
        {"number": 2, "fractional_odds": 7 / 3},
        {"number": 3, "fractional_odds": 7 / 3},
    ]
    result = compute_win_analysis(horses)

    assert result.overround == pytest.approx(1.1)
    assert result.effective_takeout == pytest.approx(1 - 1 / 1.1)

    h1, h2, h3 = result.horses
    assert h1.q == pytest.approx(0.5)
    assert h2.q == pytest.approx(0.3)
    assert h3.q == pytest.approx(0.3)

    assert h1.p == pytest.approx(0.5 / 1.1)
    assert h2.p == pytest.approx(0.3 / 1.1)

    assert h1.fair_decimal_odds == pytest.approx(1.1 / 0.5)
    assert h2.fair_decimal_odds == pytest.approx(1.1 / 0.3)


def test_compute_win_analysis_no_takeout():
    horses = [
        {"number": 1, "fractional_odds": 1.0},
        {"number": 2, "fractional_odds": 1.0},
    ]
    result = compute_win_analysis(horses)
    assert result.overround == pytest.approx(1.0)
    assert result.effective_takeout == pytest.approx(0.0)
    assert result.horses[0].fair_decimal_odds == pytest.approx(2.0)


def test_compute_overlay_positive_edge():
    overlay = compute_overlay(0.5, 2.2)
    assert overlay.is_overlay is True
    assert overlay.edge == pytest.approx(0.1)


def test_compute_overlay_negative_edge():
    overlay = compute_overlay(0.4, 2.2)
    assert overlay.is_overlay is False
    assert overlay.edge == pytest.approx(-0.12)


def test_compute_overlay_zero_edge_is_not_overlay():
    overlay = compute_overlay(0.5, 2.0)
    assert overlay.edge == pytest.approx(0.0)
    assert overlay.is_overlay is False
