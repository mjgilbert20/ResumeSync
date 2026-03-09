// semantic-ui.js — ES module bridge between semantic.js and the popup DOM.
// Loaded as <script type="module"> so it can use import() without converting
// the rest of popup.js into a module.

import { smartCompare, scoreLabel } from "./semantic.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const btn          = document.getElementById("compareBtn");
const progressWrap = document.getElementById("modelProgress");
const progressFill = document.getElementById("modelProgressFill");
const progressLbl  = document.getElementById("modelProgressLabel");
const statusEl     = document.getElementById("compareStatus");
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
    // Check if resume is saved
    const { currentResume } = await chrome.storage.local.get("currentResume");
    if (!currentResume) {
      showStatus("error", "No resume saved. Go to the Resume tab and save your resume first.");
      return;
    }

    // Get active tab and extract profile
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showStatus("error", "Cannot access this page");
      return;
    }

    const isLinkedIn  = tab.url.includes("linkedin.com");
    const isHandshake = tab.url.includes("joinhandshake.com");
    
    if (!isLinkedIn && !isHandshake) {
      showStatus("info", "Navigate to a LinkedIn or Handshake profile first");
      return;
    }

    showStatus("info", "Extracting profile...");

    // Extract profile using appropriate scraper
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractProfile" });

    if (!response?.success) {
      showStatus("error", "Could not extract profile. Make sure you're on a profile page.");
      return;
    }

    const profileData = response.profileData;
    
    // Debug: Log extracted data
    console.log("Extracted profileData:", profileData);
    console.log("Resume data:", currentResume);
    console.log("Profile summary length:", profileData.summary?.length || 0);
    console.log("Profile experience:", profileData.experience);
    console.log("Profile education:", profileData.education);
    console.log("Profile skills:", profileData.skills);

    // Show progress and run smart compare
    showStatus("info", "Running semantic comparison with AI model...");

    const result = await smartCompare(currentResume, profileData, (pct, msg) => {
      showProgress(pct, msg);
    });
    
    // Debug: Log comparison results
    console.log("Comparison result:", result);

    hideProgress();
    renderResults(result);
    showStatus("success", "✓ Comparison complete!");

  } catch (err) {
    hideProgress();
    showStatus("error", `Error: ${err.message}`);
    console.error("Compare error:", err);
  } finally {
    btn.disabled = false;
  }
});
