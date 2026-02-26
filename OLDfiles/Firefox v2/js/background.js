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
  } else if (details.reason === 'update') {
    console.log('Resume Manager Extension updated!');
  }
});

// Handle extension icon click
if (browserAPI.action) {
  // Manifest V3 (Chrome)
  browserAPI.action.onClicked.addListener(async (tab) => {
    try {
      await browserAPI.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
    } catch (error) {
      console.log('Could not toggle overlay:', error);
    }
  });
} else if (browserAPI.browserAction) {
  // Manifest V2 (Firefox)
  browserAPI.browserAction.onClicked.addListener(async (tab) => {
    try {
      await browserAPI.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
    } catch (error) {
      console.log('Could not toggle overlay:', error);
    }
  });
}

// Handle keyboard shortcut
if (browserAPI.commands) {
  browserAPI.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-overlay') {
      try {
        const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.id) {
          await browserAPI.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
        }
      } catch (error) {
        console.log('Could not toggle overlay:', error);
      }
    }
  });
}

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

console.log('Resume Manager Extension: Background script loaded. Click the extension icon or press Ctrl+Shift+R to toggle.');
