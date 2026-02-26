// Background Service Worker for Resume Manager Extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Resume Manager Extension installed!');
    
    // Initialize storage with default values
    chrome.storage.local.set({
      currentResume: null,
      resumeVersions: []
    });
  } else if (details.reason === 'update') {
    console.log('Resume Manager Extension updated!');
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getResume') {
    // Get current resume from storage
    chrome.storage.local.get('currentResume', (result) => {
      sendResponse({ resume: result.currentResume });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'saveResume') {
    // Save resume to storage
    chrome.storage.local.set({ currentResume: request.resume }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getVersions') {
    // Get all versions
    chrome.storage.local.get('resumeVersions', (result) => {
      sendResponse({ versions: result.resumeVersions || [] });
    });
    return true;
  }
});

// Optional: Set up context menu for quick actions
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'compareProfile',
    title: 'Compare with Resume',
    contexts: ['page'],
    documentUrlPatterns: [
      'https://www.linkedin.com/*',
      'https://*.joinhandshake.com/*'
    ]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'compareProfile') {
    // Open popup or trigger comparison
    chrome.action.openPopup();
  }
});

console.log('Resume Manager Extension: Background service worker loaded');
