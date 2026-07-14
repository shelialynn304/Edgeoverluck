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

function formatFairOdds(decimalOdds: number): string {
  return isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
}

function errorResult(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/**
 * Creates a new MCP server instance with the odds-analysis tool and its UI resource registered.
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
          kind: "win-analysis",
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
        "an interactive table of every winning combination.",
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
              keyPositions: z
                .array(z.number().int().min(0))
                .min(1)
                .describe(
                  "0-indexed finish positions the key horse occupies, e.g. [0] = key to win only, [0, 1] = key boxed over the top two spots",
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
        result = boxCost(wager.horses, positions, base);
      } else if (wager.structure === "key") {
        const outOfRange = wager.keyPositions.some((p) => p >= positions);
        if (outOfRange) {
          return errorResult(
            `keyPositions must be between 0 and ${positions - 1} for a ${wagerType}.`,
          );
        }
        if (wager.keyPositions.length >= positions) {
          return errorResult(
            `keyPositions must leave at least one position for the "others" group in a ${wagerType}.`,
          );
        }
        result = keyCost(wager.keyHorse, wager.others, positions, wager.keyPositions, base);
      } else {
        if (wager.positionGroups.length !== positions) {
          return errorResult(
            `A ${wagerType} wheel needs exactly ${positions} position groups; got ${wager.positionGroups.length}.`,
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
          kind: "exotic-ticket",
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
