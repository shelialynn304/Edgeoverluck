// Exotic ticket cost calculator. Every structure (box, key, wheel) reduces
// to the same enumeration primitive: a list of position groups, where a
// valid combination picks one distinct horse per position. This avoids the
// classic bug where overlapping key/wheel horse groups break naive
// combinatorial formulas.

/**
 * positionGroups: array of arrays of horse numbers, one array per finish
 * position (e.g. exacta = 2 groups, trifecta = 3, superfecta = 4).
 * Returns every valid ordered combination (distinct horse per position).
 */
export function enumerateCombinations(positionGroups) {
  const results = [];
  const path = [];

  function backtrack(idx) {
    if (idx === positionGroups.length) {
      results.push(path.slice());
      return;
    }
    for (const horse of positionGroups[idx]) {
      if (path.includes(horse)) continue;
      path.push(horse);
      backtrack(idx + 1);
      path.pop();
    }
  }

  backtrack(0);
  return results;
}

function costFromCombos(combos, base) {
  return {
    combos: combos.length,
    cost: combos.length * base,
    combinations: combos,
  };
}

/** Box: every selected horse in every position. n horses, k positions. */
export function boxCost(horses, positions, base) {
  const groups = Array.from({ length: positions }, () => horses);
  return costFromCombos(enumerateCombinations(groups), base);
}

/**
 * Key: a fixed key horse in one or more positions, boxed with "others" in
 * the remaining positions. keyPositions is a 0-indexed array marking which
 * finish positions the key horse occupies (e.g. [0] = key to win only,
 * [0, 1] = key box over the top two spots).
 */
export function keyCost(keyHorse, others, totalPositions, keyPositions, base) {
  const groups = [];
  for (let pos = 0; pos < totalPositions; pos++) {
    groups.push(keyPositions.includes(pos) ? [keyHorse] : others);
  }
  return costFromCombos(enumerateCombinations(groups), base);
}

/**
 * Wheel: an arbitrary horse group per position, enumerated directly.
 * This is the general primitive — box and key are special cases of it.
 */
export function wheelCost(positionGroups, base) {
  return costFromCombos(enumerateCombinations(positionGroups), base);
}
