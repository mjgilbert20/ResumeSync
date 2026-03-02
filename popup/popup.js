// ResumeSync - Popup Script

// ── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const tabName = button.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");

    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    document.getElementById(`${tabName}-tab`).classList.add("active");

    if (tabName === "versions") loadVersionHistory();
  });
});

// ── Resume Tab ───────────────────────────────────────────────────────────────

//resume is being saved as a version, with metadata of the version, structured object (containing parsed info), and time stamp.
document.getElementById("saveResume").addEventListener("click", async () => {
  const statusEl = document.getElementById("saveStatus");

  //new parsing logic for experience and education fields. users can input in a structured format (company | title | duration) per line, which is then parsed into an array of objects. this allows for more consistent data handling and better comparison later on.
  const experienceInput = document.getElementById("experience").value;
  const educationInput = document.getElementById("education").value;

  const experienceData = parseExperience(experienceInput);
  const educationData = parseEducation(educationInput);

  if (experienceData == null || educationData == null) {
    showStatus(statusEl, "error", "Invalid format for experience or education. Please use 'Company | Title | Duration' per line.");
    return;
  }
  
  try {
    const resumeData = {
      fullName:    document.getElementById("fullName").value,
      email:       document.getElementById("email").value,
      phone:       document.getElementById("phone").value,
      title:       document.getElementById("title").value,
      summary:     document.getElementById("summary").value,
      experience:  experienceData,
      education:   educationData,
      skills:      document.getElementById("skills").value.split(",").map((s) => s.trim()).filter(Boolean),
      //lastUpdated: new Date().toISOString() - time stamp is already taken when a version is created & that timestamp is used for identification. no need to repeat it here again.
    };

    if (!resumeData.fullName || !resumeData.email) {
      showStatus(statusEl, "error", "Please fill in at least Name and Email");
      return;
    }

    await chrome.storage.local.set({ currentResume: resumeData });

    const notes = document.getElementById("versionNotes").value || "Manual save";
    await createVersion(resumeData, notes);

    showStatus(statusEl, "success", "✓ Resume saved successfully!");
    document.getElementById("versionNotes").value = "";
  } catch (err) {
    showStatus(statusEl, "error", `Error: ${err.message}`);
  }
});

document.getElementById("loadResume").addEventListener("click", async () => {
  const statusEl = document.getElementById("saveStatus");
  try {
    const result = await chrome.storage.local.get("currentResume");
    if (!result.currentResume) {
      showStatus(statusEl, "info", "No saved resume found");
      return;
    }
    const r = result.currentResume;
    populateForm(r); 
    showStatus(statusEl, "success", "✓ Resume loaded!");
  } catch (err) {
    showStatus(statusEl, "error", `Error: ${err.message}`);
  }
});

// ── Resume Tab — Import & Export ────────────────────────────────────────────

// Clicking the styled button triggers the hidden file input
document.getElementById("importResumeBtn").addEventListener("click", () => {
  document.getElementById("resumeFileInput").click();
});

document.getElementById("resumeFileInput").addEventListener("change", async (e) => {
  const statusEl = document.getElementById("importStatus");
  const file = e.target.files[0];
  if (!file) return;

  // Reset so re-uploading the same file fires the event again
  e.target.value = "";

  const text = await file.text();

  try {
    let parsed;

    if (file.name.endsWith(".json")) {
      // ── JSON import ──────────────────────────────────────────────────────
      // Accept either the extension's own format or any JSON with recognisable keys
      const raw = JSON.parse(text);

      // If it looks like our own export (has fullName or name at top level) use it directly
      parsed = {
        fullName:   raw.fullName   || raw.name        || "",
        email:      raw.email                          || "",
        phone:      raw.phone                          || "",
        title:      raw.title      || raw.headline     || "",
        summary:    raw.summary    || raw.about        || "",
        experience: raw.experience || [],
        education:  raw.education  || [],
        skills:     Array.isArray(raw.skills)
                      ? raw.skills
                      : typeof raw.skills === "string"
                        ? raw.skills.split(",").map((s) => s.trim()).filter(Boolean)
                        : []
      };

    } else if (file.name.endsWith(".pdf")) {
      // ── PDF import ───────────────────────────────────────────────────────
      showStatus(statusEl, "info", "Extracting text from PDF…");
      const buffer = await file.arrayBuffer();
      let pdfText;
      try {
        pdfText = await PDFExtract.extractText(buffer);
      } catch (pdfErr) {
        showStatus(statusEl, "error", `PDF error: ${pdfErr.message}`);
        return;
      }
      parsed = parsePlainTextResume(pdfText);

    } else if (file.name.endsWith(".txt")) {
      // ── Plain-text heuristic parser ──────────────────────────────────────
      parsed = parsePlainTextResume(text);

    } else {
      showStatus(statusEl, "error", "Unsupported file type. Use .json, .txt, or .pdf");
      return;
    }

    // Populate form fields
    populateForm(parsed);
    showStatus(statusEl, "success", `✓ Imported from ${file.name} — review the fields then hit Save.`);

  } catch (err) {
    showStatus(statusEl, "error", `Import failed: ${err.message}`);
  }
});

// Export the currently saved resume as a downloadable JSON file
document.getElementById("exportResumeBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("importStatus");
  try {
    const { currentResume } = await chrome.storage.local.get("currentResume");
    if (!currentResume) {
      showStatus(statusEl, "error", "No saved resume to export. Save your resume first.");
      return;
    }

    const blob = new Blob([JSON.stringify(currentResume, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `resumesync-${(currentResume.fullName || "resume").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(statusEl, "success", "✓ Resume exported!");
  } catch (err) {
    showStatus(statusEl, "error", `Export failed: ${err.message}`);
  }
});

// ── Plain-text resume parser ─────────────────────────────────────────────────
// Heuristic: find section headers (ALL CAPS or known keywords), split content
// under each header, extract email/phone via regex from the full text.

function parsePlainTextResume(text) {
  const lines = text.split(/\r?\n/);

  // Regex patterns
  const emailRe  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
  const phoneRe  = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/;

  // Known section header keywords (order matters — more specific first)
  const SECTION_PATTERNS = [
    { key: "summary",    re: /^(summary|professional\s+summary|objective|profile|about\s+me)/i },
    { key: "experience", re: /^(experience|work\s+experience|employment|work\s+history|professional\s+experience)/i },
    { key: "education",  re: /^(education|academic|academics|schooling|degrees?)/i },
    { key: "skills",     re: /^(skills|technical\s+skills|core\s+competencies|competencies|technologies|tools)/i },
    { key: "certs",      re: /^(certifications?|licen[sc]es?|credentials?)/i },
  ];

  // Identify which line numbers are section headers
  const sectionStarts = []; // [{ key, lineIndex }]
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    for (const { key, re } of SECTION_PATTERNS) {
      // Match if the line IS (or STARTS WITH) a keyword, or is a short all-caps line
      const isAllCaps = trimmed === trimmed.toUpperCase() && trimmed.length > 2 && /[A-Z]/.test(trimmed);
      if (re.test(trimmed) || (isAllCaps && SECTION_PATTERNS.some((p) => p.re.test(trimmed)))) {
        sectionStarts.push({ key, lineIndex: i });
        break;
      }
    }
  });

  // Extract text between section boundaries
  function extractSection(key) {
    const entry = sectionStarts.find((s) => s.key === key);
    if (!entry) return "";
    const nextEntry = sectionStarts.find((s) => s.lineIndex > entry.lineIndex);
    const end = nextEntry ? nextEntry.lineIndex : lines.length;
    return lines
      .slice(entry.lineIndex + 1, end)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n");
  }

  // Name: first non-empty line before any section header, that isn't an email/phone
  const firstSectionLine = sectionStarts.length ? sectionStarts[0].lineIndex : lines.length;
  const nameCandidate = lines
    .slice(0, firstSectionLine)
    .map((l) => l.trim())
    .find((l) => l && !emailRe.test(l) && !phoneRe.test(l) && l.length < 80);

  // Email and phone: scan full text
  const fullText = text;
  const emailMatch = fullText.match(emailRe);
  const phoneMatch = fullText.match(phoneRe);

  // Skills section: split on commas, bullets (•, -, *), newlines
  const skillsRaw = extractSection("skills");
  const skills = skillsRaw
    .split(/[,\n•\-\*]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 60);

  return {
    fullName:   nameCandidate  || "",
    email:      emailMatch?.[0] || "",
    phone:      phoneMatch?.[0] || "",
    title:      "",                          // hard to infer reliably; user fills in
    summary:    extractSection("summary"),
    experience: [],                          // structured data can't be reliably parsed from text
    education:  [],
    skills
  };
}

// ── Populate all form fields from a parsed object ────────────────────────────
function populateForm(r) {
  document.getElementById("fullName").value   = r.fullName   || "";
  document.getElementById("email").value      = r.email      || "";
  document.getElementById("phone").value      = r.phone      || "";
  document.getElementById("title").value      = r.title      || "";
  document.getElementById("summary").value    = r.summary    || "";
  //document.getElementById("experience").value = JSON.stringify(r.experience || [], null, 2);
  //instead of displaying JSON-stringified text, this will separate the company, title, and duration with commas, 
  //and then the description will be separated with a new line 
  document.getElementById("experience").value =
    (r.experience || [])
      .map(exp => {
        const company  = exp?.company  || "";
        const title    = exp?.title    || "";
        const duration = exp?.duration || "";

        return [company, title, duration]
          .filter(Boolean)   // removes empty values
          .join(", ");
      })
      .join("\n");
  document.getElementById("education").value  = JSON.stringify(r.education  || [], null, 2);
  document.getElementById("skills").value     = (r.skills || []).join(", ");

  updatePreview(); 
}

// -- Preview Tab - - Format resume data into a clean, copyable layout for pasting into job applications ----

//Turns raw JSON data into human readable format for copy-paste into job applications
function formatForApplication(data) {
  let html = '<div class="formatted-resume">';

  if (data.fullName) html += `<h2>${data.fullName}</h2>`;
  if (data.title) html += `<h3>${data.title}</h3>`;
  if (data.summary) html += `<p>${data.summary}</p>`;


  if (data.experience?.length) {
    html += `<h4>Experience</h4>`;
    data.experience.forEach((exp) => {
      html += `<p>- ${exp.title} at ${exp.company} (${exp.duration})</p>`;
    });
  }

  if (data.education?.length) {
    html += `<h4>Education</h4>`;
    data.education.forEach((edu) => {
      html += `<p>- ${edu.degree} from ${edu.school} (${edu.duration})</p>`;
    });
  }

  if (data.skills?.length) {
    html += `<h4>Skills</h4>`;
    data.skills.forEach((skill) => {
      html += `<p>- ${skill}</p>`;
    });
  }

  html += '</div>';
  return html;
}

function updatePreview() {
  const currentResume = {
    fullName: document.getElementById("fullName").value,
    title:    document.getElementById("title").value,
    summary:  document.getElementById("summary").value,
    experience: parseExperience(document.getElementById("experience").value) || [],
    education:  parseEducation(document.getElementById("education").value) || [],
    skills:     document.getElementById("skills").value.split(",").map(s => s.trim()).filter(s => s.length > 0)
  };

  const previewContainer = document.getElementById("formattedResume");
  if (previewContainer) {
    previewContainer.innerHTML = formatForApplication(currentResume);
  }

  //const displayContainer = document.getElementById("experienceDisplay");
  //if (displayContainer) {
    //displayContainer.innerHTML = formatForApplication(currentResume); 
  //}
}

// ── Compare Tab — Quick Scan ─────────────────────────────────────────────────

document.getElementById("scanProfile").addEventListener("click", async () => {
  const statusEl  = document.getElementById("compareStatus");
  const resultsEl = document.getElementById("comparisonResults");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) { showStatus(statusEl, "error", "Cannot access this page"); return; }

    const isLinkedIn  = tab.url.includes("linkedin.com");
    const isHandshake = tab.url.includes("joinhandshake.com");
    if (!isLinkedIn && !isHandshake) {
      showStatus(statusEl, "info", "Navigate to LinkedIn or Handshake first");
      return;
    }

    showStatus(statusEl, "info", "Scanning profile...");
    const response = await chrome.tabs.sendMessage(tab.id, { action: "extractProfile" });

    if (!response?.success) {
      showStatus(statusEl, "error", "Could not extract profile. Make sure you're on a profile page.");
      return;
    }

    const { currentResume } = await chrome.storage.local.get("currentResume");
    if (!currentResume) {
      showStatus(statusEl, "error", "No resume saved. Save your resume first.");
      return;
    }

    // Cache for Smart Compare
    await chrome.storage.local.set({ rs_quickResult: response.profileData });

    // Cache for Smart Compare
    await chrome.storage.local.set({ rs_quickResult: response.profileData });

    const comparison = compareResumeToProfile(currentResume, response.profileData);
    displayComparison(resultsEl, comparison, isLinkedIn ? "LinkedIn" : "Handshake");
    showStatus(statusEl, "success", "✓ Comparison complete!");
  } catch (err) {
    showStatus(statusEl, "error", `Error: ${err.message}`);
  }
});

// ── Compare Tab — Deep Scan LinkedIn ────────────────────────────────────────

document.getElementById("deepScanLinkedIn").addEventListener("click", async () => {
  const statusEl = document.getElementById("deepScanStatus");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.includes("linkedin.com/in/")) {
      showStatus(statusEl, "error", "Open a LinkedIn profile page (linkedin.com/in/...) first");
      return;
    }

    showStatus(statusEl, "info", "Starting deep scan — the tab will navigate through Certs → Skills → Home. Come back when it finishes.");
    await chrome.tabs.sendMessage(tab.id, { cmd: "START_CERTS_SKILLS_FLOW" });
    // Close popup so the user can watch/wait — the flow saves rs_lastResult when done
    window.close();
  } catch (err) {
    showStatus(statusEl, "error", `Error: ${err.message}`);
  }
});

document.getElementById("loadDeepResult").addEventListener("click", async () => {
  const statusEl  = document.getElementById("deepScanStatus");
  const resultsEl = document.getElementById("comparisonResults");
  try {
    const { rs_lastResult } = await chrome.storage.local.get("rs_lastResult");
    if (!rs_lastResult) {
      showStatus(statusEl, "info", "No deep scan result found. Run a deep scan first.");
      return;
    }

    const { currentResume } = await chrome.storage.local.get("currentResume");
    if (!currentResume) {
      showStatus(statusEl, "error", "No resume saved. Save your resume first.");
      return;
    }

    const comparison = compareResumeToDeepScan(currentResume, rs_lastResult);
    displayDeepComparison(resultsEl, comparison, rs_lastResult);
    showStatus(statusEl, "success", "✓ Deep scan result loaded!");
  } catch (err) {
    showStatus(statusEl, "error", `Error: ${err.message}`);
  }
});

// ── Version History ──────────────────────────────────────────────────────────

async function loadVersionHistory() {
  const listEl = document.getElementById("versionsList");
  try {
    const { resumeVersions } = await chrome.storage.local.get("resumeVersions");
    const versions = resumeVersions || [];

    if (versions.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No versions saved yet</p>';
      return;
    }

    listEl.innerHTML = versions.map((v) => {
      const date = new Date(v.timestamp).toLocaleString();
      return `
        <div class="version-item" data-version-id="${v.id}">
          <div class="version-header">
            <span class="version-date">📅 ${date}</span>
            <div class="version-actions">
              <button class="btn btn-secondary btn-small restore-version" data-version-id="${v.id}">Restore</button>
              <button class="btn btn-danger btn-small delete-version"  data-version-id="${v.id}">Delete</button>
            </div>
          </div>
          ${v.notes ? `<div class="version-notes">"${v.notes}"</div>` : ""}
          <div class="version-summary">
            ${v.data.fullName || "Unnamed"} | ${v.data.title || "No title"} | ${(v.data.skills || []).length} skills
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll(".restore-version").forEach((btn) => {
      btn.addEventListener("click", async (e) => restoreVersion(parseInt(e.target.dataset.versionId)));
    });
    listEl.querySelectorAll(".delete-version").forEach((btn) => {
      btn.addEventListener("click", async (e) => deleteVersion(parseInt(e.target.dataset.versionId)));
    });
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state">Error: ${err.message}</p>`;
  }
}

//creates the actual version here!!
async function createVersion(resumeData, notes) {
  //resume versions: array storing all of the previously saved versions. 
  //if it exists, we will store this new version there. otherwise, create new array
  const { resumeVersions } = await chrome.storage.local.get("resumeVersions");
  const versions = resumeVersions || [];
  //unshift function: moves down the array & adds a new element at the 1st index. saving id, data, and timestamp
  //cutoff: 20 versions. if more, remove the last element of the array.
  versions.unshift({ id: Date.now(), data: resumeData, notes, timestamp: new Date().toISOString() });
  if (versions.length > 20) versions.splice(20);
  //
  await chrome.storage.local.set({ resumeVersions: versions });
}

async function restoreVersion(versionId) {
  try {
    const { resumeVersions } = await chrome.storage.local.get("resumeVersions");
    const version = (resumeVersions || []).find((v) => v.id === versionId);
    if (!version) { alert("Version not found"); return; }
    await chrome.storage.local.set({ currentResume: version.data });
    populateForm(version.data); 
    //await createVersion(version.data, `Restored from ${new Date(version.timestamp).toLocaleDateString()}`);
    alert("✓ Version restored!");

    //switch tabs to resume tab so user can see restored version right away
    document.querySelector(".tab-btn[data-tab='resume']").click(); 
    loadVersionHistory();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteVersion(versionId) {
  if (!confirm("Delete this version?")) return;
  try {
    const { resumeVersions } = await chrome.storage.local.get("resumeVersions");
    const filtered = (resumeVersions || []).filter((v) => v.id !== versionId);
    await chrome.storage.local.set({ resumeVersions: filtered });
    loadVersionHistory();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ── Comparison Logic ─────────────────────────────────────────────────────────

// Quick scan: compare resume against basic extractProfile result
function compareResumeToProfile(resume, profile) {
  return {
    name:       compareField(resume.fullName,  profile.name,    "Name"),
    title:      compareField(resume.title,     profile.title,   "Title"),
    summary:    compareField(resume.summary,   profile.summary, "Summary"),
    experience: compareArrays(resume.experience, profile.experience),
    education:  compareArrays(resume.education,  profile.education),
    skills:     compareSkills(resume.skills,     profile.skills)
  };
}

// Deep scan: compare resume against rs_lastResult (Kevin's flow output)
// Focuses on the fields deep scan actually covers well: skills and certs.
function compareResumeToDeepScan(resume, deepResult) {
  return {
    skills: compareSkills(resume.skills || [], deepResult.skills || []),
    certs:  deepResult.certs || []
  };
}

function compareField(resumeVal, profileVal, fieldName) {
  const r = (resumeVal  || "").toLowerCase().trim();
  const p = (profileVal || "").toLowerCase().trim();
  if (!r && !p) return { status: "match",     message: "Both empty" };
  if (!r)       return { status: "missing",   message: `In profile but not resume: "${profileVal}"` };
  if (!p)       return { status: "extra",     message: `In resume but not profile: "${resumeVal}"` };
  if (r === p)  return { status: "match",     message: "Matches" };
  return         { status: "different", message: `Resume: "${resumeVal}" | Profile: "${profileVal}"` };
}

function compareArrays(rArr, pArr) {
  const r = rArr || [], p = pArr || [];
  const diffs = [];
  p.forEach((pItem) => {
    if (!r.some((rItem) => JSON.stringify(rItem).toLowerCase() === JSON.stringify(pItem).toLowerCase())) {
      diffs.push({ status: "missing", message: `In profile but not resume: ${JSON.stringify(pItem)}` });
    }
  });
  r.forEach((rItem) => {
    if (!p.some((pItem) => JSON.stringify(rItem).toLowerCase() === JSON.stringify(pItem).toLowerCase())) {
      diffs.push({ status: "extra", message: `In resume but not profile: ${JSON.stringify(rItem)}` });
    }
  });
  if (!diffs.length) diffs.push({ status: "match", message: "All items match" });
  return diffs;
}

function compareSkills(rSkills, pSkills) {
  const r = (rSkills || []).map((s) => s.toLowerCase().trim());
  const p = (pSkills || []).map((s) => s.toLowerCase().trim());
  const diffs = [];
  p.forEach((s) => {
    if (!r.includes(s)) diffs.push({ status: "missing", message: `In profile but not resume: ${s}` });
  });
  r.forEach((s) => {
    if (!p.includes(s)) diffs.push({ status: "extra", message: `In resume but not profile: ${s}` });
  });
  if (!diffs.length) diffs.push({ status: "match", message: "All skills match" });
  return diffs;
}

// ── Display Helpers ──────────────────────────────────────────────────────────

function displayComparison(container, comparison, platform) {
  let html = `<h3 class="results-title">Comparison with ${platform}</h3>`;
  Object.keys(comparison).forEach((field) => {
    const data  = comparison[field];
    const title = field.charAt(0).toUpperCase() + field.slice(1);
    html += `<div class="diff-section">
      <div class="diff-header">${title}</div>
      <div class="diff-content">`;
    const items = Array.isArray(data) ? data : [data];
    items.forEach((item) => {
      html += `<div class="diff-item ${item.status}">
        <div class="diff-label">${getStatusBadge(item.status)}</div>
        <div class="diff-value">${item.message}</div>
      </div>`;
    });
    html += `</div></div>`;
  });
  container.innerHTML = html;
}

// Deep scan display: skills comparison + certs list
function displayDeepComparison(container, comparison, deepResult) {
  let html = `<h3 class="results-title">Deep Scan — LinkedIn</h3>`;

  // Skills diff
  html += `<div class="diff-section">
    <div class="diff-header">Skills</div>
    <div class="diff-content">`;
  comparison.skills.forEach((item) => {
    html += `<div class="diff-item ${item.status}">
      <div class="diff-label">${getStatusBadge(item.status)}</div>
      <div class="diff-value">${item.message}</div>
    </div>`;
  });
  html += `</div></div>`;

  // Certs list
  if (comparison.certs.length > 0) {
    html += `<div class="diff-section">
      <div class="diff-header">Certifications &amp; Licenses (${comparison.certs.length})</div>
      <div class="diff-content">`;
    comparison.certs.forEach((cert) => {
      html += `<div class="cert-item">
        <strong>${cert.name}</strong>${cert.issuer ? ` — ${cert.issuer}` : ""}
        ${cert.issued  ? `<br><span class="cert-meta">${cert.issued}</span>`       : ""}
        ${cert.expires ? `<span class="cert-meta"> · ${cert.expires}</span>`       : ""}
        ${cert.link    ? `<br><a href="${cert.link}" target="_blank" class="cert-link">View credential</a>` : ""}
      </div>`;
    });
    html += `</div></div>`;
  } else {
    html += `<div class="diff-section">
      <div class="diff-header">Certifications &amp; Licenses</div>
      <div class="diff-content"><p class="empty-state">None found</p></div>
    </div>`;
  }

  container.innerHTML = html;
}

function getStatusBadge(status) {
  const badges = {
    match:     '<span class="badge badge-success">✓ Match</span>',
    missing:   '<span class="badge badge-warning">⚠ Missing in Resume</span>',
    extra:     '<span class="badge badge-info">ℹ Extra in Resume</span>',
    different: '<span class="badge badge-danger">✗ Different</span>'
  };
  return badges[status] || "";
}

// ── Utilities ────────────────────────────────────────────────────────────────

function parseJSON(str, defaultValue) {
  if (!str?.trim()) return defaultValue;
  try   { return JSON.parse(str); }
  catch { return defaultValue; }
}

function showStatus(el, type, message) {
  el.className = `status-message ${type}`;
  el.textContent = message;
  el.style.display = "block";
  if (type === "success" || type === "info") {
    setTimeout(() => { el.style.display = "none"; }, 3500);
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loadResume").click();
});

// Button Helper
// Ensure buttons register correctly and exists before adding event listeners to prevent issues with dynamically loaded content or missing elements.
function ensureButtonRegistered(buttonId, callback) {
  const button = document.getElementById(buttonId);
  if (button) {
    button.addEventListener("click", callback);
  } else {
    console.warn(`Button with ID "${buttonId}" not found.`);
    return; 
  }

  button.addEventListener("click", async(event) => {
    event.preventDefault();
    try {
      await callback();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  });

}

//Parse through input and convert JSON into a JavaScript object. If the input is empty or invalid, return a default value (like an empty array). 
// This makes it easier to handle user input without crashing the app due to bad JSON.
function parseJSON(str) {
  if (!str?.trim()) return [];
  try {
    return JSON.parse(str);
  } catch (err) {
    console.error("JSON parse error:", err);
    console.error("Input string:", str);
    console.error("Error message:", err.message);

    alert (`Invalid JSON format: ${err.message}\nPlease check the console for details.`);
    return [];
  }
}

//parse through experience user input 
//Allow users to input information without needing to use JSON format and separate information accordingly
function parseExperience(text) {
  return text.split("\n").map((line) => {
    const [company, title, duration] = line.split(",").map((part) => part.trim());
    return { company, title, duration };
  });
}

//parse through education user input 
//Allow users to input information without needing to use JSON format and separate information accordingly
function parseEducation(text) {
  return text.split("\n").map((line) => {
    const [school, degree, duration] = line.split(",").map((part) => part.trim());
    return { school, degree, duration };
  });
}
