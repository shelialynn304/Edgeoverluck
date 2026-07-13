// Odds format parsing: fractional (5/2), dash (9-2), bare integers (3 = 3/1),
// EVEN/EVN/1-1, and morning-line decimals. Converts to decimal odds and
// implied probability, with tote-board rounding ranges per the build spec.

export const STANDARD_INCREMENTS = [
  1 / 9, 1 / 5, 2 / 5, 1 / 2, 3 / 5, 4 / 5, 1, 6 / 5, 7 / 5, 3 / 2, 8 / 5,
  9 / 5, 2, 5 / 2, 3, 7 / 2, 4, 9 / 2, 5, 6, 7, 8, 9, 10, 12, 15, 20, 30, 50,
  99,
];

const EVEN_ALIASES = new Set(["EVEN", "EVN", "1-1", "1/1", "EV"]);

/**
 * Parses a displayed odds string into fractional odds (b in a-for-b terms,
 * e.g. "5/2" -> 2.5). Returns null if unparseable.
 */
export function parseOddsDisplay(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "") return null;
  if (EVEN_ALIASES.has(s)) return 1;

  let m = s.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const b = parseFloat(m[2]);
    if (b === 0) return null;
    return parseFloat(m[1]) / b;
  }

  m = s.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (m) {
    const b = parseFloat(m[2]);
    if (b === 0) return null;
    return parseFloat(m[1]) / b;
  }

  m = s.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return parseFloat(m[1]);

  return null;
}

export function toDecimalOdds(fractionalOdds) {
  return fractionalOdds + 1;
}

export function impliedProbability(decimalOdds) {
  return 1 / decimalOdds;
}

/**
 * Finds the next standard tote-board increment strictly greater than the
 * given fractional odds. Falls back to the value itself if it's at or
 * beyond the top of the table (no known upper bound).
 */
export function nextIncrementUp(fractionalOdds) {
  for (const inc of STANDARD_INCREMENTS) {
    if (inc > fractionalOdds + 1e-9) return inc;
  }
  return fractionalOdds;
}

/**
 * Board odds are truncated/rounded down, so a displayed "5/2" really means
 * actual odds somewhere in [2.5, 3.0). Since higher odds means lower
 * probability, the displayed value is the *best-case* (highest) probability
 * and the next increment up is the *worst-case* (lowest) probability.
 * For non-tote_board sources (ADW screenshots), prices are exact, so no
 * range is produced.
 */
export function impliedProbRange(fractionalOdds, sourceType) {
  const decimalOdds = toDecimalOdds(fractionalOdds);
  const point = impliedProbability(decimalOdds);

  if (sourceType !== "tote_board") {
    return { low: point, high: point, point, isRange: false };
  }

  const upperFractional = nextIncrementUp(fractionalOdds);
  const low = impliedProbability(toDecimalOdds(upperFractional));

  return { low, high: point, point, isRange: true };
}

/**
 * Formats a fractional odds value back into an approximate "a/b" display
 * string, snapping to the nearest standard increment for readability.
 */
export function formatFractional(fractionalOdds) {
  if (!isFinite(fractionalOdds) || fractionalOdds < 0) return "—";
  let closest = STANDARD_INCREMENTS[0];
  let closestDiff = Math.abs(fractionalOdds - closest);
  for (const inc of STANDARD_INCREMENTS) {
    const diff = Math.abs(fractionalOdds - inc);
    if (diff < closestDiff) {
      closest = inc;
      closestDiff = diff;
    }
  }
  return fractionToLabel(closest);
}

const FRACTION_LABELS = {
  [1 / 9]: "1/9",
  [1 / 5]: "1/5",
  [2 / 5]: "2/5",
  [1 / 2]: "1/2",
  [3 / 5]: "3/5",
  [4 / 5]: "4/5",
  1: "1/1",
  [6 / 5]: "6/5",
  [7 / 5]: "7/5",
  [3 / 2]: "3/2",
  [8 / 5]: "8/5",
  [9 / 5]: "9/5",
  2: "2/1",
  [5 / 2]: "5/2",
  3: "3/1",
  [7 / 2]: "7/2",
  4: "4/1",
  [9 / 2]: "9/2",
  5: "5/1",
  6: "6/1",
  7: "7/1",
  8: "8/1",
  9: "9/1",
  10: "10/1",
  12: "12/1",
  15: "15/1",
  20: "20/1",
  30: "30/1",
  50: "50/1",
  99: "99/1",
};

function fractionToLabel(value) {
  return FRACTION_LABELS[value] || `${value.toFixed(2)}/1`;
}
