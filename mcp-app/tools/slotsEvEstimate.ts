import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { expectedLossPerSession, expectedLossPerSpin, volatilityNote } from "../../js/slots.js";
import { RESOURCE_URI } from "./shared.js";

export function registerSlotsEvEstimateTool(server: McpServer): void {
  registerAppTool(
    server,
    "slots-ev-estimate",
    {
      title: "Slots Expected Value Estimate",
      description:
        "Estimates expected loss per spin and per session for a slot machine, GIVEN its RTP " +
        "(return to player). RTP is set by the machine's hidden reel weightings and cannot be " +
        "derived or verified from outside the machine — it must be supplied (e.g. from the game's " +
        "posted information or manufacturer specs), never guessed or defaulted. Volatility notes " +
        "are qualitative only; true variance also depends on hidden reel data.",
      inputSchema: {
        betAmount: z.number().positive().describe("Bet amount per spin, in currency units"),
        rtp: z
          .number()
          .gt(0)
          .lt(1)
          .describe("Return to player as a fraction, e.g. 0.94 for 94% — must come from the game's actual posted/specified RTP"),
        spins: z.number().int().positive().optional().describe("Optional number of spins to project a session loss over"),
        volatility: z.enum(["low", "medium", "high"]).optional().describe("Optional qualitative volatility tier, if known"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ betAmount, rtp, spins, volatility }): Promise<CallToolResult> => {
      const perSpin = expectedLossPerSpin(betAmount, rtp);
      const perSession = spins !== undefined ? expectedLossPerSession(betAmount, rtp, spins) : null;
      const note = volatility ? volatilityNote(volatility) : null;

      const sessionLine = perSession !== null ? ` Over ${spins} spins: expected loss $${perSession.toFixed(2)}.` : "";
      const noteLine = note ? `\n${note}` : "";

      return {
        content: [
          {
            type: "text",
            text: `At ${(rtp * 100).toFixed(1)}% RTP: expected loss $${perSpin.toFixed(2)} per $${betAmount.toFixed(2)} spin.${sessionLine}${noteLine}`,
          },
        ],
        structuredContent: {
          kind: "slots-ev-estimate",
          betAmount,
          rtp,
          spins: spins ?? null,
          volatility: volatility ?? null,
          expectedLossPerSpin: perSpin,
          expectedLossPerSession: perSession,
          volatilityNote: note,
        },
      };
    },
  );
}
