import { fileToBase64, scanOddsImage, ScanError } from "./vision.js";
import { parseOddsDisplay, formatFractional } from "./odds.js";
import { computeWinAnalysis, computeOverlay } from "./analysis.js";
import { boxCost, keyCost, wheelCost } from "./exotics.js";

// ---------------------------------------------------------------------
// State
// ---------------------------------------------------------------------
let pendingImage = null; // { base64, mediaType }
let extraction = null; // raw vision response, mutated by review edits
let confirmedHorses = []; // [{ number, fractionalOdds, oddsDisplay }]
let winAnalysis = null; // result of computeWinAnalysis
let scanTimestamp = null;

// ---------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------
const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const uploadPreview = document.getElementById("upload-preview");
const scanBtn = document.getElementById("scan-btn");
const resetUploadBtn = document.getElementById("reset-upload-btn");
const uploadError = document.getElementById("upload-error");

const reviewPanel = document.getElementById("review-panel");
const reviewSourceType = document.getElementById("review-source-type");
const reviewTbody = document.getElementById("review-tbody");
const reviewNotes = document.getElementById("review-notes");
const confirmBtn = document.getElementById("confirm-btn");
const backToUploadBtn = document.getElementById("back-to-upload-btn");

const resultsPanel = document.getElementById("results-panel");
const resultsTimestamp = document.getElementById("results-timestamp");
const disclaimerTime = document.getElementById("disclaimer-time");
const statOverround = document.getElementById("stat-overround");
const statTakeout = document.getElementById("stat-takeout");
const resultsTbody = document.getElementById("results-tbody");
const shareBtn = document.getElementById("share-btn");

const exoticsPanel = document.getElementById("exotics-panel");
const exoticType = document.getElementById("exotic-type");
const exoticStructure = document.getElementById("exotic-structure");
const exoticBase = document.getElementById("exotic-base");
const exoticBuilder = document.getElementById("exotic-builder");
const exoticCombos = document.getElementById("exotic-combos");
const exoticCost = document.getElementById("exotic-cost");

// ---------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------
uploadArea.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  hideError(uploadError);
  try {
    pendingImage = await fileToBase64(file);
    uploadPreview.src = `data:${pendingImage.mediaType};base64,${pendingImage.base64}`;
    uploadPreview.style.display = "block";
    scanBtn.disabled = false;
    resetUploadBtn.style.display = "inline-flex";
  } catch (err) {
    showError(uploadError, err.message || "Could not read that image.");
  }
});

resetUploadBtn.addEventListener("click", () => {
  pendingImage = null;
  fileInput.value = "";
  uploadPreview.style.display = "none";
  scanBtn.disabled = true;
  resetUploadBtn.style.display = "none";
  hideError(uploadError);
});

scanBtn.addEventListener("click", async () => {
  if (!pendingImage) return;
  hideError(uploadError);
  setBusy(scanBtn, true, "Scanning…");
  try {
    extraction = await scanOddsImage(pendingImage);
    scanTimestamp = new Date();
    renderReviewTable(extraction);
    showPanel(reviewPanel);
    reviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    if (err instanceof ScanError) {
      showError(uploadError, err.message);
    } else {
      showError(uploadError, "Something went wrong scanning that image.");
    }
  } finally {
    setBusy(scanBtn, false, "Scan Odds");
  }
});

// ---------------------------------------------------------------------
// Review step
// ---------------------------------------------------------------------
function renderReviewTable(data) {
  reviewSourceType.textContent = `Detected: ${formatSourceType(data.source_type)}. Review and correct any odds before analysis.`;
  reviewTbody.innerHTML = "";

  data.horses.forEach((horse, idx) => {
    const tr = document.createElement("tr");
    const confidence = horse.confidence || "high";
    if (confidence === "low" || confidence === "medium") {
      tr.classList.add(confidence === "low" ? "row-low-confidence" : "row-medium-confidence");
    }

    const numberTd = document.createElement("td");
    const numberInput = document.createElement("input");
    numberInput.type = "text";
    numberInput.value = horse.number ?? "";
    numberInput.dataset.field = "number";
    numberInput.dataset.idx = idx;
    numberTd.appendChild(numberInput);

    const oddsTd = document.createElement("td");
    oddsTd.classList.add("odds-cell");
    const oddsInput = document.createElement("input");
    oddsInput.type = "text";
    oddsInput.value = horse.odds_display ?? "";
    oddsInput.dataset.field = "odds_display";
    oddsInput.dataset.idx = idx;
    oddsTd.appendChild(oddsInput);

    const confTd = document.createElement("td");
    if (confidence === "low" || confidence === "medium") {
      const badge = document.createElement("span");
      badge.className = "badge check";
      badge.textContent = "Check this";
      confTd.appendChild(badge);
    } else {
      confTd.textContent = "High";
    }

    tr.appendChild(numberTd);
    tr.appendChild(oddsTd);
    tr.appendChild(confTd);
    reviewTbody.appendChild(tr);
  });

  if (data.notes) {
    reviewNotes.textContent = `Note from scan: ${data.notes}`;
    reviewNotes.style.display = "block";
  } else {
    reviewNotes.style.display = "none";
  }
}

function formatSourceType(type) {
  const labels = {
    tote_board: "Tote board",
    adw_screenshot: "ADW screenshot",
    program: "Racing program",
    tv_graphic: "TV graphic",
    unknown: "Unknown source",
  };
  return labels[type] || "Unknown source";
}

backToUploadBtn.addEventListener("click", () => {
  hidePanel(reviewPanel);
  resetUploadBtn.click();
});

confirmBtn.addEventListener("click", () => {
  const rows = Array.from(reviewTbody.querySelectorAll("tr"));
  const horses = [];
  const badRows = [];

  rows.forEach((tr, idx) => {
    const numberInput = tr.querySelector('input[data-field="number"]');
    const oddsInput = tr.querySelector('input[data-field="odds_display"]');
    const number = parseInt(numberInput.value, 10);
    const oddsDisplay = oddsInput.value.trim();
    const fractionalOdds = parseOddsDisplay(oddsDisplay);

    if (isNaN(number) || fractionalOdds === null) {
      badRows.push(idx + 1);
      return;
    }
    horses.push({ number, oddsDisplay, fractionalOdds, sourceType: extraction.source_type });
  });

  if (badRows.length > 0) {
    alert(`Row(s) ${badRows.join(", ")} have odds that can't be parsed. Fix or remove them before analyzing.`);
    return;
  }
  if (horses.length === 0) {
    alert("No valid horses to analyze.");
    return;
  }

  confirmedHorses = horses;
  winAnalysis = computeWinAnalysis(horses);
  renderResults();
  showPanel(resultsPanel);
  setupExotics();
  showPanel(exoticsPanel);
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

// ---------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------
function renderResults() {
  const timeLabel = scanTimestamp.toLocaleString();
  resultsTimestamp.textContent = `Snapshot: ${timeLabel}`;
  disclaimerTime.textContent = timeLabel;

  statOverround.textContent = winAnalysis.overround.toFixed(3);
  statTakeout.textContent = `${(winAnalysis.effectiveTakeout * 100).toFixed(1)}%`;

  resultsTbody.innerHTML = "";
  winAnalysis.horses.forEach((h) => {
    const tr = document.createElement("tr");

    const impliedLabel = h.range.isRange
      ? `${(h.range.low * 100).toFixed(1)}–${(h.range.high * 100).toFixed(1)}%`
      : `${(h.range.point * 100).toFixed(1)}%`;

    tr.innerHTML = `
      <td>${h.number}</td>
      <td>${h.oddsDisplay}</td>
      <td>${impliedLabel}</td>
      <td>${formatFractional(h.fairDecimalOdds - 1)}</td>
    `;

    const estTd = document.createElement("td");
    estTd.classList.add("prob-cell");
    const estInput = document.createElement("input");
    estInput.type = "number";
    estInput.min = "0";
    estInput.max = "100";
    estInput.step = "0.1";
    estInput.placeholder = "%";
    estTd.appendChild(estInput);
    tr.appendChild(estTd);

    const deltaTd = document.createElement("td");
    deltaTd.textContent = "—";
    tr.appendChild(deltaTd);

    estInput.addEventListener("input", () => {
      const val = parseFloat(estInput.value);
      if (isNaN(val)) {
        deltaTd.textContent = "—";
        deltaTd.classList.remove("badge", "overlay", "underlay");
        return;
      }
      const overlay = computeOverlay(val / 100, h.decimalOdds);
      const pct = (overlay.edge * 100).toFixed(1);
      deltaTd.innerHTML = `<span class="badge ${overlay.isOverlay ? "overlay" : "underlay"}">${overlay.isOverlay ? "Overlay" : "Underlay"} ${pct}%</span>`;
    });

    resultsTbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------
// Share to PNG
// ---------------------------------------------------------------------
shareBtn.addEventListener("click", () => {
  const canvas = renderShareCanvas();
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tote-board-scan.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
});

function renderShareCanvas() {
  const rowHeight = 34;
  const headerHeight = 110;
  const footerHeight = 60;
  const width = 640;
  const height = headerHeight + rowHeight * (winAnalysis.horses.length + 1) + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0b0b0d";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#c9a84c";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("Edge Over Luck — Tote Board Scanner", 24, 40);

  ctx.fillStyle = "#a3a3a8";
  ctx.font = "14px sans-serif";
  ctx.fillText(`Snapshot: ${scanTimestamp.toLocaleString()}`, 24, 64);
  ctx.fillText(
    `Overround ${winAnalysis.overround.toFixed(3)} · Effective takeout ${(winAnalysis.effectiveTakeout * 100).toFixed(1)}%`,
    24,
    84
  );

  let y = headerHeight;
  ctx.font = "bold 13px sans-serif";
  ctx.fillStyle = "#a3a3a8";
  ctx.fillText("#", 24, y);
  ctx.fillText("ODDS", 90, y);
  ctx.fillText("IMPLIED %", 220, y);
  ctx.fillText("FAIR ODDS", 380, y);
  y += rowHeight;

  ctx.font = "14px sans-serif";
  winAnalysis.horses.forEach((h) => {
    ctx.fillStyle = "#f5f5f2";
    const impliedLabel = h.range.isRange
      ? `${(h.range.low * 100).toFixed(1)}-${(h.range.high * 100).toFixed(1)}%`
      : `${(h.range.point * 100).toFixed(1)}%`;
    ctx.fillText(String(h.number), 24, y);
    ctx.fillText(h.oddsDisplay, 90, y);
    ctx.fillText(impliedLabel, 220, y);
    ctx.fillText(formatFractional(h.fairDecimalOdds - 1), 380, y);
    y += rowHeight;
  });

  ctx.fillStyle = "#a3a3a8";
  ctx.font = "12px sans-serif";
  ctx.fillText("Odds move until post. Math analysis only — not picks or guarantees.", 24, height - 36);
  ctx.fillStyle = "#c9a84c";
  ctx.font = "bold 13px sans-serif";
  ctx.fillText("edgeoverluck.com", 24, height - 16);

  return canvas;
}

// ---------------------------------------------------------------------
// Exotics
// ---------------------------------------------------------------------
function setupExotics() {
  exoticType.onchange = renderExoticBuilder;
  exoticStructure.onchange = renderExoticBuilder;
  exoticBase.onchange = computeExoticCost;
  renderExoticBuilder();
}

function horseNumbers() {
  return confirmedHorses.map((h) => h.number);
}

function renderExoticBuilder() {
  const positions = parseInt(exoticType.value, 10);
  const structure = exoticStructure.value;
  const numbers = horseNumbers();
  exoticBuilder.innerHTML = "";

  if (structure === "box") {
    exoticBuilder.appendChild(buildSelectionGrid("Select horses to box", numbers, "box-select"));
  } else if (structure === "key") {
    exoticBuilder.appendChild(buildSelectionGrid("Key horse (must finish 1st)", numbers, "key-select", true));
    exoticBuilder.appendChild(buildSelectionGrid("Others (box remaining positions)", numbers, "key-others"));
  } else if (structure === "wheel") {
    for (let i = 0; i < positions; i++) {
      const block = document.createElement("div");
      block.className = "position-block";
      const label = document.createElement("div");
      label.className = "position-label";
      label.textContent = `Position ${i + 1}`;
      block.appendChild(label);
      block.appendChild(buildSelectionGrid(null, numbers, `wheel-pos-${i}`));
      exoticBuilder.appendChild(block);
    }
  }

  computeExoticCost();
}

function buildSelectionGrid(label, numbers, groupName, singleSelect = false) {
  const wrap = document.createElement("div");
  if (label) {
    const labelEl = document.createElement("div");
    labelEl.className = "position-label";
    labelEl.textContent = label;
    wrap.appendChild(labelEl);
  }
  const grid = document.createElement("div");
  grid.className = "selection-grid";
  grid.dataset.group = groupName;
  numbers.forEach((n) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "grid-toggle";
    btn.textContent = n;
    btn.dataset.value = n;
    btn.addEventListener("click", () => {
      if (singleSelect) {
        grid.querySelectorAll(".grid-toggle").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      } else {
        btn.classList.toggle("active");
      }
      computeExoticCost();
    });
    grid.appendChild(btn);
  });
  wrap.appendChild(grid);
  return wrap;
}

function selectedValues(groupName) {
  const grid = exoticBuilder.querySelector(`[data-group="${groupName}"]`);
  if (!grid) return [];
  return Array.from(grid.querySelectorAll(".grid-toggle.active")).map((b) => parseInt(b.dataset.value, 10));
}

function computeExoticCost() {
  const positions = parseInt(exoticType.value, 10);
  const structure = exoticStructure.value;
  const base = parseFloat(exoticBase.value);
  let result = { combos: 0, cost: 0 };

  if (structure === "box") {
    const selected = selectedValues("box-select");
    if (selected.length >= positions) {
      result = boxCost(selected, positions, base);
    }
  } else if (structure === "key") {
    const keySel = selectedValues("key-select");
    const others = selectedValues("key-others").filter((n) => n !== keySel[0]);
    if (keySel.length === 1 && others.length >= positions - 1) {
      const keyPositions = [0];
      result = keyCost(keySel[0], others, positions, keyPositions, base);
    }
  } else if (structure === "wheel") {
    const groups = [];
    for (let i = 0; i < positions; i++) {
      groups.push(selectedValues(`wheel-pos-${i}`));
    }
    if (groups.every((g) => g.length > 0)) {
      result = wheelCost(groups, base);
    }
  }

  exoticCombos.textContent = result.combos;
  exoticCost.textContent = `$${result.cost.toFixed(2)}`;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function showPanel(panel) {
  panel.classList.remove("hidden");
}
function hidePanel(panel) {
  panel.classList.add("hidden");
}
function showError(box, message) {
  box.textContent = message;
  box.style.display = "block";
}
function hideError(box) {
  box.style.display = "none";
}
function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.textContent = label;
}
