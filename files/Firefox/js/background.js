// Background Service Worker for Resume Manager Extension

// Cross-browser compatibility: Use browser API if available (Firefox), otherwise chrome API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Listen for extension installation
browserAPI.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Resume Manager Extension installed!');
    
    // Initialize storage with default values
    browserAPI.storage.local.set({
      currentResume: null,
      resumeVersions: []
    });
    
    // Try to set up context menu (Chrome only, Firefox doesn't support it the same way)
    if (typeof chrome !== 'undefined' && chrome.contextMenus) {
      try {
        chrome.contextMenus.create({
          id: 'compareProfile',
          title: 'Compare with Resume',
          contexts: ['page'],
          documentUrlPatterns: [
            'https://www.linkedin.com/*',
            'https://*.joinhandshake.com/*'
          ]
        });
      } catch (e) {
        console.log('Context menu not available:', e);
      }
    }
  } else if (details.reason === 'update') {
    console.log('Resume Manager Extension updated!');
  }
});

// Listen for messages from popup or content scripts
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getResume') {
    // Get current resume from storage
    browserAPI.storage.local.get('currentResume', (result) => {
      sendResponse({ resume: result.currentResume });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'saveResume') {
    // Save resume to storage
    browserAPI.storage.local.set({ currentResume: request.resume }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getVersions') {
    // Get all versions
    browserAPI.storage.local.get('resumeVersions', (result) => {
      sendResponse({ versions: result.resumeVersions || [] });
    });
    return true;
  }
});

// Context menu click handler (Chrome only)
if (typeof chrome !== 'undefined' && chrome.contextMenus) {
  try {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
      if (info.menuItemId === 'compareProfile') {
        // Open popup (note: this may not work in all browsers)
        if (chrome.action && chrome.action.openPopup) {
          chrome.action.openPopup();
        }
      }
    });
  } catch (e) {
    console.log('Context menu listener not available:', e);
  }
}

console.log('Resume Manager Extension: Background script loaded');
