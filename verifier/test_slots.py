import pytest

from .slots import expected_loss_per_session, expected_loss_per_spin, volatility_note


def test_expected_loss_per_spin():
    assert expected_loss_per_spin(1.0, 0.94) == pytest.approx(0.06)


def test_expected_loss_per_spin_zero_at_100_pct_rtp():
    assert expected_loss_per_spin(5.0, 1.0) == pytest.approx(0.0)


def test_expected_loss_per_session():
    assert expected_loss_per_session(1.0, 0.94, 100) == pytest.approx(6.0)


def test_volatility_note_known_and_unknown():
    assert "Low volatility" in volatility_note("low")
    assert volatility_note("nonexistent") is None
