import { registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs/promises";
import path from "node:path";

import { registerAnalyzeOddsTool } from "./tools/analyzeOdds.js";
import { registerBankrollCheckTool } from "./tools/bankrollCheck.js";
import { registerBlackjackHouseEdgeTool } from "./tools/blackjackHouseEdge.js";
import { registerCompareExoticTicketsTool } from "./tools/compareExoticTickets.js";
import { registerExoticTicketCostTool } from "./tools/exoticTicketCost.js";
import { registerReviewWagerPlanTool } from "./tools/reviewWagerPlan.js";
import { registerRouletteBetAnalysisTool } from "./tools/rouletteBetAnalysis.js";
import { RESOURCE_URI } from "./tools/shared.js";
import { registerSlotsEvEstimateTool } from "./tools/slotsEvEstimate.js";

/**
 * Creates a new MCP server instance with every Edge Over Luck tool and their
 * shared UI resource registered. Horse-racing tools (analyze-odds,
 * exotic-ticket-cost, compare-exotic-tickets, review-wager-plan) are fully
 * implemented against this repo's Python-verified math. bankroll-check,
 * roulette-bet-analysis, blackjack-house-edge, and slots-ev-estimate are
 * standalone specialists for other Edge Over Luck game domains, each with
 * their own js/*.js + verifier/*.py pair.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "tote-board-scanner",
    version: "1.0.0",
  });

  registerAnalyzeOddsTool(server);
  registerExoticTicketCostTool(server);
  registerCompareExoticTicketsTool(server);
  registerReviewWagerPlanTool(server);
  registerBankrollCheckTool(server);
  registerRouletteBetAnalysisTool(server);
  registerBlackjackHouseEdgeTool(server);
  registerSlotsEvEstimateTool(server);

  registerAppResource(
    server,
    "Edge Over Luck Tools UI",
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
