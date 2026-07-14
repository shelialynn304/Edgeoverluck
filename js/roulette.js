// Roulette bet EV/house-edge. Every standard inside/outside bet (straight,
// split, street, corner, six-line, column, dozen, even-money) pays
// (36 / numbersCovered) - 1 to one, which makes every one of them carry the
// *same* house edge on a given wheel: edge = 1 - 36/pocketCount. This is a
// well-established property of roulette and is why no per-bet-type special
// casing is needed here (unlike the anomalous "top line" 0-00-1-2-3 bet on
// American wheels, which is deliberately not offered as a bet type below).

export const WHEEL_POCKETS = { american: 38, european: 37 };

export const BET_NUMBERS_COVERED = {
  straight: 1,
  split: 2,
  street: 3,
  corner: 4,
  six_line: 6,
  column: 12,
  dozen: 12,
  even_money: 18, // red/black, even/odd, high/low
};

/** Net payout (to 1) for a bet covering `numbersCovered` of the wheel's pockets. */
export function payoutFor(numbersCovered) {
  return 36 / numbersCovered - 1;
}

/**
 * House edge as a fraction (e.g. 0.0526 for American single-zero-adjacent).
 * enPartage: European-only "la partage"/"en prison" rule that returns half
 * the stake on an even-money bet when the ball lands on zero, roughly
 * halving the house edge for those specific bets.
 */
export function houseEdge(wheelType, betType, enPartage = false) {
  const pockets = WHEEL_POCKETS[wheelType];
  let edge = 1 - 36 / pockets;
  if (enPartage && wheelType === "european" && betType === "even_money") {
    edge = edge / 2;
  }
  return edge;
}

/**
 * Full bet analysis: payout odds, house edge, and expected value in
 * currency units for a given flat bet amount.
 */
export function analyzeBet(wheelType, betType, betAmount, enPartage = false) {
  const numbersCovered = BET_NUMBERS_COVERED[betType];
  const payout = payoutFor(numbersCovered);
  const edge = houseEdge(wheelType, betType, enPartage);
  const expectedValue = -edge * betAmount;
  return {
    pocketCount: WHEEL_POCKETS[wheelType],
    numbersCovered,
    payoutToOne: payout,
    houseEdge: edge,
    expectedValue,
  };
}
