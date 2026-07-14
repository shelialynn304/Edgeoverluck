import { registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { computeWinAnalysis } from "../../js/analysis.js";
import { bankrollGuardrail } from "../../js/bankroll.js";
import { parseOddsDisplay } from "../../js/odds.js";
import { errorResult, findDuplicates, formatFairOdds, resolveWagerCost, RESOURCE_URI, wagerSchema } from "./shared.js";

/**
 * Consolidated horse-racing workflow tool (the "Master Agent" / "MCP Workflow
 * Orchestrator" concept, scoped to what this repo actually implements today):
 * composes the existing verified odds-analysis, exotic-ticket-cost, and
 * bankroll functions directly into one report, enforcing the workflow rules
 * from that spec server-side rather than trusting the calling model to
 * always follow them:
 *   - a ticket is never shown without its cost
 *   - warnings (low-confidence data, ticket/analysis mismatches, budget
 *     concerns) are attached to the specific result they concern
 *   - uncertain input is never silently treated as confirmed
 *   - market odds alone are never turned into a betting recommendation —
 *     this tool reports analysis and cost, it does not tell the model or
 *     user what to wager
 * The vision-scan step (turning a photo into horses/odds) is intentionally
 * out of scope here; horses/odds are supplied the same way analyze-odds
 * takes them, with an optional confidence field for forward compatibility.
 */
export function registerReviewWagerPlanTool(server: McpServer): void {
  registerAppTool(
    server,
    "review-wager-plan",
    {
      title: "Review Wager Plan",
      description:
        "Consolidates win-odds analysis, an optional exotic ticket cost, and optional bankroll " +
        "guidance into a single reviewed report before a wager is placed. Enforces that a ticket " +
        "is never shown without its cost, that low-confidence or mismatched data is flagged next " +
        "to the affected result, and never issues a betting recommendation from market odds alone.",
      inputSchema: {
        sourceType: z
          .enum(["tote_board", "adw_screenshot", "program", "tv_graphic", "unknown"])
          .default("tote_board")
          .describe("Where the odds were read from"),
        horses: z
          .array(
            z.object({
              number: z.number().int().describe("Horse / program number"),
              oddsDisplay: z.string().describe('Displayed odds exactly as shown, e.g. "5/2", "9-2", "3", "EVEN"'),
              confidence: z
                .enum(["high", "medium", "low"])
                .optional()
                .describe("Optional read-confidence, e.g. from a scan step — low/medium confidence is flagged, never silently treated as confirmed"),
            }),
          )
          .min(1)
          .describe("Every horse currently on the board with its displayed odds"),
        ticket: z
          .object({
            wagerType: z.enum(["exacta", "trifecta", "superfecta"]),
            base: z.number().positive().default(1),
            wager: wagerSchema,
          })
          .optional()
          .describe("Optional exotic ticket to cost out and cross-check against the horses above"),
        bankroll: z
          .object({
            amount: z.number().positive().describe("Total bankroll available"),
            maxBudget: z.number().positive().optional().describe("Optional max you want to spend on this ticket"),
          })
          .optional()
          .describe("Optional bankroll context to flag the ticket cost against"),
      },
      _meta: { ui: { resourceUri: RESOURCE_URI } },
    },
    async ({ sourceType, horses, ticket, bankroll }): Promise<CallToolResult> => {
      const warnings: string[] = [];

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
          `Duplicate horse number(s) in "horses": ${dupes.join(", ")}. Each horse should appear once — a duplicate would double-count that runner in the odds analysis.`,
        );
      }

      for (const h of horses) {
        if (h.confidence === "low" || h.confidence === "medium") {
          warnings.push(`Horse #${h.number}'s odds are ${h.confidence}-confidence and have not been confirmed — verify before wagering.`);
        }
      }

      const { horses: analyzed, overround, effectiveTakeout } = computeWinAnalysis(parsed);
      const knownHorseNumbers = new Set(horses.map((h) => h.number));

      let ticketReport = null;
      if (ticket) {
        const ticketHorses: number[] =
          ticket.wager.structure === "box"
            ? ticket.wager.horses
            : ticket.wager.structure === "key"
              ? [ticket.wager.keyHorse, ...ticket.wager.others]
              : ticket.wager.positionGroups.flat();

        const unknownHorses = [...new Set(ticketHorses)].filter((n) => !knownHorseNumbers.has(n));
        if (unknownHorses.length > 0) {
          warnings.push(
            `Ticket includes horse(s) not covered by the odds analysis above: ${unknownHorses.join(", ")}. Their fair odds/overlay status is unknown.`,
          );
        }

        const resolution = resolveWagerCost(ticket.wagerType, ticket.wager, ticket.base);
        if (!resolution.ok) {
          return errorResult(`Ticket could not be costed, so it cannot be shown: ${resolution.error}`);
        }

        if (bankroll?.maxBudget !== undefined && resolution.cost > bankroll.maxBudget) {
          warnings.push(
            `Ticket cost $${resolution.cost.toFixed(2)} exceeds your stated budget of $${bankroll.maxBudget.toFixed(2)}.`,
          );
        }

        ticketReport = {
          wagerType: ticket.wagerType,
          structure: ticket.wager.structure,
          base: ticket.base,
          totalCombos: resolution.combos,
          cost: resolution.cost,
        };
      }

      let bankrollReport = null;
      if (bankroll && ticketReport) {
        const guardrail = bankrollGuardrail(bankroll.amount, ticketReport.cost);
        if (guardrail.level !== "ok") {
          warnings.push(`Bankroll: ${guardrail.message}`);
        }
        bankrollReport = {
          amount: bankroll.amount,
          pctOfBankroll: guardrail.pctOfBankroll,
          guardrailLevel: guardrail.level,
          guardrailMessage: guardrail.message,
        };
      }

      const summaryLines = analyzed.map(
        (h: any) =>
          `#${h.number} (${h.oddsDisplay}): implied ${(h.range.point * 100).toFixed(1)}%, fair odds ${formatFairOdds(h.fairDecimalOdds)}`,
      );

      const textParts = [
        `Overround ${(overround * 100).toFixed(1)}%, effective takeout ${(effectiveTakeout * 100).toFixed(1)}%`,
        ...summaryLines,
      ];
      if (ticketReport) {
        textParts.push(
          `Ticket: ${ticketReport.wagerType} ${ticketReport.structure}, ${ticketReport.totalCombos} combo(s), $${ticketReport.cost.toFixed(2)}.`,
        );
      }
      if (warnings.length > 0) {
        textParts.push("Warnings:", ...warnings.map((w) => `- ${w}`));
      }

      return {
        content: [{ type: "text", text: textParts.join("\n") }],
        structuredContent: {
          kind: "review-wager-plan",
          sourceType,
          overround,
          effectiveTakeout,
          horses: analyzed.map((h: any) => ({
            number: h.number,
            oddsDisplay: h.oddsDisplay,
            decimalOdds: h.decimalOdds,
            impliedProbPoint: h.range.point,
            isRange: h.range.isRange,
            fairDecimalOdds: isFinite(h.fairDecimalOdds) ? h.fairDecimalOdds : null,
          })),
          ticket: ticketReport,
          bankroll: bankrollReport,
          warnings,
        },
      };
    },
  );
}
