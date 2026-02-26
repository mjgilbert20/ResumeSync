// semantic-ui.js — ES module bridge between semantic.js and the popup DOM.
// Loaded as <script type="module"> so it can use import() without converting
// the rest of popup.js into a module.

import { smartCompare, scoreLabel } from "./semantic.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const btn          = document.getElementById("smartCompareBtn");
const progressWrap = document.getElementById("modelProgress");
const progressFill = document.getElementById("modelProgressFill");
const progressLbl  = document.getElementById("modelProgressLabel");
const statusEl     = document.getElementById("smartCompareStatus");
const resultsEl    = document.getElementById("smartCompareResults");

// ── Helpers ───────────────────────────────────────────────────────────────────
function showProgress(pct, msg) {
  progressWrap.style.display = "block";
  progressFill.style.width   = `${pct}%`;
  progressLbl.textContent    = msg.replace("Downloading model", "Loading model");
}
function hideProgress() {
  progressWrap.style.display = "none";
}
function showStatus(type, msg) {
  statusEl.className     = `status-message ${type}`;
  statusEl.textContent   = msg;
  statusEl.style.display = "block";
  if (type === "success" || type === "info") {
    setTimeout(() => { statusEl.style.display = "none"; }, 4000);
  }
}

// ── Render results ────────────────────────────────────────────────────────────
function renderResults({ results, overall }) {
  const ov = scoreLabel(overall);

  let html = `
    <div class="smart-overall tier-${ov.tier}">
      <span class="smart-overall-label">Overall Semantic Match</span>
      <span class="smart-overall-score">${overall !== null ? Math.round(overall * 100) + "%" : "N/A"}</span>
      <span class="smart-overall-tier">${ov.label}</span>
    </div>`;

  for (const r of results) {
    const { label, tier } = scoreLabel(r.score);
    const pct = r.score !== null ? Math.round(r.score * 100) : null;

    html += `<div class="smart-section">
      <div class="smart-section-header">
        <span class="smart-section-name">${r.label}</span>
        <span class="smart-section-pct tier-text-${tier}">${pct !== null ? pct + "%" : "—"}</span>
      </div>`;

    if (pct !== null) {
      html += `
        <div class="sim-bar-track">
          <div class="sim-bar-fill tier-bar-${tier}" style="width:${pct}%"></div>
        </div>
        <div class="smart-section-verdict">${label}</div>`;
    } else {
      html += `<div class="smart-section-verdict muted">${r.reason}</div>`;
    }

    html += `</div>`;
  }

  html += `<p class="smart-privacy-note">
    🔒 All processing ran locally — no data was sent to any server.
  </p>`;

  resultsEl.innerHTML = html;
}

// ── Button handler ────────────────────────────────────────────────────────────
btn.addEventListener("click", async () => {
  resultsEl.innerHTML        = "";
  statusEl.style.display     = "none";
  btn.disabled               = true;

  try {
    const { currentResume } = await chrome.storage.local.get("currentResume");
    if (!currentResume) {
      showStatus("error", "No resume saved. Go to the Resume tab and save your resume first.");
      return;
    }

    const { rs_lastResult, rs_quickResult } = await chrome.storage.local.get(["rs_lastResult", "rs_quickResult"]);
    const profileData = rs_lastResult || rs_quickResult;

    if (!profileData) {
      showStatus("error", "No scan result found. Run a Quick Scan or Deep Scan on a profile first.");
      return;
    }

    const result = await smartCompare(currentResume, profileData, (pct, msg) => {
      showProgress(pct, msg);
    });

    hideProgress();
    renderResults(result);
    showStatus("success", "✓ Smart comparison complete!");

  } catch (err) {
    hideProgress();
    showStatus("error", `Error: ${err.message}`);
    console.error("SmartCompare error:", err);
  } finally {
    btn.disabled = false;
  }
});
