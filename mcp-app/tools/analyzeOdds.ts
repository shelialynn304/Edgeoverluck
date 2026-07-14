import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { computeWinAnalysis } from "../../js/analysis.js";
import { parseOddsDisplay } from "../../js/odds.js";
import { errorResult, findDuplicates, formatFairOdds, RESOURCE_URI } from "./shared.js";

export function registerAnalyzeOddsTool(server: McpServer): void {
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

      const dupes = findDuplicates(horses.map((h) => h.number));
      if (dupes.length > 0) {
        return errorResult(
          `Duplicate horse number(s) in "horses": ${dupes.join(", ")}. Each horse should appear once — a duplicate would double-count that runner in the overround/takeout math.`,
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
}
