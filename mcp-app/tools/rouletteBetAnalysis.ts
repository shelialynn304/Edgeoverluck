import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { analyzeBet } from "../../js/roulette.js";
import { errorResult, RESOURCE_URI } from "./shared.js";

export function registerRouletteBetAnalysisTool(server: McpServer): void {
  registerAppTool(
    server,
    "roulette-bet-analysis",
    {
      title: "Roulette Bet Analysis",
      description:
        "Computes payout odds, house edge, and expected value for a standard roulette bet " +
        "(straight, split, street, corner, six-line, column, dozen, or an even-money bet like " +
        "red/black) on an American (double-zero) or European (single-zero) wheel. Every standard " +
        "bet type carries the same house edge on a given wheel — this is a real property of " +
        "roulette, not a simplification.",
      inputSchema: {
        wheelType: z.enum(["american", "european"]).describe("American = 38 pockets (0 and 00); European = 37 pockets (0 only)"),
        betType: z
          .enum(["straight", "split", "street", "corner", "six_line", "column", "dozen", "even_money"])
          .describe(
            "straight=1 number, split=2, street=3, corner=4, six_line=6, column/dozen=12, even_money=18 (red/black, even/odd, high/low)",
          ),
        betAmount: z.number().positive().describe("Flat bet amount in currency units"),
        enPartage: z
          .boolean()
          .default(false)
          .describe(
            "European-only 'la partage'/'en prison' rule: on an even-money bet, a zero spin returns half the stake, roughly halving the house edge for that bet. No effect on other bet types or the American wheel.",
          ),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ wheelType, betType, betAmount, enPartage }): Promise<CallToolResult> => {
      if (enPartage && wheelType === "american") {
        return errorResult(`"enPartage" only applies to the European wheel.`);
      }
      if (enPartage && betType !== "even_money") {
        return errorResult(`"enPartage" only applies to even-money bets (red/black, even/odd, high/low).`);
      }

      const analysis = analyzeBet(wheelType, betType, betAmount, enPartage);

      return {
        content: [
          {
            type: "text",
            text:
              `${wheelType} wheel, ${betType.replace("_", " ")} bet: pays ${analysis.payoutToOne.toFixed(0)}:1, ` +
              `house edge ${(analysis.houseEdge * 100).toFixed(2)}%, expected value $${analysis.expectedValue.toFixed(2)} ` +
              `on a $${betAmount.toFixed(2)} bet.`,
          },
        ],
        structuredContent: {
          kind: "roulette-bet-analysis",
          wheelType,
          betType,
          betAmount,
          enPartage,
          pocketCount: analysis.pocketCount,
          numbersCovered: analysis.numbersCovered,
          payoutToOne: analysis.payoutToOne,
          houseEdge: analysis.houseEdge,
          expectedValue: analysis.expectedValue,
        },
      };
    },
  );
}
