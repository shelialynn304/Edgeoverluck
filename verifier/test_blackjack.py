import pytest

from .blackjack import estimate_house_edge


def test_baseline_rules():
    result = estimate_house_edge(
        decks=6,
        dealer_hits_soft_17=False,
        double_after_split=True,
        late_surrender=False,
        resplit_aces=True,
        blackjack_payout="3:2",
    )
    assert result.edge == pytest.approx(0.005)
    assert len(result.breakdown) == 2  # baseline + deck adjustment only


def test_h17_increases_edge():
    baseline = estimate_house_edge(6, False, True, False, True, "3:2")
    h17 = estimate_house_edge(6, True, True, False, True, "3:2")
    assert h17.edge > baseline.edge
    assert h17.edge == pytest.approx(baseline.edge + 0.0022)


def test_no_das_increases_edge():
    baseline = estimate_house_edge(6, False, True, False, True, "3:2")
    no_das = estimate_house_edge(6, False, False, False, True, "3:2")
    assert no_das.edge == pytest.approx(baseline.edge + 0.0014)


def test_late_surrender_decreases_edge():
    baseline = estimate_house_edge(6, False, True, False, True, "3:2")
    surrender = estimate_house_edge(6, False, True, True, True, "3:2")
    assert surrender.edge == pytest.approx(baseline.edge - 0.0008)


def test_six_to_five_blackjack_is_a_large_penalty():
    baseline = estimate_house_edge(6, False, True, False, True, "3:2")
    six_five = estimate_house_edge(6, False, True, False, True, "6:5")
    assert six_five.edge == pytest.approx(baseline.edge + 0.0139)
    # A well-known "bad bet" trap: 6:5 alone roughly triples the house edge.
    assert six_five.edge > baseline.edge * 2


def test_fewer_decks_favor_player():
    six_deck = estimate_house_edge(6, False, True, False, True, "3:2")
    one_deck = estimate_house_edge(1, False, True, False, True, "3:2")
    assert one_deck.edge < six_deck.edge


def test_breakdown_sums_to_edge():
    result = estimate_house_edge(8, True, False, True, False, "6:5")
    assert sum(b.adjustment for b in result.breakdown) == pytest.approx(result.edge)
