import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { estimateHouseEdge } from "../../js/blackjack.js";
import { RESOURCE_URI } from "./shared.js";

const DISCLAIMER =
  "Approximate estimate based on commonly published rule-effect adjustments for a player using " +
  "correct basic strategy — not a full combinatorial solve. True edge varies slightly by precise " +
  "game rules and dealer procedures, and assumes flawless basic strategy play.";

export function registerBlackjackHouseEdgeTool(server: McpServer): void {
  registerAppTool(
    server,
    "blackjack-house-edge",
    {
      title: "Blackjack House Edge",
      description:
        "Estimates the house edge for a blackjack game from its rule variants (deck count, " +
        "whether the dealer hits soft 17, double after split, late surrender, resplitting aces, " +
        "and the blackjack payout). This is a baseline-plus-rule-adjustment estimate, not a full " +
        "combinatorial solver — always presented with an explicit approximation disclaimer.",
      inputSchema: {
        decks: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8)]).describe("Number of decks in the shoe"),
        dealerHitsSoft17: z.boolean().default(false).describe("True if the dealer hits (rather than stands) on soft 17"),
        doubleAfterSplit: z.boolean().default(true).describe("True if doubling down after splitting is allowed"),
        lateSurrender: z.boolean().default(false).describe("True if late surrender is offered"),
        resplitAces: z.boolean().default(true).describe("True if resplitting aces is allowed"),
        blackjackPayout: z.enum(["3:2", "6:5"]).default("3:2").describe("Payout for a natural blackjack — 6:5 is a well-known bad-value trap"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ decks, dealerHitsSoft17, doubleAfterSplit, lateSurrender, resplitAces, blackjackPayout }): Promise<CallToolResult> => {
      const { edge, breakdown } = estimateHouseEdge({
        decks,
        dealerHitsSoft17,
        doubleAfterSplit,
        lateSurrender,
        resplitAces,
        blackjackPayout,
      });

      const breakdownLines = breakdown.map(
        (b: { label: string; adjustment: number }) =>
          `${b.label}: ${b.adjustment >= 0 ? "+" : ""}${(b.adjustment * 100).toFixed(2)}%`,
      );

      return {
        content: [
          {
            type: "text",
            text: `Estimated house edge: ${(edge * 100).toFixed(2)}%\n${breakdownLines.join("\n")}\n\n${DISCLAIMER}`,
          },
        ],
        structuredContent: {
          kind: "blackjack-house-edge",
          decks,
          dealerHitsSoft17,
          doubleAfterSplit,
          lateSurrender,
          resplitAces,
          blackjackPayout,
          edge,
          breakdown,
          disclaimer: DISCLAIMER,
        },
      };
    },
  );
}
