// Resume Manager Overlay Content Script
// This script injects the resume manager as an overlay on any page

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Prevent multiple injections
if (!window.resumeManagerInjected) {
  window.resumeManagerInjected = true;
  
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'resume-manager-overlay';
  overlay.style.display = 'none';
  
  // Fetch and inject the HTML
  fetch(browserAPI.runtime.getURL('overlay.html'))
    .then(response => response.text())
    .then(html => {
      overlay.innerHTML = html;
      document.body.appendChild(overlay);
      
      // Initialize after injection
      initializeOverlay();
    })
    .catch(error => {
      console.error('Failed to load Resume Manager overlay:', error);
    });
}

// Toggle overlay visibility
function toggleOverlay() {
  const overlay = document.getElementById('resume-manager-overlay');
  if (overlay) {
    overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
  }
}

// Listen for messages from background script
browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'toggleOverlay') {
    toggleOverlay();
    sendResponse({ success: true });
  }
  return true;
});

// Listen for keyboard shortcut (Ctrl+Shift+R or Cmd+Shift+R)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    toggleOverlay();
  }
});

// Initialize overlay functionality
function initializeOverlay() {
  const overlay = document.getElementById('resume-manager-overlay');
  if (!overlay) return;
  
  // Close button
  const closeBtn = overlay.querySelector('#closeOverlay');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
  }
  
  // Minimize/maximize button
  const minimizeBtn = overlay.querySelector('#minimizeOverlay');
  const container = overlay.querySelector('.overlay-container');
  let isMinimized = false;
  
  if (minimizeBtn && container) {
    minimizeBtn.addEventListener('click', () => {
      isMinimized = !isMinimized;
      if (isMinimized) {
        container.style.height = '60px';
        container.style.overflow = 'hidden';
        minimizeBtn.textContent = '🔼';
        minimizeBtn.title = 'Maximize';
      } else {
        container.style.height = '700px';
        container.style.overflow = 'auto';
        minimizeBtn.textContent = '🔽';
        minimizeBtn.title = 'Minimize';
      }
    });
  }
  
  // Make draggable
  const header = overlay.querySelector('.overlay-header');
  if (header && container) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    
    header.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    function dragStart(e) {
      if (e.target.tagName === 'BUTTON') return; // Don't drag when clicking buttons
      
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      isDragging = true;
      header.style.cursor = 'grabbing';
    }
    
    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        
        setTranslate(currentX, currentY, container);
      }
    }
    
    function dragEnd(e) {
      initialX = currentX;
      initialY = currentY;
      isDragging = false;
      header.style.cursor = 'grab';
    }
    
    function setTranslate(xPos, yPos, el) {
      el.style.transform = `translate(${xPos}px, ${yPos}px)`;
    }
  }
  
  // Load the main popup script
  const script = document.createElement('script');
  script.src = browserAPI.runtime.getURL('js/overlay-logic.js');
  overlay.appendChild(script);
}

console.log('Resume Manager: Overlay script loaded. Press Ctrl+Shift+R to toggle.');
