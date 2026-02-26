// Resume Manager Popup Script

// Cross-browser compatibility: Use browser API if available (Firefox), otherwise chrome API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Tab switching
document.querySelectorAll('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    // Update active tab content
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data when switching to versions tab
    if (tabName === 'versions') {
      loadVersionHistory();
    }
  });
});

// Save resume
document.getElementById('saveResume').addEventListener('click', async () => {
  const statusEl = document.getElementById('saveStatus');
  
  try {
    const resumeData = {
      fullName: document.getElementById('fullName').value,
      email: document.getElementById('email').value,
      phone: document.getElementById('phone').value,
      title: document.getElementById('title').value,
      summary: document.getElementById('summary').value,
      experience: parseJSON(document.getElementById('experience').value, []),
      education: parseJSON(document.getElementById('education').value, []),
      skills: document.getElementById('skills').value.split(',').map(s => s.trim()).filter(s => s),
      lastUpdated: new Date().toISOString()
    };
    
    // Validate required fields
    if (!resumeData.fullName || !resumeData.email) {
      showStatus(statusEl, 'error', 'Please fill in at least Name and Email');
      return;
    }
    
    // Save current resume
    await browserAPI.storage.local.set({ currentResume: resumeData });
    
    // Create version
    const versionNotes = document.getElementById('versionNotes').value || 'Manual save';
    await createVersion(resumeData, versionNotes);
    
    showStatus(statusEl, 'success', '✓ Resume saved successfully!');
    document.getElementById('versionNotes').value = '';
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error: ${error.message}`);
  }
});

// Load current resume
document.getElementById('loadResume').addEventListener('click', async () => {
  const statusEl = document.getElementById('saveStatus');
  
  try {
    const result = await browserAPI.storage.local.get('currentResume');
    
    if (!result.currentResume) {
      showStatus(statusEl, 'info', 'No saved resume found');
      return;
    }
    
    const resume = result.currentResume;
    
    document.getElementById('fullName').value = resume.fullName || '';
    document.getElementById('email').value = resume.email || '';
    document.getElementById('phone').value = resume.phone || '';
    document.getElementById('title').value = resume.title || '';
    document.getElementById('summary').value = resume.summary || '';
    document.getElementById('experience').value = JSON.stringify(resume.experience || [], null, 2);
    document.getElementById('education').value = JSON.stringify(resume.education || [], null, 2);
    document.getElementById('skills').value = (resume.skills || []).join(', ');
    
    showStatus(statusEl, 'success', '✓ Resume loaded successfully!');
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error: ${error.message}`);
  }
});

// Scan profile for comparison
document.getElementById('scanProfile').addEventListener('click', async () => {
  const statusEl = document.getElementById('compareStatus');
  const resultsEl = document.getElementById('comparisonResults');
  
  try {
    // Get current tab
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url) {
      showStatus(statusEl, 'error', 'Cannot access this page');
      return;
    }
    
    // Check if on LinkedIn or Handshake
    const isLinkedIn = tab.url.includes('linkedin.com');
    const isHandshake = tab.url.includes('joinhandshake.com');
    
    if (!isLinkedIn && !isHandshake) {
      showStatus(statusEl, 'info', 'Please navigate to LinkedIn or Handshake first');
      return;
    }
    
    showStatus(statusEl, 'info', 'Scanning profile...');
    
    // Send message to content script to extract profile data
    const response = await browserAPI.tabs.sendMessage(tab.id, { action: 'extractProfile' });
    
    if (!response || !response.success) {
      showStatus(statusEl, 'error', 'Failed to extract profile data. Make sure you\'re on your profile page.');
      return;
    }
    
    // Get current resume
    const result = await browserAPI.storage.local.get('currentResume');
    
    if (!result.currentResume) {
      showStatus(statusEl, 'error', 'No resume saved. Please save your resume first.');
      return;
    }
    
    // Compare
    const comparison = compareResumeToProfile(result.currentResume, response.profileData);
    displayComparison(resultsEl, comparison, isLinkedIn ? 'LinkedIn' : 'Handshake');
    
    showStatus(statusEl, 'success', '✓ Comparison complete!');
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error: ${error.message}`);
  }
});

// Helper Functions

function parseJSON(str, defaultValue) {
  if (!str || !str.trim()) return defaultValue;
  try {
    return JSON.parse(str);
  } catch (e) {
    return defaultValue;
  }
}

function showStatus(element, type, message) {
  element.className = `status-message ${type}`;
  element.textContent = message;
  element.style.display = 'block';
  
  if (type === 'success' || type === 'info') {
    setTimeout(() => {
      element.style.display = 'none';
    }, 3000);
  }
}

async function createVersion(resumeData, notes) {
  const result = await browserAPI.storage.local.get('resumeVersions');
  const versions = result.resumeVersions || [];
  
  const version = {
    id: Date.now(),
    data: resumeData,
    notes: notes,
    timestamp: new Date().toISOString()
  };
  
  versions.unshift(version);
  
  // Keep only last 20 versions
  if (versions.length > 20) {
    versions.splice(20);
  }
  
  await browserAPI.storage.local.set({ resumeVersions: versions });
}

async function loadVersionHistory() {
  const listEl = document.getElementById('versionsList');
  
  try {
    const result = await browserAPI.storage.local.get('resumeVersions');
    const versions = result.resumeVersions || [];
    
    if (versions.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No versions saved yet</p>';
      return;
    }
    
    listEl.innerHTML = versions.map(version => {
      const date = new Date(version.timestamp);
      const formattedDate = date.toLocaleString();
      
      return `
        <div class="version-item" data-version-id="${version.id}">
          <div class="version-header">
            <span class="version-date">📅 ${formattedDate}</span>
            <div class="version-actions">
              <button class="btn btn-secondary btn-small restore-version" data-version-id="${version.id}">
                Restore
              </button>
              <button class="btn btn-danger btn-small delete-version" data-version-id="${version.id}">
                Delete
              </button>
            </div>
          </div>
          ${version.notes ? `<div class="version-notes">"${version.notes}"</div>` : ''}
          <div class="version-summary">
            ${version.data.fullName || 'Unnamed'} | 
            ${version.data.title || 'No title'} | 
            ${(version.data.skills || []).length} skills
          </div>
        </div>
      `;
    }).join('');
    
    // Add event listeners for restore and delete buttons
    document.querySelectorAll('.restore-version').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const versionId = parseInt(e.target.dataset.versionId);
        await restoreVersion(versionId);
      });
    });
    
    document.querySelectorAll('.delete-version').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const versionId = parseInt(e.target.dataset.versionId);
        await deleteVersion(versionId);
      });
    });
    
  } catch (error) {
    listEl.innerHTML = `<p class="empty-state">Error loading versions: ${error.message}</p>`;
  }
}

async function restoreVersion(versionId) {
  try {
    const result = await browserAPI.storage.local.get('resumeVersions');
    const versions = result.resumeVersions || [];
    const version = versions.find(v => v.id === versionId);
    
    if (!version) {
      alert('Version not found');
      return;
    }
    
    // Save as current resume
    await browserAPI.storage.local.set({ currentResume: version.data });
    
    // Create new version for the restore action
    await createVersion(version.data, `Restored from ${new Date(version.timestamp).toLocaleDateString()}`);
    
    alert('✓ Version restored successfully!');
    loadVersionHistory();
    
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

async function deleteVersion(versionId) {
  if (!confirm('Are you sure you want to delete this version?')) {
    return;
  }
  
  try {
    const result = await browserAPI.storage.local.get('resumeVersions');
    const versions = result.resumeVersions || [];
    const filteredVersions = versions.filter(v => v.id !== versionId);
    
    await browserAPI.storage.local.set({ resumeVersions: filteredVersions });
    
    loadVersionHistory();
    
  } catch (error) {
    alert(`Error: ${error.message}`);
  }
}

function compareResumeToProfile(resume, profile) {
  const differences = {
    name: comparefield(resume.fullName, profile.name, 'Name'),
    title: comparefield(resume.title, profile.title, 'Title'),
    summary: comparefield(resume.summary, profile.summary, 'Summary'),
    experience: compareArrays(resume.experience, profile.experience, 'Experience'),
    education: compareArrays(resume.education, profile.education, 'Education'),
    skills: compareSkills(resume.skills, profile.skills)
  };
  
  return differences;
}

function comparefield(resumeValue, profileValue, fieldName) {
  const rVal = (resumeValue || '').toLowerCase().trim();
  const pVal = (profileValue || '').toLowerCase().trim();
  
  if (!rVal && !pVal) {
    return { status: 'match', message: 'Both empty' };
  }
  
  if (!rVal) {
    return { status: 'missing', message: `Missing in resume: "${profileValue}"` };
  }
  
  if (!pVal) {
    return { status: 'extra', message: `In resume but not in profile: "${resumeValue}"` };
  }
  
  if (rVal === pVal) {
    return { status: 'match', message: 'Matches' };
  }
  
  return { 
    status: 'different', 
    message: `Different - Resume: "${resumeValue}" | Profile: "${profileValue}"` 
  };
}

function compareArrays(resumeArray, profileArray, fieldName) {
  const rArr = resumeArray || [];
  const pArr = profileArray || [];
  
  const differences = [];
  
  // Items in profile but not in resume
  pArr.forEach(pItem => {
    const matchFound = rArr.some(rItem => {
      return JSON.stringify(rItem).toLowerCase() === JSON.stringify(pItem).toLowerCase();
    });
    
    if (!matchFound) {
      differences.push({
        status: 'missing',
        message: `In profile but not in resume: ${JSON.stringify(pItem)}`
      });
    }
  });
  
  // Items in resume but not in profile
  rArr.forEach(rItem => {
    const matchFound = pArr.some(pItem => {
      return JSON.stringify(rItem).toLowerCase() === JSON.stringify(pItem).toLowerCase();
    });
    
    if (!matchFound) {
      differences.push({
        status: 'extra',
        message: `In resume but not in profile: ${JSON.stringify(rItem)}`
      });
    }
  });
  
  if (differences.length === 0) {
    differences.push({ status: 'match', message: 'All items match' });
  }
  
  return differences;
}

function compareSkills(resumeSkills, profileSkills) {
  const rSkills = (resumeSkills || []).map(s => s.toLowerCase().trim());
  const pSkills = (profileSkills || []).map(s => s.toLowerCase().trim());
  
  const differences = [];
  
  // Skills in profile but not in resume
  pSkills.forEach(skill => {
    if (!rSkills.includes(skill)) {
      differences.push({
        status: 'missing',
        message: `Skill in profile but not in resume: ${skill}`
      });
    }
  });
  
  // Skills in resume but not in profile
  rSkills.forEach(skill => {
    if (!pSkills.includes(skill)) {
      differences.push({
        status: 'extra',
        message: `Skill in resume but not in profile: ${skill}`
      });
    }
  });
  
  if (differences.length === 0) {
    differences.push({ status: 'match', message: 'All skills match' });
  }
  
  return differences;
}

function displayComparison(container, comparison, platform) {
  let html = `<h3>Comparison with ${platform}</h3>`;
  
  Object.keys(comparison).forEach(field => {
    const fieldData = comparison[field];
    const fieldTitle = field.charAt(0).toUpperCase() + field.slice(1);
    
    html += `
      <div class="diff-section">
        <div class="diff-header">${fieldTitle}</div>
        <div class="diff-content">
    `;
    
    if (Array.isArray(fieldData)) {
      fieldData.forEach(item => {
        html += `
          <div class="diff-item ${item.status}">
            <div class="diff-label">
              ${getStatusBadge(item.status)}
            </div>
            <div class="diff-value">${item.message}</div>
          </div>
        `;
      });
    } else {
      html += `
        <div class="diff-item ${fieldData.status}">
          <div class="diff-label">
            ${getStatusBadge(fieldData.status)}
          </div>
          <div class="diff-value">${fieldData.message}</div>
        </div>
      `;
    }
    
    html += `
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

function getStatusBadge(status) {
  const badges = {
    match: '<span class="badge badge-success">✓ Match</span>',
    missing: '<span class="badge badge-warning">⚠ Missing in Resume</span>',
    extra: '<span class="badge badge-info">ℹ Extra in Resume</span>',
    different: '<span class="badge badge-danger">✗ Different</span>'
  };
  
  return badges[status] || '';
}

// Load current resume on popup open
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('loadResume').click();
});
