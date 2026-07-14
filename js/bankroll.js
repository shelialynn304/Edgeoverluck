// Bankroll sizing: Kelly criterion stake recommendation and a simple
// percentage-of-bankroll guardrail. Deliberately does not attempt a
// risk-of-ruin probability estimate -- that requires variance assumptions
// per bet structure that aren't rigorously modeled here, and an
// under-verified "probability of losing everything" number is worse than no
// number at all for a real-money tool.

/**
 * Kelly criterion optimal bet fraction of bankroll.
 * winProb: estimated probability of winning (0-1, independent of the market).
 * decimalOdds: payout odds (e.g. 3.5 for 5/2).
 * Returns the fraction of bankroll to stake for full Kelly; 0 if there is no
 * edge (never returns negative -- that means "don't bet").
 */
export function kellyFraction(winProb, decimalOdds) {
  const b = decimalOdds - 1; // net odds
  if (b <= 0) return 0;
  const q = 1 - winProb;
  const f = winProb - q / b;
  return f > 0 ? f : 0;
}

/**
 * Recommended stake in currency units.
 * kellyMultiplier: fraction of full Kelly to actually bet (e.g. 0.5 for
 * "half Kelly"), since full Kelly is high-variance and rarely recommended
 * in practice. Defaults to 0.5.
 */
export function recommendedStake(bankroll, winProb, decimalOdds, kellyMultiplier = 0.5) {
  const fullKelly = kellyFraction(winProb, decimalOdds);
  const fraction = fullKelly * kellyMultiplier;
  return {
    fullKellyFraction: fullKelly,
    appliedFraction: fraction,
    stake: bankroll * fraction,
  };
}

/**
 * Flags whether a proposed stake exceeds common bankroll-management
 * guidance. These thresholds are general-purpose rules of thumb (not
 * derived from the specific bet), used only to produce a warning label.
 */
export function bankrollGuardrail(bankroll, stake) {
  if (bankroll <= 0) {
    return { pctOfBankroll: null, level: "unknown", message: "Bankroll must be a positive amount." };
  }
  const pct = stake / bankroll;
  let level = "ok";
  let message = "Within common single-wager guidance (under 5% of bankroll).";
  if (pct > 0.2) {
    level = "severe";
    message = "Over 20% of bankroll on a single wager -- most bankroll-management guidance considers this a serious risk of ruin.";
  } else if (pct > 0.1) {
    level = "high";
    message = "Over 10% of bankroll on a single wager -- higher than most bankroll-management guidance recommends.";
  } else if (pct > 0.05) {
    level = "elevated";
    message = "Over 5% of bankroll on a single wager -- above the most conservative common guidance, but not extreme.";
  }
  return { pctOfBankroll: pct, level, message };
}
