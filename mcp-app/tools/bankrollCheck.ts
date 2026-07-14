import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { bankrollGuardrail, recommendedStake } from "../../js/bankroll.js";
import { errorResult, RESOURCE_URI } from "./shared.js";

export function registerBankrollCheckTool(server: McpServer): void {
  registerAppTool(
    server,
    "bankroll-check",
    {
      title: "Bankroll Check",
      description:
        "Recommends a stake size using the Kelly criterion, given your bankroll, your own " +
        "independent win-probability estimate, and the market's decimal odds. Flags stakes that " +
        "exceed common single-wager bankroll-management guidance. Does not estimate a probability " +
        "of losing your whole bankroll (risk of ruin) — that requires variance assumptions this " +
        "tool does not model, and an unverified number would be worse than none.",
      inputSchema: {
        bankroll: z.number().positive().describe("Total bankroll available, in currency units"),
        winProb: z
          .number()
          .min(0)
          .max(1)
          .describe("Your own independent estimate of win probability (0-1) — not the market-implied probability"),
        decimalOdds: z.number().gt(1).describe("Market decimal odds, e.g. 3.5 for 5/2"),
        kellyMultiplier: z
          .number()
          .min(0)
          .max(1)
          .default(0.5)
          .describe("Fraction of full Kelly to actually stake, e.g. 0.5 for half Kelly (full Kelly is high-variance and rarely recommended)"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ bankroll, winProb, decimalOdds, kellyMultiplier }): Promise<CallToolResult> => {
      const impliedProb = 1 / decimalOdds;
      if (winProb <= impliedProb) {
        return errorResult(
          `No edge: your win-probability estimate (${(winProb * 100).toFixed(1)}%) does not exceed the market-implied probability (${(impliedProb * 100).toFixed(1)}%) at these odds. Kelly recommends no bet.`,
        );
      }

      const { fullKellyFraction, appliedFraction, stake } = recommendedStake(
        bankroll,
        winProb,
        decimalOdds,
        kellyMultiplier,
      );
      const guardrail = bankrollGuardrail(bankroll, stake);

      return {
        content: [
          {
            type: "text",
            text:
              `Full Kelly: ${(fullKellyFraction * 100).toFixed(2)}% of bankroll. ` +
              `At ${(kellyMultiplier * 100).toFixed(0)}% Kelly: stake $${stake.toFixed(2)} ` +
              `(${(appliedFraction * 100).toFixed(2)}% of bankroll). ${guardrail.message}`,
          },
        ],
        structuredContent: {
          kind: "bankroll-check",
          bankroll,
          winProb,
          decimalOdds,
          impliedProb,
          kellyMultiplier,
          fullKellyFraction,
          appliedFraction,
          stake,
          guardrailLevel: guardrail.level,
          guardrailMessage: guardrail.message,
        },
      };
    },
  );
}
