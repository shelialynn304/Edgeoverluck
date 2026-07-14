// Blackjack house-edge estimate: a baseline + rule-adjustment table, not a
// full combinatorial/basic-strategy solver. Exact house edge depends on
// precise basic-strategy deviations per rule combination, which requires a
// much larger computation than is reasonable here. These figures are
// commonly published approximate rule-effect estimates (assuming correct
// basic strategy) and are deliberately presented as such, never as exact.

export const BASELINE_HOUSE_EDGE = 0.005; // 6-deck, S17, DAS, no surrender, 3:2 blackjack

// Deck-count adjustment relative to the 6-deck baseline (fewer decks favor
// the player slightly: more high cards remain concentrated after shuffling).
export const DECK_ADJUSTMENT = {
  1: -0.0048,
  2: -0.0032,
  4: -0.0006,
  6: 0,
  8: 0.0001,
};

export const RULE_ADJUSTMENTS = {
  dealerHitsSoft17: 0.0022, // H17 instead of S17
  noDoubleAfterSplit: 0.0014, // DAS not allowed
  lateSurrender: -0.0008, // late surrender allowed
  noResplitAces: 0.0003, // resplitting aces not allowed
  blackjackPaysSixToFive: 0.0139, // 6:5 instead of 3:2 -- a large, well-known bad-bet trap
};

/**
 * rules: {
 *   decks: 1|2|4|6|8,
 *   dealerHitsSoft17: bool,
 *   doubleAfterSplit: bool,
 *   lateSurrender: bool,
 *   resplitAces: bool,
 *   blackjackPayout: "3:2" | "6:5",
 * }
 * Returns { edge, breakdown: [{ label, adjustment }] }.
 */
export function estimateHouseEdge(rules) {
  const breakdown = [{ label: "Baseline (6-deck, S17, DAS, 3:2)", adjustment: BASELINE_HOUSE_EDGE }];

  const deckAdj = DECK_ADJUSTMENT[rules.decks];
  breakdown.push({ label: `${rules.decks}-deck shoe`, adjustment: deckAdj });

  if (rules.dealerHitsSoft17) {
    breakdown.push({ label: "Dealer hits soft 17", adjustment: RULE_ADJUSTMENTS.dealerHitsSoft17 });
  }
  if (!rules.doubleAfterSplit) {
    breakdown.push({ label: "No double after split", adjustment: RULE_ADJUSTMENTS.noDoubleAfterSplit });
  }
  if (rules.lateSurrender) {
    breakdown.push({ label: "Late surrender allowed", adjustment: RULE_ADJUSTMENTS.lateSurrender });
  }
  if (!rules.resplitAces) {
    breakdown.push({ label: "No resplitting aces", adjustment: RULE_ADJUSTMENTS.noResplitAces });
  }
  if (rules.blackjackPayout === "6:5") {
    breakdown.push({ label: "Blackjack pays 6:5", adjustment: RULE_ADJUSTMENTS.blackjackPaysSixToFive });
  }

  const edge = breakdown.reduce((sum, b) => sum + b.adjustment, 0);
  return { edge, breakdown };
}
