import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { errorResult, resolveWagerCost, RESOURCE_URI, wagerSchema } from "./shared.js";

export function registerCompareExoticTicketsTool(server: McpServer): void {
  registerAppTool(
    server,
    "compare-exotic-tickets",
    {
      title: "Compare Exotic Tickets",
      description:
        "Compares two or more exacta/trifecta/superfecta tickets (all the same wager type) side by " +
        "side: cost, combination count, how much of each ticket's coverage is unique versus " +
        "redundant with the others, and cost per unique combination covered. Does not estimate " +
        "payout or claim broader coverage is better — coverage, cost, and prediction quality are " +
        "separate concerns.",
      inputSchema: {
        wagerType: z
          .enum(["exacta", "trifecta", "superfecta"])
          .describe("All compared tickets must be the same wager type"),
        tickets: z
          .array(
            z.object({
              label: z.string().optional().describe('Optional name, e.g. "Ticket A" (defaults to "Ticket 1", "Ticket 2", ...)'),
              base: z.number().positive().default(1).describe("Bet unit per combination for this ticket"),
              wager: wagerSchema,
            }),
          )
          .min(2)
          .describe("Two or more ticket structures to compare"),
        budget: z.number().positive().optional().describe("Optional total budget across all tickets combined"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ wagerType, tickets, budget }): Promise<CallToolResult> => {
      const resolved: { label: string; combos: number; cost: number; comboSet: Set<string> }[] = [];

      for (const [i, t] of tickets.entries()) {
        const label = t.label ?? `Ticket ${i + 1}`;
        const resolution = resolveWagerCost(wagerType, t.wager, t.base);
        if (!resolution.ok) {
          return errorResult(`${label}: ${resolution.error}`);
        }
        resolved.push({
          label,
          combos: resolution.combos,
          cost: resolution.cost,
          comboSet: new Set(resolution.combinations.map((c) => c.join(","))),
        });
      }

      const allCombos = new Set<string>();
      for (const r of resolved) {
        for (const c of r.comboSet) allCombos.add(c);
      }

      const comparisons = resolved.map((r, i) => {
        const otherCombos = new Set<string>();
        resolved.forEach((o, j) => {
          if (j !== i) for (const c of o.comboSet) otherCombos.add(c);
        });
        const uniqueCount = [...r.comboSet].filter((c) => !otherCombos.has(c)).length;
        const overlappingCount = r.combos - uniqueCount;
        return {
          label: r.label,
          combos: r.combos,
          cost: r.cost,
          uniqueCombos: uniqueCount,
          overlappingCombos: overlappingCount,
          costPerUniqueCombo: uniqueCount > 0 ? r.cost / uniqueCount : null,
          addsNoNewCoverage: uniqueCount === 0,
        };
      });

      const totalCost = resolved.reduce((sum, r) => sum + r.cost, 0);
      const totalUniqueCoverage = allCombos.size;
      const overBudget = budget !== undefined && totalCost > budget;

      const summaryLines = comparisons.map(
        (c) =>
          `${c.label}: ${c.combos} combo(s), $${c.cost.toFixed(2)}, ${c.uniqueCombos} unique` +
          (c.addsNoNewCoverage ? " — fully redundant with the other ticket(s)" : ""),
      );

      return {
        content: [
          {
            type: "text",
            text:
              `Compared ${resolved.length} tickets. Total cost $${totalCost.toFixed(2)}, ${totalUniqueCoverage} unique combination(s) covered overall.\n` +
              summaryLines.join("\n") +
              (overBudget ? `\nOver your $${budget!.toFixed(2)} budget.` : ""),
          },
        ],
        structuredContent: {
          kind: "ticket-comparison",
          wagerType,
          tickets: comparisons,
          totalCost,
          totalUniqueCoverage,
          budget: budget ?? null,
          overBudget,
        },
      };
    },
  );
}
