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

// ── Entry card helpers ───────────────────────────────────────────────────────

function makeCard(templateId) {
  const frag = document.getElementById(templateId).content.cloneNode(true);
  frag.querySelector(".card-delete-btn").addEventListener("click", e => {
    e.target.closest(".entry-card").remove();
  });
  return frag;
}

function appendCard(listId, templateId, data = {}) {
  const frag = makeCard(templateId);
  const card = frag.querySelector(".entry-card");
  card.querySelectorAll("[data-key]").forEach(el => {
    el.value = data[el.dataset.key] || "";
  });
  document.getElementById(listId).appendChild(frag);
}

function collectCards(listId) {
  return [...document.getElementById(listId).querySelectorAll(".entry-card")]
    .map(card => {
      const obj = {};
      card.querySelectorAll("[data-key]").forEach(el => {
        obj[el.dataset.key] = el.value.trim();
      });
      return obj;
    })
    .filter(obj => Object.values(obj).some(v => v));
}

function sortEducation(eduCards) {
  return eduCards.map(edu => ({
    year: edu.year || "",
    school: edu.school || "",
    degree: edu.degree || "",
    notes: edu.notes || ""
  }));
}

function sortExperience(expCards) {
  return expCards.map(exp => ({
    duration: exp.duration || "",
    company: exp.company || "",
    title: exp.title || "",
    description: exp.description || ""
  }));
}

document.getElementById("addExp").addEventListener("click", () => appendCard("expList", "tpl-exp"));
document.getElementById("addEdu").addEventListener("click", () => appendCard("eduList", "tpl-edu"));

// ── Resume Tab ───────────────────────────────────────────────────────────────

//resume is being saved as a version, with metadata of the version, structured object (containing parsed info), and time stamp.
document.getElementById("saveResume").addEventListener("click", async () => {
  const statusEl = document.getElementById("saveStatus");

  try {
    const resumeData = {
      fullName:    document.getElementById("fullName").value.trim(),
      email:       document.getElementById("email").value.trim(),
      summary:     document.getElementById("summary").value.trim(),
      education:   sortEducation(collectCards("eduList")),
      experience:  sortExperience(collectCards("expList")),
      skills:      document.getElementById("skills").value.split(",").map((s) => s.trim()).filter(Boolean),
    };

    if (!resumeData.fullName || !resumeData.email) {
      showStatus(statusEl, "error", "Please fill in at least Name and Email");
      return;
    }

    await chrome.storage.local.set({ currentResume: resumeData });

    const notes = document.getElementById("versionNotes").value || "Manual save";
    await createVersion(resumeData, notes);

    //making sure to update preview immediately after new info is saved.
    updatePreview();

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
        email:      raw.email                         || "",
        summary:    raw.summary    || raw.about       || "",
        education:  raw.education  || [],
        experience: raw.experience || [],
        skills:     Array.isArray(raw.skills)
                      ? raw.skills
                      : typeof raw.skills === "string"
                        ? raw.skills.split(",").map((s) => s.trim()).filter(Boolean)
                        : []
      };

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
    a.download = `ResumeSync - ${(currentResume.fullName || "Resume").replace(/\s+/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus(statusEl, "success", "✓ Resume exported!");
  } catch (err) {
    showStatus(statusEl, "error", `Export failed: ${err.message}`);
  }
});

// ── Populate all form fields from a parsed object ────────────────────────────
function populateForm(r) {
  document.getElementById("fullName").value   = r.fullName   || "";
  document.getElementById("email").value      = r.email      || "";
  document.getElementById("summary").value    = r.summary    || "";
  document.getElementById("skills").value     = (r.skills || []).join(", ");

  // Clear and populate education cards
  document.getElementById("eduList").innerHTML = "";
  (r.education || []).forEach(item => appendCard("eduList", "tpl-edu", item));

  // Clear and populate experience cards
  document.getElementById("expList").innerHTML = "";
  (r.experience || []).forEach(item => appendCard("expList", "tpl-exp", item));

  updatePreview(); 
}

// -- Preview Tab - - Format resume data into a clean, copyable layout for pasting into job applications ----

//Turns raw JSON data into human readable format for copy-paste into job applications
function formatForApplication(data) {
  let html = '<div class="formatted-resume">';

  if (data.fullName) html += `<h2>${data.fullName}</h2>`;
  if (data.email)    html += `<p><strong>Email:</strong> ${data.email}</p>`;
  if (data.summary)  html += `<p><strong>Summary:</strong>\n ${data.summary}</p>`;

  if (data.education?.length) {
    html += `<h3>Education</h3>`;
    data.education.forEach((edu) => {
      html += `<p>- <strong>${edu.degree}</strong> from <strong>${edu.school}</strong> (${edu.year})</p>`;
    });
  }

  if (data.experience?.length) {
    html += `<h3>Experience</h3>`;
    data.experience.forEach((exp) => {
      html += `<p>- <strong>${exp.title}</strong> at <strong>${exp.company}</strong> (${exp.duration})</p>`;
    });
  }

  if (data.skills?.length) {
    html += `<h3>Skills</h3>`;
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
    email:    document.getElementById("email").value,
    summary:  document.getElementById("summary").value,
    education:  collectCards("eduList"),
    experience: collectCards("expList"),
    skills:     document.getElementById("skills").value.split(",").map(s => s.trim()).filter(s => s.length > 0)
  };

  const previewContainer = document.getElementById("formattedResume");
  if (previewContainer) {
    previewContainer.innerHTML = formatForApplication(currentResume);
  }
}

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
            ${v.data.fullName || "Unnamed"} | ${(v.data.experience || []).length} experiences | ${(v.data.skills || []).length} skills
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
    summary:    compareField(resume.summary,   profile.summary, "Summary"),
    education:  compareArrays(resume.education,  profile.education),
    experience: compareArrays(resume.experience, profile.experience),
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

//parse through education user input 
//Allow users to input information without needing to use JSON format and separate information accordingly
function parseEducation(text) {
  return text.split("\n").map((line) => {
    const [school, degree, duration] = line.split(",").map((part) => part.trim());
    return { school, degree, duration };
  });
}

//parse through experience user input 
//Allow users to input information without needing to use JSON format and separate information accordingly
//only expecting three values. company, title, and duration.
function parseExperience(text) {
  return text.split("\n").map((line) => {
    const [company, title, duration] = line.split(",").map((part) => part.trim());
    return { company, title, duration };
  });
}
