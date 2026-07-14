/**
 * @file Interactive odds-analysis UI for the tote-board-scanner MCP App.
 * Renders the server-computed fair-odds table and lets the user type a
 * win-probability estimate per horse to see a live overlay/underlay edge,
 * reusing the same verified computeOverlay() used by the web app.
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

interface AnalysisResult {
  sourceType: string;
  overround: number;
  effectiveTakeout: number;
  horses: AnalyzedHorse[];
}

const mainEl = document.querySelector(".main") as HTMLElement;
const overroundEl = document.getElementById("overround")!;
const takeoutEl = document.getElementById("takeout")!;
const rowsEl = document.getElementById("odds-rows")!;

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatFairOdds(decimalOdds: number | null): string {
  return decimalOdds !== null && isFinite(decimalOdds) ? `${decimalOdds.toFixed(2)}:1` : "—";
}

function extractAnalysis(result: CallToolResult): AnalysisResult | null {
  return (result.structuredContent as AnalysisResult | undefined) ?? null;
}

function renderRow(horse: AnalyzedHorse): HTMLTableRowElement {
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

function renderAnalysis(analysis: AnalysisResult | null): void {
  if (!analysis) {
    rowsEl.innerHTML = `<tr><td colspan="6">No analysis available.</td></tr>`;
    return;
  }

  overroundEl.textContent = pct(analysis.overround);
  takeoutEl.textContent = pct(analysis.effectiveTakeout);

  rowsEl.innerHTML = "";
  for (const horse of analysis.horses) {
    rowsEl.appendChild(renderRow(horse));
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
const app = new App({ name: "Odds Analysis", version: "1.0.0" });

// 2. Register handlers BEFORE connecting
app.ontoolinput = (params) => {
  console.info("Received tool call input:", params);
};

app.ontoolresult = (result) => {
  renderAnalysis(extractAnalysis(result));
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
