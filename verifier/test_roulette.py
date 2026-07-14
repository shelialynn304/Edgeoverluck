import pytest

from .roulette import analyze_bet, house_edge, payout_for


@pytest.mark.parametrize(
    "numbers_covered,expected_payout",
    [
        (1, 35),   # straight
        (2, 17),   # split
        (3, 11),   # street
        (4, 8),    # corner
        (6, 5),    # six line
        (12, 2),   # column/dozen
        (18, 1),   # even money
    ],
)
def test_payout_for(numbers_covered, expected_payout):
    assert payout_for(numbers_covered) == pytest.approx(expected_payout)


def test_house_edge_american():
    assert house_edge("american", "straight") == pytest.approx(2 / 38)


def test_house_edge_european():
    assert house_edge("european", "straight") == pytest.approx(1 / 37)


def test_house_edge_same_across_bet_types_on_same_wheel():
    for bet in ["straight", "split", "street", "corner", "six_line", "column", "dozen"]:
        assert house_edge("american", bet) == pytest.approx(2 / 38)


def test_en_partage_halves_even_money_edge_on_european():
    normal = house_edge("european", "even_money")
    partage = house_edge("european", "even_money", en_partage=True)
    assert partage == pytest.approx(normal / 2)


def test_en_partage_has_no_effect_on_american_or_non_even_money():
    assert house_edge("american", "even_money", en_partage=True) == pytest.approx(2 / 38)
    assert house_edge("european", "straight", en_partage=True) == pytest.approx(1 / 37)


def test_analyze_bet_expected_value_is_negative_house_edge_times_amount():
    result = analyze_bet("american", "straight", 100)
    assert result.expected_value == pytest.approx(-(2 / 38) * 100)
    assert result.payout_to_one == pytest.approx(35)
    assert result.pocket_count == 38
    assert result.numbers_covered == 1
