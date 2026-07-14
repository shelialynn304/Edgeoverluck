import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { boxCost, keyCost, wheelCost } from "../../js/exotics.js";

export const RESOURCE_URI = "ui://tote-board-scanner/mcp-app.html";

export const WAGER_POSITIONS = { exacta: 2, trifecta: 3, superfecta: 4 } as const;
export type WagerType = keyof typeof WAGER_POSITIONS;

export const MAX_DISPLAYED_COMBINATIONS = 200;
export const MAX_ENUMERATED_COMBINATIONS = 20_000;

export function formatFairOdds(decimalOdds: number): string {
  return isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
}

export function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export function findDuplicates(numbers: number[]): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const n of numbers) {
    if (seen.has(n)) dupes.add(n);
    seen.add(n);
  }
  return [...dupes];
}

/**
 * Exact combination count for box/key: since every non-fixed position reuses
 * the same horse pool, the true count is the falling-factorial permutation
 * n * (n-1) * ... * (n-r+1) — not just an upper bound. Bails out as soon as
 * the running product exceeds the cap, so this stays cheap even for huge n.
 */
export function permutationExceedsBudget(n: number, r: number, cap: number): boolean {
  let product = 1;
  for (let i = 0; i < r; i++) {
    product *= n - i;
    if (product > cap) return true;
  }
  return false;
}

function permutationCount(n: number, r: number): number {
  let product = 1;
  for (let i = 0; i < r; i++) product *= n - i;
  return product;
}

/**
 * Upper-bounds a wheel's enumeration work without materializing any
 * combinations: the true (distinct-horse) combination count can never exceed
 * the product of each position group's size, so if that product is within
 * budget, the real enumeration is guaranteed to be too. Because overlapping
 * groups can only ever *reduce* the true count below this product, this is a
 * conservative, worst-case check — it can reject wheels whose actual count
 * would have fit, but never accepts one that wouldn't.
 */
export function exceedsCombinationBudget(groupSizes: number[], cap: number): boolean {
  let product = 1;
  for (const size of groupSizes) {
    product *= size;
    if (product > cap) return true;
  }
  return false;
}

export const wagerSchema = z.discriminatedUnion("structure", [
  z.object({
    structure: z.literal("box"),
    horses: z.array(z.number().int()).min(1).describe("Every horse number included in the box"),
  }),
  z.object({
    structure: z.literal("key"),
    keyHorse: z.number().int().describe("The key horse number"),
    others: z
      .array(z.number().int())
      .min(1)
      .describe("Horse numbers boxed together in the non-key positions"),
    keyPosition: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed finish position the key horse occupies, e.g. 0 = key to win, 1 = key to place"),
  }),
  z.object({
    structure: z.literal("wheel"),
    positionGroups: z
      .array(z.array(z.number().int()).min(1))
      .min(1)
      .describe(
        "One horse-number array per finish position, in order (must have exactly as many groups as the wager type has positions)",
      ),
  }),
]);

export type WagerSpec = z.infer<typeof wagerSchema>;

export type WagerResolution =
  | { ok: true; combos: number; cost: number; combinations: number[][] }
  | { ok: false; error: string };

/**
 * Validates and prices a wager (box/key/wheel), sharing one implementation
 * across every tool that needs to cost out a ticket (exotic-ticket-cost,
 * compare-exotic-tickets, review-wager-plan) so the same input-safety rules
 * (duplicate rejection, exact/conservative enumeration budget, range checks)
 * apply everywhere rather than being re-derived per call site.
 */
export function resolveWagerCost(wagerType: WagerType, wager: WagerSpec, base: number): WagerResolution {
  const positions = WAGER_POSITIONS[wagerType];

  let result: { combos: number; cost: number; combinations: number[][] };

  if (wager.structure === "box") {
    if (wager.horses.length < positions) {
      return { ok: false, error: `A ${wagerType} box needs at least ${positions} horses; got ${wager.horses.length}.` };
    }
    const dupes = findDuplicates(wager.horses);
    if (dupes.length > 0) {
      return { ok: false, error: `Duplicate horse number(s) in "horses": ${dupes.join(", ")}.` };
    }
    if (permutationExceedsBudget(wager.horses.length, positions, MAX_ENUMERATED_COMBINATIONS)) {
      return {
        ok: false,
        error: `That ${wagerType} box is too large to enumerate (max ${MAX_ENUMERATED_COMBINATIONS} combinations). Use fewer horses.`,
      };
    }
    result = boxCost(wager.horses, positions, base);
  } else if (wager.structure === "key") {
    if (wager.keyPosition >= positions) {
      return { ok: false, error: `keyPosition must be between 0 and ${positions - 1} for a ${wagerType}.` };
    }
    const dupes = findDuplicates(wager.others);
    if (dupes.length > 0) {
      return { ok: false, error: `Duplicate horse number(s) in "others": ${dupes.join(", ")}.` };
    }
    if (wager.others.includes(wager.keyHorse)) {
      return { ok: false, error: `Key horse #${wager.keyHorse} cannot also appear in "others".` };
    }
    if (permutationExceedsBudget(wager.others.length, positions - 1, MAX_ENUMERATED_COMBINATIONS)) {
      return {
        ok: false,
        error: `That ${wagerType} key is too large to enumerate (max ${MAX_ENUMERATED_COMBINATIONS} combinations). Use fewer "others" horses.`,
      };
    }
    result = keyCost(wager.keyHorse, wager.others, positions, [wager.keyPosition], base);
  } else {
    if (wager.positionGroups.length !== positions) {
      return {
        ok: false,
        error: `A ${wagerType} wheel needs exactly ${positions} position groups; got ${wager.positionGroups.length}.`,
      };
    }
    for (const [i, group] of wager.positionGroups.entries()) {
      const dupes = findDuplicates(group);
      if (dupes.length > 0) {
        return { ok: false, error: `Duplicate horse number(s) in position group ${i + 1}: ${dupes.join(", ")}.` };
      }
    }
    if (exceedsCombinationBudget(wager.positionGroups.map((g) => g.length), MAX_ENUMERATED_COMBINATIONS)) {
      return {
        ok: false,
        error:
          `That ${wagerType} wheel's worst-case size exceeds ${MAX_ENUMERATED_COMBINATIONS} combinations, so it was refused as a precaution. ` +
          `This is a conservative check — heavily overlapping position groups may have a much smaller actual count — but retry with fewer horses per position.`,
      };
    }
    result = wheelCost(wager.positionGroups, base);
  }

  if (result.combos === 0) {
    return {
      ok: false,
      error: `That ${wagerType} ${wager.structure} has no valid combinations — check for overlapping/duplicate horses across positions.`,
    };
  }

  return { ok: true, ...result };
}

export interface BudgetSuggestion {
  type: "smaller_box" | "fewer_others" | "lower_base";
  description: string;
}

/**
 * When a resolved ticket costs more than the caller's stated budget, suggests
 * concretely computed cheaper alternatives rather than vague advice — either
 * a smaller horse pool (box/key) or a lower base bet (always applicable,
 * since cost scales linearly with base for a fixed combination count).
 */
export function suggestCheaperAlternatives(
  wagerType: WagerType,
  wager: WagerSpec,
  base: number,
  totalCombos: number,
  maxBudget: number,
): BudgetSuggestion[] {
  const positions = WAGER_POSITIONS[wagerType];
  const suggestions: BudgetSuggestion[] = [];

  if (wager.structure === "box") {
    for (let n = wager.horses.length - 1; n >= positions; n--) {
      if (permutationCount(n, positions) * base <= maxBudget) {
        suggestions.push({
          type: "smaller_box",
          description: `Use only ${n} of your ${wager.horses.length} horses in the box (${permutationCount(n, positions)} combos, $${(permutationCount(n, positions) * base).toFixed(2)}) to fit your $${maxBudget.toFixed(2)} budget.`,
        });
        break;
      }
    }
  } else if (wager.structure === "key") {
    const remainingPositions = positions - 1;
    for (let n = wager.others.length - 1; n >= remainingPositions; n--) {
      if (permutationCount(n, remainingPositions) * base <= maxBudget) {
        suggestions.push({
          type: "fewer_others",
          description: `Use only ${n} of your ${wager.others.length} "others" horses (${permutationCount(n, remainingPositions)} combos, $${(permutationCount(n, remainingPositions) * base).toFixed(2)}) to fit your $${maxBudget.toFixed(2)} budget.`,
        });
        break;
      }
    }
  }

  const lowerBase = maxBudget / totalCombos;
  suggestions.push({
    type: "lower_base",
    description: `Lower your base bet to $${lowerBase.toFixed(2)} to cover the same ${totalCombos} combination(s) within your $${maxBudget.toFixed(2)} budget.`,
  });

  return suggestions;
}
