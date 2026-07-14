import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  errorResult,
  MAX_DISPLAYED_COMBINATIONS,
  resolveWagerCost,
  RESOURCE_URI,
  suggestCheaperAlternatives,
  wagerSchema,
  WAGER_POSITIONS,
} from "./shared.js";

export function registerExoticTicketCostTool(server: McpServer): void {
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
        "large tickets; the reported total count and cost always reflect every combination). " +
        "If maxBudget is given and the ticket costs more, returns concrete cheaper alternatives " +
        "(never just a payout estimate — this tool prices tickets, it doesn't estimate winnings).",
      inputSchema: {
        wagerType: z
          .enum(["exacta", "trifecta", "superfecta"])
          .describe("Exacta = top 2 finishers, trifecta = top 3, superfecta = top 4"),
        base: z
          .number()
          .positive()
          .default(1)
          .describe("Bet unit per combination, e.g. 0.50, 1, or 2"),
        wager: wagerSchema.describe("The ticket structure and its horses"),
        maxBudget: z
          .number()
          .positive()
          .optional()
          .describe("Optional maximum you want to spend; if the ticket costs more, cheaper alternatives are suggested"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ wagerType, base, wager, maxBudget }): Promise<CallToolResult> => {
      const resolution = resolveWagerCost(wagerType, wager, base);
      if (!resolution.ok) {
        return errorResult(resolution.error);
      }
      const { combos, cost, combinations: allCombinations } = resolution;

      const overBudget = maxBudget !== undefined && cost > maxBudget;
      const suggestions = overBudget
        ? suggestCheaperAlternatives(wagerType, wager, base, combos, maxBudget)
        : [];

      const truncated = allCombinations.length > MAX_DISPLAYED_COMBINATIONS;
      const combinations = allCombinations.slice(0, MAX_DISPLAYED_COMBINATIONS);

      const budgetLine = overBudget
        ? `\nOver your $${maxBudget!.toFixed(2)} budget. Suggestions:\n` +
          suggestions.map((s) => `- ${s.description}`).join("\n")
        : "";

      return {
        content: [
          {
            type: "text",
            text: `${wagerType} ${wager.structure}: ${combos} combo(s), $${cost.toFixed(2)} total at $${base.toFixed(2)} base${budgetLine}`,
          },
        ],
        structuredContent: {
          kind: "exotic-ticket-cost",
          wagerType,
          structure: wager.structure,
          base,
          positions: WAGER_POSITIONS[wagerType],
          totalCombos: combos,
          cost,
          combinations,
          truncated,
          maxBudget: maxBudget ?? null,
          overBudget,
          suggestions,
        },
      };
    },
  );
}
