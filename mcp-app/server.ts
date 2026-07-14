import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseOddsDisplay } from "../js/odds.js";
import { computeWinAnalysis } from "../js/analysis.js";
import { boxCost, keyCost, wheelCost } from "../js/exotics.js";

const RESOURCE_URI = "ui://tote-board-scanner/mcp-app.html";

const WAGER_POSITIONS = { exacta: 2, trifecta: 3, superfecta: 4 } as const;
const MAX_DISPLAYED_COMBINATIONS = 200;
const MAX_ENUMERATED_COMBINATIONS = 20_000;

function formatFairOdds(decimalOdds: number): string {
  return isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

function findDuplicates(numbers: number[]): number[] {
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
function permutationExceedsBudget(n: number, r: number, cap: number): boolean {
  let product = 1;
  for (let i = 0; i < r; i++) {
    product *= n - i;
    if (product > cap) return true;
  }
  return false;
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
function exceedsCombinationBudget(groupSizes: number[], cap: number): boolean {
  let product = 1;
  for (const size of groupSizes) {
    product *= size;
    if (product > cap) return true;
  }
  return false;
}

/**
 * Creates a new MCP server instance with the odds-analysis and exotic-ticket-cost
 * tools and their shared UI resource registered.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "tote-board-scanner",
    version: "1.0.0",
  });

  registerAppTool(
    server,
    "analyze-odds",
    {
      title: "Analyze Odds",
      description:
        "Analyzes horse racing win-pool odds: computes implied win probability, pool overround, " +
        "effective takeout, and fair odds for each horse. Renders an interactive results table. " +
        'Odds must be given exactly as displayed (e.g. "5/2", "9-2", "3", "EVEN").',
      inputSchema: {
        sourceType: z
          .enum(["tote_board", "adw_screenshot", "program", "tv_graphic", "unknown"])
          .default("tote_board")
          .describe(
            "Where the odds were read from. Tote board prices are rounded down, so results show a probability range; other sources are treated as exact.",
          ),
        horses: z
          .array(
            z.object({
              number: z.number().int().describe("Horse / program number"),
              oddsDisplay: z
                .string()
                .describe('Displayed odds exactly as shown, e.g. "5/2", "9-2", "3", "EVEN"'),
            }),
          )
          .min(1)
          .describe("Every horse currently on the board with its displayed odds"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ sourceType, horses }): Promise<CallToolResult> => {
      const parsed = horses.map((h) => ({
        ...h,
        fractionalOdds: parseOddsDisplay(h.oddsDisplay),
        sourceType,
      }));

      const unparseable = parsed.filter((h) => h.fractionalOdds === null);
      if (unparseable.length > 0) {
        return errorResult(
          `Could not parse odds for horse(s): ${unparseable
            .map((h) => `#${h.number} ("${h.oddsDisplay}")`)
            .join(", ")}. Use formats like "5/2", "9-2", "3", or "EVEN".`,
        );
      }

      const { horses: analyzed, overround, effectiveTakeout } = computeWinAnalysis(parsed);

      const summaryLines = analyzed.map(
        (h: any) =>
          `#${h.number} (${h.oddsDisplay}): implied ${(h.range.point * 100).toFixed(1)}%, fair odds ${formatFairOdds(h.fairDecimalOdds)}`,
      );

      return {
        content: [
          {
            type: "text",
            text:
              `Overround ${(overround * 100).toFixed(1)}%, effective takeout ${(effectiveTakeout * 100).toFixed(1)}%\n` +
              summaryLines.join("\n"),
          },
        ],
        structuredContent: {
          kind: "odds-analysis",
          sourceType,
          overround,
          effectiveTakeout,
          horses: analyzed.map((h: any) => ({
            number: h.number,
            oddsDisplay: h.oddsDisplay,
            decimalOdds: h.decimalOdds,
            impliedProbLow: h.range.low,
            impliedProbHigh: h.range.high,
            impliedProbPoint: h.range.point,
            isRange: h.range.isRange,
            fairProb: h.p,
            fairDecimalOdds: isFinite(h.fairDecimalOdds) ? h.fairDecimalOdds : null,
          })),
        },
      };
    },
  );

  registerAppTool(
    server,
    "exotic-ticket-cost",
    {
      title: "Exotic Ticket Cost",
      description:
        "Computes the number of combinations and total cost of an exacta/trifecta/superfecta " +
        "ticket for a box, key, or wheel structure, by combinatorial enumeration (not shortcut " +
        "formulas), so overlapping key/wheel horse groups are always counted correctly. Renders " +
        "an interactive table of the winning combinations (capped at 200 displayed rows for very " +
        "large tickets; the reported total count and cost always reflect every combination).",
      inputSchema: {
        wagerType: z
          .enum(["exacta", "trifecta", "superfecta"])
          .describe("Exacta = top 2 finishers, trifecta = top 3, superfecta = top 4"),
        base: z
          .number()
          .positive()
          .default(1)
          .describe("Bet unit per combination, e.g. 0.50, 1, or 2"),
        wager: z
          .discriminatedUnion("structure", [
            z.object({
              structure: z.literal("box"),
              horses: z
                .array(z.number().int())
                .min(1)
                .describe("Every horse number included in the box"),
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
                .describe(
                  "0-indexed finish position the key horse occupies, e.g. 0 = key to win, 1 = key to place",
                ),
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
          ])
          .describe("The ticket structure and its horses"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ wagerType, base, wager }): Promise<CallToolResult> => {
      const positions = WAGER_POSITIONS[wagerType];

      let result: { combos: number; cost: number; combinations: number[][] };
      if (wager.structure === "box") {
        if (wager.horses.length < positions) {
          return errorResult(
            `A ${wagerType} box needs at least ${positions} horses; got ${wager.horses.length}.`,
          );
        }
        const dupes = findDuplicates(wager.horses);
        if (dupes.length > 0) {
          return errorResult(`Duplicate horse number(s) in "horses": ${dupes.join(", ")}.`);
        }
        if (permutationExceedsBudget(wager.horses.length, positions, MAX_ENUMERATED_COMBINATIONS)) {
          return errorResult(
            `That ${wagerType} box is too large to enumerate (max ${MAX_ENUMERATED_COMBINATIONS} combinations). Use fewer horses.`,
          );
        }
        result = boxCost(wager.horses, positions, base);
      } else if (wager.structure === "key") {
        if (wager.keyPosition >= positions) {
          return errorResult(
            `keyPosition must be between 0 and ${positions - 1} for a ${wagerType}.`,
          );
        }
        const dupes = findDuplicates(wager.others);
        if (dupes.length > 0) {
          return errorResult(`Duplicate horse number(s) in "others": ${dupes.join(", ")}.`);
        }
        if (wager.others.includes(wager.keyHorse)) {
          return errorResult(`Key horse #${wager.keyHorse} cannot also appear in "others".`);
        }
        if (permutationExceedsBudget(wager.others.length, positions - 1, MAX_ENUMERATED_COMBINATIONS)) {
          return errorResult(
            `That ${wagerType} key is too large to enumerate (max ${MAX_ENUMERATED_COMBINATIONS} combinations). Use fewer "others" horses.`,
          );
        }
        result = keyCost(wager.keyHorse, wager.others, positions, [wager.keyPosition], base);
      } else {
        if (wager.positionGroups.length !== positions) {
          return errorResult(
            `A ${wagerType} wheel needs exactly ${positions} position groups; got ${wager.positionGroups.length}.`,
          );
        }
        for (const [i, group] of wager.positionGroups.entries()) {
          const dupes = findDuplicates(group);
          if (dupes.length > 0) {
            return errorResult(`Duplicate horse number(s) in position group ${i + 1}: ${dupes.join(", ")}.`);
          }
        }
        if (
          exceedsCombinationBudget(
            wager.positionGroups.map((g) => g.length),
            MAX_ENUMERATED_COMBINATIONS,
          )
        ) {
          return errorResult(
            `That ${wagerType} wheel's worst-case size exceeds ${MAX_ENUMERATED_COMBINATIONS} combinations, so it was refused as a precaution. ` +
              `This is a conservative check — heavily overlapping position groups may have a much smaller actual count — but retry with fewer horses per position.`,
          );
        }
        result = wheelCost(wager.positionGroups, base);
      }

      if (result.combos === 0) {
        return errorResult(
          `That ${wagerType} ${wager.structure} has no valid combinations — check for overlapping/duplicate horses across positions.`,
        );
      }

      const truncated = result.combinations.length > MAX_DISPLAYED_COMBINATIONS;
      const combinations = result.combinations.slice(0, MAX_DISPLAYED_COMBINATIONS);

      return {
        content: [
          {
            type: "text",
            text: `${wagerType} ${wager.structure}: ${result.combos} combo(s), $${result.cost.toFixed(2)} total at $${base.toFixed(2)} base`,
          },
        ],
        structuredContent: {
          kind: "exotic-ticket-cost",
          wagerType,
          structure: wager.structure,
          base,
          positions,
          totalCombos: result.combos,
          cost: result.cost,
          combinations,
          truncated,
        },
      };
    },
  );

  registerAppResource(
    server,
    "Tote Board Scanner UI",
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(import.meta.dirname, "dist", "mcp-app.html"), "utf-8");

      return {
        contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}
