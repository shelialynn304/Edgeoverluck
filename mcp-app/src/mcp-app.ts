/**
 * @file Interactive UI for the tote-board-scanner MCP App. Shared by both
 * tools (analyze-odds, exotic-ticket-cost) via the same resourceUri; the
 * result's `kind` field selects which renderer draws into #app-root.
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
  kind: "win-analysis";
  sourceType: string;
  overround: number;
  effectiveTakeout: number;
  horses: AnalyzedHorse[];
}

interface ExoticTicketResult {
  kind: "exotic-ticket";
  wagerType: "exacta" | "trifecta" | "superfecta";
  structure: "box" | "key" | "wheel";
  base: number;
  positions: number;
  totalCombos: number;
  cost: number;
  combinations: number[][];
  truncated: boolean;
}

type ToolResultPayload = WinAnalysisResult | ExoticTicketResult;

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

  const rowsEl = rootEl.querySelector("tbody")!;
  for (const combo of ticket.combinations) {
    const tr = document.createElement("tr");
    tr.innerHTML = combo.map((horse) => `<td>${horse}</td>`).join("");
    rowsEl.appendChild(tr);
  }
}

function renderResult(result: CallToolResult): void {
  if (result.isError) {
    renderError(extractErrorText(result));
    return;
  }

  const payload = extractPayload(result);
  if (!payload) {
    renderError("No structured data in the tool result.");
    return;
  }

  if (payload.kind === "win-analysis") {
    renderWinAnalysis(payload);
  } else if (payload.kind === "exotic-ticket") {
    renderExoticTicket(payload);
  } else {
    renderError("Unrecognized tool result.");
  }
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
const app = new App({ name: "Tote Board Scanner", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.ontoolinput = (params) => {
  console.info("Received tool call input:", params);
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
