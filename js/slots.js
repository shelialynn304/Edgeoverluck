// Slot machine expected-value estimate. True RTP (return to player) is set
// by the machine's hidden reel weightings and cannot be derived or verified
// from outside the machine -- this module always requires RTP as an input,
// never estimates or defaults it. Variance/volatility is similarly not
// modeled numerically (that also depends on hidden reel data); only a
// qualitative note is given based on a user-supplied volatility label.

/**
 * rtp: return-to-player as a fraction (e.g. 0.94 for 94%). Must be supplied
 * by the caller -- there is no default.
 */
export function expectedLossPerSpin(betAmount, rtp) {
  return betAmount * (1 - rtp);
}

export function expectedLossPerSession(betAmount, rtp, spins) {
  return expectedLossPerSpin(betAmount, rtp) * spins;
}

const VOLATILITY_NOTES = {
  low: "Low volatility: smaller, more frequent wins. Actual results tend to track close to the expected value over a session.",
  medium: "Medium volatility: a mix of small wins and occasional larger ones. Session results can swing noticeably from the expected value.",
  high: "High volatility: wins are rarer but larger. Session results can differ drastically from the expected value even over hundreds of spins -- the long-run average only shows up over a very large number of spins.",
};

export function volatilityNote(volatility) {
  return VOLATILITY_NOTES[volatility] ?? null;
}
