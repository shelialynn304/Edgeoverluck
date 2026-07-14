import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { parseOddsDisplay } from "../js/odds.js";
import { computeWinAnalysis } from "../js/analysis.js";

const RESOURCE_URI = "ui://tote-board-scanner/analyze-odds.html";

function formatFairOdds(decimalOdds: number): string {
  return isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
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
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Could not parse odds for horse(s): ${unparseable
                .map((h) => `#${h.number} ("${h.oddsDisplay}")`)
                .join(", ")}. Use formats like "5/2", "9-2", "3", or "EVEN".`,
            },
          ],
        };
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

  registerAppResource(
    server,
    RESOURCE_URI,
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
