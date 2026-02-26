// ResumeSync - Background Service Worker (MV3)

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.storage.local.set({ currentResume: null, resumeVersions: [] });
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

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "compareProfile") {
    chrome.action.openPopup();
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
