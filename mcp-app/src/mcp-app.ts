/**
 * @file Interactive UI for the Edge Over Luck MCP App. Shared by every tool
 * via the same resourceUri; the result's `kind` field selects which
 * renderer draws into #app-root.
 */
import {
  App,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import "./global.css";
import "./mcp-app.css";

import { computeOverlay } from "../../js/analysis.js";

interface AnalyzedHorse {
  number: number;
  oddsDisplay: string;
  decimalOdds: number;
  impliedProbLow: number;
  impliedProbHigh: number;
  impliedProbPoint: number;
  isRange: boolean;
  fairProb: number;
  fairDecimalOdds: number | null;
}

interface WinAnalysisResult {
  kind: "odds-analysis";
  sourceType: string;
  overround: number;
  effectiveTakeout: number;
  horses: AnalyzedHorse[];
}

interface BudgetSuggestion {
  type: "smaller_box" | "fewer_others" | "lower_base";
  description: string;
}

interface ExoticTicketResult {
  kind: "exotic-ticket-cost";
  wagerType: "exacta" | "trifecta" | "superfecta";
  structure: "box" | "key" | "wheel";
  base: number;
  positions: number;
  totalCombos: number;
  cost: number;
  combinations: number[][];
  truncated: boolean;
  maxBudget: number | null;
  overBudget: boolean;
  suggestions: BudgetSuggestion[];
}

interface TicketComparisonEntry {
  label: string;
  combos: number;
  cost: number;
  uniqueCombos: number;
  overlappingCombos: number;
  costPerUniqueCombo: number | null;
  addsNoNewCoverage: boolean;
}

interface TicketComparisonResult {
  kind: "ticket-comparison";
  wagerType: string;
  tickets: TicketComparisonEntry[];
  totalCost: number;
  totalUniqueCoverage: number;
  budget: number | null;
  overBudget: boolean;
}

interface BankrollCheckResult {
  kind: "bankroll-check";
  bankroll: number;
  winProb: number;
  decimalOdds: number;
  impliedProb: number;
  kellyMultiplier: number;
  fullKellyFraction: number;
  appliedFraction: number;
  stake: number;
  guardrailLevel: string;
  guardrailMessage: string;
}

interface RouletteBetAnalysisResult {
  kind: "roulette-bet-analysis";
  wheelType: "american" | "european";
  betType: string;
  betAmount: number;
  enPartage: boolean;
  pocketCount: number;
  numbersCovered: number;
  payoutToOne: number;
  houseEdge: number;
  expectedValue: number;
}

interface BlackjackAdjustment {
  label: string;
  adjustment: number;
}

interface BlackjackHouseEdgeResult {
  kind: "blackjack-house-edge";
  edge: number;
  breakdown: BlackjackAdjustment[];
  disclaimer: string;
}

interface SlotsEvEstimateResult {
  kind: "slots-ev-estimate";
  betAmount: number;
  rtp: number;
  spins: number | null;
  volatility: string | null;
  expectedLossPerSpin: number;
  expectedLossPerSession: number | null;
  volatilityNote: string | null;
}

interface ReviewWagerPlanResult {
  kind: "review-wager-plan";
  overround: number;
  effectiveTakeout: number;
  horses: AnalyzedHorse[];
  ticket: { wagerType: string; structure: string; base: number; totalCombos: number; cost: number } | null;
  bankroll: { amount: number; pctOfBankroll: number | null; guardrailLevel: string; guardrailMessage: string } | null;
  warnings: string[];
}

type ToolResultPayload =
  | WinAnalysisResult
  | ExoticTicketResult
  | TicketComparisonResult
  | BankrollCheckResult
  | RouletteBetAnalysisResult
  | BlackjackHouseEdgeResult
  | SlotsEvEstimateResult
  | ReviewWagerPlanResult;

const POSITION_LABELS = ["1st", "2nd", "3rd", "4th"];

const mainEl = document.querySelector(".main") as HTMLElement;
const rootEl = document.getElementById("app-root")!;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatFairOdds(decimalOdds: number | null): string {
  return decimalOdds !== null && isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
}

function extractPayload(result: CallToolResult): ToolResultPayload | null {
  return (result.structuredContent as ToolResultPayload | undefined) ?? null;
}

function extractErrorText(result: CallToolResult): string {
  const textBlock = result.content?.find((c): c is { type: "text"; text: string } => c.type === "text");
  return textBlock?.text ?? "The tool call failed.";
}

function renderError(message: string): void {
  rootEl.innerHTML = "";
  const p = document.createElement("p");
  p.className = "hint error";
  p.textContent = message;
  rootEl.appendChild(p);
}

/** Replaces a <ul> element's contents with one <li> per warning, safely (textContent, not innerHTML). */
function renderWarningsList(ul: HTMLElement, warnings: string[]): void {
  ul.innerHTML = "";
  for (const w of warnings) {
    const li = document.createElement("li");
    li.textContent = w;
    ul.appendChild(li);
  }
}

/** Escapes a caller-controlled string for safe interpolation into an innerHTML template. */
function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderWinAnalysis(analysis: WinAnalysisResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Overround</span> ${pct(analysis.overround)}</span>
      <span class="summary-item"><span class="summary-label">Effective takeout</span> ${pct(analysis.effectiveTakeout)}</span>
    </div>
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Odds</th>
          <th>Implied win %</th>
          <th>Fair odds</th>
          <th>Your estimate %</th>
          <th>Edge</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
    <p class="hint">Enter your own win-probability estimate for a horse to see whether the board price is an overlay (+EV) or underlay.</p>
  `;

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const horse of analysis.horses) {
    rowsEl.appendChild(renderWinAnalysisRow(horse));
  }
}

function renderWinAnalysisRow(horse: AnalyzedHorse): HTMLTableRowElement {
  const tr = document.createElement("tr");

  const impliedText = horse.isRange
    ? `${pct(horse.impliedProbLow)}–${pct(horse.impliedProbHigh)}`
    : pct(horse.impliedProbPoint);

  tr.innerHTML = `
    <td>${horse.number}</td>
    <td>${horse.oddsDisplay}</td>
    <td>${impliedText}</td>
    <td>${formatFairOdds(horse.fairDecimalOdds)}</td>
    <td><input type="number" min="0" max="100" step="0.1" placeholder="—" aria-label="Your win probability estimate for horse ${horse.number}" /></td>
    <td class="edge-cell">—</td>
  `;

  const estimateInput = tr.querySelector("input")!;
  const edgeCell = tr.querySelector(".edge-cell")!;

  estimateInput.addEventListener("input", () => {
    const raw = estimateInput.value;
    if (raw === "") {
      edgeCell.textContent = "—";
      edgeCell.className = "edge-cell";
      return;
    }
    const userProb = parseFloat(raw) / 100;
    const overlay = computeOverlay(userProb, horse.decimalOdds);
    if (!overlay) {
      edgeCell.textContent = "—";
      edgeCell.className = "edge-cell";
      return;
    }
    edgeCell.textContent = `${overlay.isOverlay ? "+" : ""}${(overlay.edge * 100).toFixed(1)}%`;
    edgeCell.className = `edge-cell ${overlay.isOverlay ? "overlay" : "underlay"}`;
  });

  return tr;
}

function renderExoticTicket(ticket: ExoticTicketResult): void {
  const labels = POSITION_LABELS.slice(0, ticket.positions);

  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Wager</span> ${ticket.wagerType} ${ticket.structure}</span>
      <span class="summary-item"><span class="summary-label">Base</span> $${ticket.base.toFixed(2)}</span>
      <span class="summary-item"><span class="summary-label">Combinations</span> ${ticket.totalCombos}</span>
      <span class="summary-item"><span class="summary-label">Total cost</span> $${ticket.cost.toFixed(2)}</span>
    </div>
    ${
      ticket.overBudget
        ? `<p class="hint error">Over your $${ticket.maxBudget!.toFixed(2)} budget.</p>
           <ul class="warnings"></ul>`
        : ""
    }
    <table class="data-table">
      <thead>
        <tr>${labels.map((label) => `<th>${label}</th>`).join("")}</tr>
      </thead>
      <tbody></tbody>
    </table>
    ${
      ticket.truncated
        ? `<p class="hint">Showing the first ${ticket.combinations.length} of ${ticket.totalCombos} combinations.</p>`
        : ""
    }
  `;

  if (ticket.overBudget) {
    const ul = rootEl.querySelector(".warnings") as HTMLElement;
    renderWarningsList(ul, ticket.suggestions.map((s) => s.description));
  }

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const combo of ticket.combinations) {
    const tr = document.createElement("tr");
    tr.innerHTML = combo.map((horse) => `<td>${horse}</td>`).join("");
    rowsEl.appendChild(tr);
  }
}

function renderTicketComparison(comparison: TicketComparisonResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Wager type</span> ${comparison.wagerType}</span>
      <span class="summary-item"><span class="summary-label">Total cost</span> $${comparison.totalCost.toFixed(2)}</span>
      <span class="summary-item"><span class="summary-label">Unique coverage</span> ${comparison.totalUniqueCoverage}</span>
    </div>
    ${comparison.overBudget ? `<p class="hint error">Over your $${comparison.budget!.toFixed(2)} combined budget.</p>` : ""}
    <table class="data-table">
      <thead>
        <tr>
          <th>Ticket</th>
          <th>Combos</th>
          <th>Cost</th>
          <th>Unique</th>
          <th>Overlapping</th>
          <th>$ / unique combo</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const t of comparison.tickets) {
    const tr = document.createElement("tr");
    if (t.addsNoNewCoverage) tr.classList.add("redundant-row");
    tr.innerHTML = `
      <td>${escapeHtml(t.label)}${t.addsNoNewCoverage ? " ⚠" : ""}</td>
      <td>${t.combos}</td>
      <td>$${t.cost.toFixed(2)}</td>
      <td>${t.uniqueCombos}</td>
      <td>${t.overlappingCombos}</td>
      <td>${t.costPerUniqueCombo !== null ? `$${t.costPerUniqueCombo.toFixed(2)}` : "—"}</td>
    `;
    rowsEl.appendChild(tr);
  }
}

function renderBankrollCheck(result: BankrollCheckResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Full Kelly</span> ${pct(result.fullKellyFraction)}</span>
      <span class="summary-item"><span class="summary-label">Applied (${pct(result.kellyMultiplier)} Kelly)</span> ${pct(result.appliedFraction)}</span>
      <span class="summary-item"><span class="summary-label">Recommended stake</span> $${result.stake.toFixed(2)}</span>
    </div>
    <p class="hint ${result.guardrailLevel !== "ok" ? "error" : ""}">${result.guardrailMessage}</p>
    <p class="hint">Market-implied probability at these odds: ${pct(result.impliedProb)}. Your estimate: ${pct(result.winProb)}.</p>
  `;
}

function renderRouletteBetAnalysis(result: RouletteBetAnalysisResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Wheel</span> ${result.wheelType} (${result.pocketCount} pockets)</span>
      <span class="summary-item"><span class="summary-label">Payout</span> ${result.payoutToOne.toFixed(0)}:1</span>
      <span class="summary-item"><span class="summary-label">House edge</span> ${pct(result.houseEdge)}</span>
      <span class="summary-item"><span class="summary-label">Expected value</span> $${result.expectedValue.toFixed(2)}</span>
    </div>
    <p class="hint">${result.betType.replace("_", " ")} bet, $${result.betAmount.toFixed(2)} flat${result.enPartage ? ", en partage/en prison applied" : ""}.</p>
  `;
}

function renderBlackjackHouseEdge(result: BlackjackHouseEdgeResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Estimated house edge</span> ${pct(result.edge)}</span>
    </div>
    <table class="data-table">
      <thead><tr><th>Factor</th><th>Adjustment</th></tr></thead>
      <tbody></tbody>
    </table>
    <p class="hint">${result.disclaimer}</p>
  `;

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const b of result.breakdown) {
    const tr = document.createElement("tr");
    const sign = b.adjustment >= 0 ? "+" : "";
    tr.innerHTML = `<td>${b.label}</td><td>${sign}${(b.adjustment * 100).toFixed(2)}%</td>`;
    rowsEl.appendChild(tr);
  }
}

function renderSlotsEvEstimate(result: SlotsEvEstimateResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">RTP</span> ${pct(result.rtp)}</span>
      <span class="summary-item"><span class="summary-label">Expected loss / spin</span> $${result.expectedLossPerSpin.toFixed(2)}</span>
      ${result.expectedLossPerSession !== null ? `<span class="summary-item"><span class="summary-label">Expected loss / session</span> $${result.expectedLossPerSession.toFixed(2)}</span>` : ""}
    </div>
    ${result.volatilityNote ? `<p class="hint">${result.volatilityNote}</p>` : ""}
    <p class="hint">RTP must come from the game's actual posted/specified value — it cannot be derived from play.</p>
  `;
}

function renderReviewWagerPlan(result: ReviewWagerPlanResult): void {
  rootEl.innerHTML = `
    <div class="summary">
      <span class="summary-item"><span class="summary-label">Overround</span> ${pct(result.overround)}</span>
      <span class="summary-item"><span class="summary-label">Effective takeout</span> ${pct(result.effectiveTakeout)}</span>
      ${result.ticket ? `<span class="summary-item"><span class="summary-label">Ticket cost</span> $${result.ticket.cost.toFixed(2)}</span>` : ""}
    </div>
    <table class="data-table">
      <thead>
        <tr><th>#</th><th>Odds</th><th>Implied win %</th><th>Fair odds</th></tr>
      </thead>
      <tbody></tbody>
    </table>
    ${
      result.ticket
        ? `<p class="hint">Ticket: ${result.ticket.wagerType} ${result.ticket.structure}, ${result.ticket.totalCombos} combo(s), $${result.ticket.cost.toFixed(2)}.</p>`
        : ""
    }
    ${
      result.bankroll
        ? `<p class="hint ${result.bankroll.guardrailLevel !== "ok" ? "error" : ""}">${result.bankroll.guardrailMessage}</p>`
        : ""
    }
    ${result.warnings.length > 0 ? `<p class="hint error">Warnings:</p><ul class="warnings"></ul>` : ""}
  `;

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const h of result.horses) {
    const tr = document.createElement("tr");
    const implied = h.isRange ? `~${pct(h.impliedProbPoint)}` : pct(h.impliedProbPoint);
    tr.innerHTML = `<td>${h.number}</td><td>${h.oddsDisplay}</td><td>${implied}</td><td>${formatFairOdds(h.fairDecimalOdds)}</td>`;
    rowsEl.appendChild(tr);
  }

  if (result.warnings.length > 0) {
    const ul = rootEl.querySelector(".warnings") as HTMLElement;
    renderWarningsList(ul, result.warnings);
  }
}

function renderResult(result: CallToolResult): void {
  if (result.isError) {
    renderError(extractErrorText(result));
  } else {
    const payload = extractPayload(result);
    if (!payload) {
      renderError("No structured data in the tool result.");
    } else if (payload.kind === "odds-analysis") {
      renderWinAnalysis(payload);
    } else if (payload.kind === "exotic-ticket-cost") {
      renderExoticTicket(payload);
    } else if (payload.kind === "ticket-comparison") {
      renderTicketComparison(payload);
    } else if (payload.kind === "bankroll-check") {
      renderBankrollCheck(payload);
    } else if (payload.kind === "roulette-bet-analysis") {
      renderRouletteBetAnalysis(payload);
    } else if (payload.kind === "blackjack-house-edge") {
      renderBlackjackHouseEdge(payload);
    } else if (payload.kind === "slots-ev-estimate") {
      renderSlotsEvEstimate(payload);
    } else if (payload.kind === "review-wager-plan") {
      renderReviewWagerPlan(payload);
    } else {
      renderError("Unrecognized tool result.");
    }
  }

  rootEl.setAttribute("aria-busy", "false");
}

function handleHostContextChanged(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }
  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }
  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
  if (ctx.safeAreaInsets) {
    mainEl.style.paddingTop = `${ctx.safeAreaInsets.top}px`;
    mainEl.style.paddingRight = `${ctx.safeAreaInsets.right}px`;
    mainEl.style.paddingBottom = `${ctx.safeAreaInsets.bottom}px`;
    mainEl.style.paddingLeft = `${ctx.safeAreaInsets.left}px`;
  }
}

// 1. Create app instance
const app = new App({ name: "Edge Over Luck Tools", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.ontoolinput = (params) => {
  console.info("Received tool call input:", params);
  rootEl.setAttribute("aria-busy", "true");
};

app.ontoolresult = (result) => {
  renderResult(result);
};

app.ontoolcancelled = (params) => {
  console.info("Tool call cancelled:", params.reason);
};

app.onerror = console.error;

app.onhostcontextchanged = handleHostContextChanged;

app.onteardown = async () => {
  return {};
};

// 3. Connect to host
app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) {
    handleHostContextChanged(ctx);
  }
});
