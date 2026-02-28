// UML roles:
//   -storage   : browser storage (chrome.storage.local)
//   -parser    : ParseAnalyzer  (Python native-messaging host)
//   -scraper   : Scraper        (content scripts injected by the manifest)
//
//   +handleUpload(file)          — save uploaded resume data to storage
//   +handleCompare()             — retrieve resume + cached site data, call ParseAnalyzer, return results
//   +saveToStorage(data)         — write arbitrary data to chrome.storage.local
//   +loadFromStorage()           — read persisted data from chrome.storage.local
//   +sendResultsToPopup(results) — relay comparison results back to the popup


//////////////// INSTALLATION HANDLER ////////////////
// Takes in:  details — an object from Chrome with a "reason" field ("install" or "update")
// Purpose:   Runs once when the extension is first installed or updated. On a fresh
//            install it sets up empty storage slots and registers the right-click
//            context menu on LinkedIn and Handshake pages.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ currentResume: null, resumeVersions: [], rs_siteRaw: null });
    console.log("ResumeSync: installed");
  } else if (details.reason === "update") {
    console.log("ResumeSync: updated");
  }

  // Context menu for quick access on LinkedIn / Handshake pages
  chrome.contextMenus.create({
    id: "compareProfile",
    title: "ResumeSync: Compare with Resume",
    contexts: ["page"],
    documentUrlPatterns: [
      "https://www.linkedin.com/*",
      "https://*.joinhandshake.com/*"
    ]
  });
});

//////////////// CONTEXT MENU CLICK HANDLER ////////////////
// Takes in:  info — an object from Chrome identifying which menu item was clicked
// Purpose:   Listens for a click on the "ResumeSync: Compare with Resume" right-click
//            menu item. When clicked while on a LinkedIn or Handshake page, it opens
//            the extension popup.

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "compareProfile") {
    chrome.action.openPopup();
  }
});

//////////////// STORAGE HELPERS ////////////////

//////////////// saveToStorage ////////////////
// Takes in:  data — an object of key/value pairs to write (e.g. { currentResume: {...} })
// Purpose:   Writes data into the browser's local storage so it persists between
//            sessions. Returns a Promise so the caller can wait for it to finish
//            before moving on.
function saveToStorage(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve();
      }
    });
  });
}

//////////////// loadFromStorage ////////////////
// Takes in:  nothing — always reads the same fixed set of ResumeSync storage keys
// Purpose:   Reads all ResumeSync-related data out of browser storage and returns
//            it as one object. Returns a Promise so the caller can wait for the
//            data before using it.
function loadFromStorage() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(
      // looks for your current resume, your version history, and three different types of cached site data from scrapers
      ["currentResume", "resumeVersions", "rs_siteRaw", "rs_lastResult", "rs_quickResult"],
      (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      }
    );
  });
}

//////////////// UPLOAD HANDLER ////////////////
// Takes in:  resumeData — the parsed resume object sent from the popup
//            (fields include fullName, email, skills, experience, education, etc.)
// Purpose:   Saves the incoming resume as the user's active resume in storage, then
//            immediately creates a version history snapshot of it. Caps the history
//            at 20 entries, dropping the oldest when the limit is exceeded.
async function handleUpload(resumeData) {
  await saveToStorage({ currentResume: resumeData });

  // Append to version history (cap at 20)
  const stored = await loadFromStorage();
  const versions = stored.resumeVersions || [];
  versions.unshift({
    id: Date.now(),
    data: resumeData,
    notes: "Uploaded via background",
    timestamp: new Date().toISOString()
  });
  if (versions.length > 20) versions.splice(20);
  await saveToStorage({ resumeVersions: versions });
}

//////////////// PARSEANALYZER BRIDGE ////////////////

const NATIVE_HOST = "com.resumesync.parser";

//////////////// callParseAnalyzer ////////////////
// Takes in:  resumeRaw — the user's saved resume object
//            siteRaw   — the scraped site data object (from LinkedIn or Handshake)
// Purpose:   Opens a communication channel to the Python ParseAnalyzer program
//            running locally on the user's machine and sends both datasets to it
//            for deep comparison. If the Python program is not installed or fails
//            to respond, it automatically falls back to jsFallbackCompare instead.
function callParseAnalyzer(resumeRaw, siteRaw) {
  return new Promise((resolve) => {
    try {
      const port = chrome.runtime.connectNative(NATIVE_HOST);
      let responded = false;

      port.onMessage.addListener((msg) => {
        responded = true;
        port.disconnect();
        resolve(msg.results || []);
      });

      port.onDisconnect.addListener(() => {
        if (!responded) {
          console.warn("ResumeSync: native host unavailable, using JS fallback");
          resolve(jsFallbackCompare(resumeRaw, siteRaw));
        }
      });

      port.postMessage({ resumeRaw, siteRaw });
    } catch (err) {
      console.warn("ResumeSync: connectNative failed, using JS fallback:", err.message);
      resolve(jsFallbackCompare(resumeRaw, siteRaw));
    }
  });
}

//////////////// JS FALLBACK COMPARISON ////////////////
// Takes in:  resumeData — the user's saved resume object
//            siteData   — the scraped site data object (from LinkedIn or Handshake)
// Purpose:   A lightweight JavaScript-only comparison used when the Python
//            ParseAnalyzer is unavailable. Checks whether skills are missing from
//            or extra in the resume relative to the profile, then checks if the
//            user's name and job title match across both. Returns a plain-English
//            array of result strings describing every difference found.
function jsFallbackCompare(resumeData, siteData) {
  const results = [];

  if (!resumeData || !siteData) {
    return ["No resume or site data available for comparison."];
  }

  // Skills comparison
  const resumeSkills = (resumeData.skills || []).map((s) => s.toLowerCase().trim());
  const siteSkills   = (siteData.skills   || []).map((s) => s.toLowerCase().trim());

  siteSkills.forEach((s) => {
    if (!resumeSkills.includes(s)) results.push(`MISSING in resume: ${s}`);
  });
  resumeSkills.forEach((s) => {
    if (!siteSkills.includes(s)) results.push(`EXTRA in resume: ${s}`);
  });

  // Name / title quick checks
  if (resumeData.fullName && siteData.name) {
    const rName = resumeData.fullName.toLowerCase().trim();
    const sName = siteData.name.toLowerCase().trim();
    if (rName !== sName) results.push(`NAME differs — Resume: "${resumeData.fullName}", Profile: "${siteData.name}"`);
  }

  if (resumeData.title && siteData.title) {
    const rTitle = resumeData.title.toLowerCase().trim();
    const sTitle = siteData.title.toLowerCase().trim();
    if (rTitle !== sTitle) results.push(`TITLE differs — Resume: "${resumeData.title}", Profile: "${siteData.title}"`);
  }

  if (results.length === 0) results.push("All compared fields match.");
  return results;
}

//////////////// COMPARE HANDLER ////////////////
// Takes in:  nothing — reads everything it needs directly from storage
// Purpose:   Orchestrates the full comparison flow. Loads the saved resume and the
//            most recently cached site data from storage, validates that both exist,
//            then hands them off to callParseAnalyzer. Returns an object with a
//            success flag and either the results array or an error message.
async function handleCompare() {
  const stored = await loadFromStorage();

  const resumeData = stored.currentResume;
  const siteData   = stored.rs_siteRaw || stored.rs_lastResult || stored.rs_quickResult;

  if (!resumeData) return { success: false, error: "No resume saved. Save your resume first." };
  if (!siteData)   return { success: false, error: "No site data cached. Run a profile scan first." };

  const results = await callParseAnalyzer(resumeData, siteData);
  return { success: true, results };
}

//////////////// SEND RESULTS TO POPUP ////////////////
// Takes in:  results — an array of plain-English comparison result strings
// Purpose:   Broadcasts the comparison results back to the popup so they can be
//            displayed to the user. If the popup is not currently open the message
//            is silently discarded — no error is thrown.
function sendResultsToPopup(results) {
  chrome.runtime.sendMessage({ action: "compareResults", results }).catch(() => {
    // Popup may not be open — silently ignore.
  });
}

//////////////// MESSAGE LISTENER ////////////////
// Takes in:  request     — object containing an "action" string and any accompanying data
//            sender      — info about which script sent the message (popup or scraper)
//            sendResponse — a callback used to reply directly back to the sender
// Purpose:   Acts as the central receptionist for the entire extension. Every message
//            sent by the Popup or the Scrapers arrives here. Reads the "action" field
//            and routes the message to the correct handler function, then sends a
//            response back to the caller.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // ── Popup: upload resume ──────────────────────────────────────────────────
  if (request.action === "uploadResume") {
    handleUpload(request.resumeData)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Popup: run comparison ─────────────────────────────────────────────────
  if (request.action === "runCompare") {
    handleCompare()
      .then((result) => {
        if (result.success) sendResultsToPopup(result.results);
        sendResponse(result);
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Popup: view latest / stored data ─────────────────────────────────────
  if (request.action === "viewLatest" || request.action === "viewStoredData") {
    loadFromStorage()
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Scraper: deliver raw site data ────────────────────────────────────────
  // Scrapers call sendToBackground(raw) which maps to this message.
  if (request.action === "siteRawData") {
    saveToStorage({ rs_siteRaw: request.raw })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Legacy / popup direct-storage helpers (kept for compatibility) ────────

  if (request.action === "getResume") {
    chrome.storage.local.get("currentResume", (result) => {
      sendResponse({ resume: result.currentResume });
    });
    return true;
  }

  if (request.action === "saveResume") {
    chrome.storage.local.set({ currentResume: request.resume }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "getVersions") {
    chrome.storage.local.get("resumeVersions", (result) => {
      sendResponse({ versions: result.resumeVersions || [] });
    });
    return true;
  }
});

console.log("ResumeSync: background service worker loaded");
