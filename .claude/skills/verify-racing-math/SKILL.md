---
name: verify-racing-math
description: Use this skill after any change to js/odds.js, js/analysis.js, js/exotics.js, js/bankroll.js, js/roulette.js, js/blackjack.js, or js/slots.js, or whenever asked to "verify the math", "check parity with the Python verifier", "run the math verifier", or "make sure the odds/analysis/exotics/bankroll/roulette/blackjack/slots engine still passes". Explains the JS/Python parity architecture and the exact steps to confirm a math change is safe to ship.
---

# Verify Racing Math

The tote-board-scanner's math (odds parsing, overround/fair-odds analysis, exotic ticket costs)
runs client-side in JS, but is only trusted to ship once an **independent** Python reimplementation
in `verifier/` agrees. There is no automated tool that diffs JS output against Python output — the
Python files are a hand-maintained second implementation, and CI (`.github/workflows/verify.yml`)
only runs `pytest` against the Python side. This means a JS-only change can pass every existing
check while silently drifting from what the verifier certifies. Treat that gap as the thing this
skill exists to close.

## The parity pairs

| JS module | Python mirror | Tests |
|---|---|---|
| `js/odds.js` | `verifier/odds.py` | `verifier/test_odds.py` |
| `js/analysis.js` | `verifier/analysis.py` | `verifier/test_analysis.py` |
| `js/exotics.js` | `verifier/exotics.py` | `verifier/test_exotics.py` |
| `js/bankroll.js` | `verifier/bankroll.py` | `verifier/test_bankroll.py` |
| `js/roulette.js` | `verifier/roulette.py` | `verifier/test_roulette.py` |
| `js/blackjack.js` | `verifier/blackjack.py` | `verifier/test_blackjack.py` |
| `js/slots.js` | `verifier/slots.py` | `verifier/test_slots.py` |

`mcp-app/tools/*.ts` import the JS modules directly rather than reimplementing them, so they
inherit whatever correctness the JS side has — they don't need their own verifier entries, but it
does mean a JS bug reaches the MCP tools too. `mcp-app/tools/shared.ts` holds the one shared
ticket-pricing function (`resolveWagerCost`) used by every tool that costs out a box/key/wheel
ticket — a bug fixed there is fixed everywhere at once, and conversely a change there needs the
same scrutiny as a change to `js/exotics.js` itself.

## Steps

1. **Identify what changed.** Any edit to a formula, edge-case branch, or the shape of a returned
   value in one of the JS modules above needs a matching Python change.
2. **Port the change to the matching `verifier/*.py` file.** Match behavior exactly, including edge
   cases (empty input, zero/negative values, non-finite results, unparseable strings). Prefer
   idiomatic Python over literal transliteration, but never let the *behavior* diverge.
3. **Update `verifier/test_*.py`** with new or adjusted cases covering the change — especially the
   edge case that motivated it.
4. **Run the verifier:**
   ```bash
   python -m pytest verifier/ -v
   ```
   All tests must pass. If `pytest`/dependencies aren't installed, install from
   `verifier/requirements.txt` first (`pip install -r verifier/requirements.txt`).
5. **If the change is reachable from `mcp-app/`**, also run its typecheck since it imports the JS
   modules directly:
   ```bash
   cd mcp-app && npm run typecheck
   ```
6. Only report the math change as complete after both of the above have actually been run and
   passed — not merely inspected for plausibility.

## Domain glossary

- **Fractional odds**: `b` in "a-for-b" (board `5/2` → `2.5`). **Decimal odds** = fractional + 1.
  Implied probability = `1 / decimal odds`.
- **Tote-board rounding**: displayed prices are truncated down, so `5/2` on a tote board means the
  true price is in `[2.5, 3.0)`. Only `source_type == "tote_board"` gets a probability *range*
  (displayed value = best case, next standard increment = worst case); other sources are exact.
- **Overround**: sum of implied probabilities across the pool (always `> 1`). **Effective takeout**
  = `1 - 1/overround`.
- **Fair odds**: implied probability normalized to remove the overround, so probabilities sum to 1.
  `fair_decimal_odds` is `Infinity` when `fair_prob` is 0 — always convert non-finite values to
  `null` at any JSON boundary rather than serializing `Infinity`.
- **Overlay/underlay**: `edge = user_prob * decimal_odds - 1`; positive edge = overlay (+EV).
- **Exotic tickets** (exacta/trifecta/superfecta, box/key/wheel): always solved by combinatorial
  enumeration over per-position horse groups (`enumerateCombinations`), never shortcut formulas —
  overlapping key/wheel groups break naive multiplication. Watch for duplicate horse numbers within
  a single position's group (inflates the count) and unbounded input sizes (bound the work *before*
  enumerating, not just the displayed output).
- **Kelly criterion**: `f* = winProb - (1-winProb)/b`, `b = decimalOdds - 1`, clamped to 0 when
  negative. No risk-of-ruin probability is computed (deliberately — see `js/bankroll.js`'s header
  comment for why).
- **Roulette**: `payout = 36/numbersCovered - 1` to one; house edge is `1 - 36/pocketCount`
  identically across every standard bet type on a given wheel (American 38 pockets, European 37).
- **Blackjack house edge**: an approximation (baseline + rule adjustments), not exact — this is the
  one module where "verify" means "confirm the adjustment table's arithmetic is internally
  consistent," not "confirm it matches real-world edge to the basis point." Never let a change make
  it look more precise than it is.
- **Slots**: `expectedLoss = bet * (1 - RTP)`; RTP is always a required caller input, never derived
  or defaulted, since it's set by hidden reel weightings.

## Common mistakes to avoid

1. Changing JS math and only checking that the app *looks* right in the browser — the verifier
   suite is the actual correctness gate, not visual inspection.
2. Updating the Python formula but not adding a test case for the specific bug/edge-case being fixed.
3. Letting `Infinity`, `NaN`, or Python's equivalents leak into a JSON response instead of `null`.
4. Assuming parity holds without actually running `pytest` in this session.
