// Win-pool math: implied probability, overround, effective takeout, fair
// odds, and user-entered overlay/underlay detection. All formulas mirror
// verifier/test_analysis.py, which is the source of truth for correctness.

import { toDecimalOdds, impliedProbability, impliedProbRange } from "./odds.js";

/**
 * horses: [{ number, fractionalOdds, sourceType }]
 * Returns per-horse fair-odds rows plus pool-level overround/takeout.
 */
export function computeWinAnalysis(horses) {
  const withQ = horses.map((h) => {
    const decimalOdds = toDecimalOdds(h.fractionalOdds);
    const q = impliedProbability(decimalOdds);
    const range = impliedProbRange(h.fractionalOdds, h.sourceType);
    return { ...h, decimalOdds, q, range };
  });

  const overround = withQ.reduce((sum, h) => sum + h.q, 0);
  const effectiveTakeout = overround > 0 ? 1 - 1 / overround : 0;

  const withFair = withQ.map((h) => {
    const p = overround > 0 ? h.q / overround : 0;
    const fairDecimalOdds = p > 0 ? 1 / p : Infinity;
    return { ...h, p, fairDecimalOdds };
  });

  return { horses: withFair, overround, effectiveTakeout };
}

/**
 * Overlay/underlay flag from a user-entered win probability estimate.
 * Overlay when user_p * decimal_odds > 1 (positive expected value edge).
 */
export function computeOverlay(userProb, decimalOdds) {
  if (userProb === null || userProb === undefined || isNaN(userProb)) {
    return null;
  }
  const edge = userProb * decimalOdds - 1;
  return {
    isOverlay: edge > 0,
    edge,
  };
}
