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


def test_compute_overlay_missing_or_nan_returns_none():
    # Mirrors js/analysis.js: computeOverlay returns null for null/undefined/NaN.
    assert compute_overlay(None, 2.0) is None
    assert compute_overlay(float("nan"), 2.0) is None


def test_compute_win_analysis_carries_tote_board_range():
    # Mirrors js/analysis.js: each result row carries impliedProbRange for its
    # own source_type. Board 5/2 -> point 1/3.5 (best case), low 1/4 (next
    # increment 3/1 -> decimal 4, worst case).
    horses = [
        {"number": 1, "fractional_odds": 2.5, "source_type": "tote_board"},
        {"number": 2, "fractional_odds": 2.5, "source_type": "adw_screenshot"},
    ]
    result = compute_win_analysis(horses)

    tote, adw = result.horses
    assert tote.range.is_range is True
    assert tote.range.high == pytest.approx(1 / 3.5)
    assert tote.range.low == pytest.approx(1 / 4)

    assert adw.range.is_range is False
    assert adw.range.low == adw.range.high == pytest.approx(1 / 3.5)


def test_compute_win_analysis_scan_level_source_type_fallback():
    # The function-level source_type (pre-range signature, still accepted)
    # applies to rows without their own source_type; a per-row value wins.
    horses = [
        {"number": 1, "fractional_odds": 2.5},
        {"number": 2, "fractional_odds": 2.5, "source_type": "adw_screenshot"},
    ]
    result = compute_win_analysis(horses, source_type="tote_board")

    fallback, per_row = result.horses
    assert fallback.range.is_range is True
    assert per_row.range.is_range is False
