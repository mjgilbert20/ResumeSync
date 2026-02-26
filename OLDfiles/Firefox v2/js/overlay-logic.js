// Resume Manager Overlay Logic Script

// Cross-browser compatibility: Use browser API if available (Firefox), otherwise chrome API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Get the overlay container
const overlayRoot = $$('#resume-manager-overlay');

// Helper function to query within overlay
function $$(selector) {
  return overlayRoot.querySelector(selector);
}

function $$all(selector) {
  return overlayRoot.querySelectorAll(selector);
}

// Tab switching
$$all('.tab-btn').forEach(button => {
  button.addEventListener('click', () => {
    const tabName = button.dataset.tab;
    
    // Update active tab button
    $$all('.tab-btn').forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
    
    // Update active tab content
    $$all('.tab-content').forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Load data when switching to versions tab
    if (tabName === 'versions') {
      loadVersionHistory();
    }
  });
});

// Save resume
$$('#saveResume').addEventListener('click', async () => {
  const statusEl = $$('#saveStatus');
  
  try {
    const resumeData = {
      fullName: $$('#fullName').value,
      email: $$('#email').value,
      phone: $$('#phone').value,
      title: $$('#title').value,
      summary: $$('#summary').value,
      experience: parseJSON($$('#experience').value, []),
      education: parseJSON($$('#education').value, []),
      skills: $$('#skills').value.split(',').map(s => s.trim()).filter(s => s),
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
    const versionNotes = $$('#versionNotes').value || 'Manual save';
    await createVersion(resumeData, versionNotes);
    
    showStatus(statusEl, 'success', '✓ Resume saved successfully!');
    $$('#versionNotes').value = '';
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error: ${error.message}`);
  }
});

// Load current resume
$$('#loadResume').addEventListener('click', async () => {
  const statusEl = $$('#saveStatus');
  
  try {
    const result = await browserAPI.storage.local.get('currentResume');
    
    if (!result.currentResume) {
      showStatus(statusEl, 'info', 'No saved resume found');
      return;
    }
    
    const resume = result.currentResume;
    
    $$('#fullName').value = resume.fullName || '';
    $$('#email').value = resume.email || '';
    $$('#phone').value = resume.phone || '';
    $$('#title').value = resume.title || '';
    $$('#summary').value = resume.summary || '';
    $$('#experience').value = JSON.stringify(resume.experience || [], null, 2);
    $$('#education').value = JSON.stringify(resume.education || [], null, 2);
    $$('#skills').value = (resume.skills || []).join(', ');
    
    showStatus(statusEl, 'success', '✓ Resume loaded successfully!');
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error: ${error.message}`);
  }
});

// Parse PDF Resume
$$('#parsePDF').addEventListener('click', async () => {
  const fileInput = $$('#pdfUpload');
  const statusEl = $$('#pdfStatus');
  
  if (!fileInput.files || fileInput.files.length === 0) {
    showStatus(statusEl, 'error', 'Please select a PDF file first');
    return;
  }
  
  const file = fileInput.files[0];
  
  if (!file.type.includes('pdf')) {
    showStatus(statusEl, 'error', 'Please select a valid PDF file');
    return;
  }
  
  try {
    showStatus(statusEl, 'info', 'Parsing PDF... This may take a moment.');
    
    // Read PDF file
    const arrayBuffer = await file.arrayBuffer();
    const pdfText = await extractTextFromPDF(arrayBuffer);
    
    // Parse resume data from text
    const resumeData = parseResumeText(pdfText);
    
    // Auto-fill form fields
    $$('#fullName').value = resumeData.fullName || '';
    $$('#email').value = resumeData.email || '';
    $$('#phone').value = resumeData.phone || '';
    $$('#title').value = resumeData.title || '';
    $$('#summary').value = resumeData.summary || '';
    $$('#experience').value = JSON.stringify(resumeData.experience || [], null, 2);
    $$('#education').value = JSON.stringify(resumeData.education || [], null, 2);
    $$('#skills').value = (resumeData.skills || []).join(', ');
    
    showStatus(statusEl, 'success', '✓ PDF parsed! Review and edit the data below, then save.');
    
  } catch (error) {
    showStatus(statusEl, 'error', `Error parsing PDF: ${error.message}`);
    console.error('PDF parsing error:', error);
  }
});

// Extract text from PDF using PDF.js
async function extractTextFromPDF(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  
  // Extract text from all pages
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
}

// Parse resume text to extract structured data
function parseResumeText(text) {
  const resumeData = {
    fullName: '',
    email: '',
    phone: '',
    title: '',
    summary: '',
    experience: [],
    education: [],
    skills: []
  };
  
  // Extract email
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    resumeData.email = emailMatch[0];
  }
  
  // Extract phone number (various formats)
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    resumeData.phone = phoneMatch[0].trim();
  }
  
  // Extract name (usually first line or before email/phone)
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  if (lines.length > 0) {
    // Try to find name in first few lines
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const line = lines[i].trim();
      // Name is typically 2-4 words, not too long, no numbers
      if (line.length > 3 && line.length < 50 && 
          !/\d/.test(line) && 
          !/@/.test(line) &&
          !line.toLowerCase().includes('resume') &&
          !line.toLowerCase().includes('cv')) {
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4) {
          resumeData.fullName = line;
          break;
        }
      }
    }
  }
  
  // Extract title/headline (often after name or in SUMMARY/PROFILE section)
  const titlePatterns = [
    /(?:professional\s+)?(?:title|position|role)[\s:]+([^\n]+)/i,
    /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})(?:\s*\||$)/m
  ];
  
  for (const pattern of titlePatterns) {
    const match = text.match(pattern);
    if (match && match[1] && match[1].length < 100) {
      resumeData.title = match[1].trim();
      break;
    }
  }
  
  // Extract summary/objective
  const summaryPatterns = [
    /(?:summary|profile|objective|about\s+me)[\s:]+([^]+?)(?=\n\n|experience|education|skills|work\s+history)/i,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      resumeData.summary = match[1].trim().substring(0, 500);
      break;
    }
  }
  
  // Extract experience
  const expSection = extractSection(text, ['experience', 'work history', 'employment', 'professional experience']);
  if (expSection) {
    resumeData.experience = parseExperience(expSection);
  }
  
  // Extract education
  const eduSection = extractSection(text, ['education', 'academic', 'qualifications']);
  if (eduSection) {
    resumeData.education = parseEducation(eduSection);
  }
  
  // Extract skills
  const skillsSection = extractSection(text, ['skills', 'technical skills', 'competencies', 'expertise']);
  if (skillsSection) {
    resumeData.skills = parseSkills(skillsSection);
  }
  
  return resumeData;
}

// Helper function to extract a section from text
function extractSection(text, headers) {
  const textLower = text.toLowerCase();
  
  for (const header of headers) {
    const headerIndex = textLower.indexOf(header);
    if (headerIndex === -1) continue;
    
    // Find the next section header
    const allHeaders = [
      'experience', 'education', 'skills', 'summary', 'objective',
      'work history', 'employment', 'professional experience',
      'academic', 'qualifications', 'technical skills', 'competencies',
      'projects', 'certifications', 'awards', 'references'
    ];
    
    let nextHeaderIndex = text.length;
    for (const nextHeader of allHeaders) {
      if (nextHeader === header) continue;
      const idx = textLower.indexOf(nextHeader, headerIndex + header.length);
      if (idx !== -1 && idx < nextHeaderIndex) {
        nextHeaderIndex = idx;
      }
    }
    
    const section = text.substring(headerIndex + header.length, nextHeaderIndex);
    return section.trim();
  }
  
  return null;
}

// Parse experience section
function parseExperience(text) {
  const experiences = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  let currentExp = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for job title patterns (often in ALL CAPS or Title Case)
    const titlePattern = /^([A-Z][A-Za-z\s&,.-]+?)(?:\s*[\|–-]\s*|\s{2,})/;
    const datePattern = /\b(20\d{2}|19\d{2})\b.*?(20\d{2}|19\d{2}|present|current)\b/i;
    
    if (titlePattern.test(line) || datePattern.test(line)) {
      if (currentExp) {
        experiences.push(currentExp);
      }
      
      currentExp = {
        title: '',
        company: '',
        duration: '',
        description: ''
      };
      
      // Try to extract title, company, and dates
      const parts = line.split(/[\|–-]/);
      if (parts.length >= 2) {
        currentExp.title = parts[0].trim();
        currentExp.company = parts[1].trim();
      } else {
        currentExp.title = line;
      }
      
      // Extract dates
      const dateMatch = line.match(datePattern);
      if (dateMatch) {
        currentExp.duration = dateMatch[0].trim();
      }
      
    } else if (currentExp) {
      // Add to description
      if (line.length > 10) {
        currentExp.description += (currentExp.description ? ' ' : '') + line;
      }
    }
  }
  
  if (currentExp) {
    experiences.push(currentExp);
  }
  
  return experiences.slice(0, 10); // Limit to 10 experiences
}

// Parse education section
function parseEducation(text) {
  const education = [];
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  
  let currentEdu = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for degree patterns
    const degreePattern = /(bachelor|master|phd|doctorate|associate|b\.?s\.?|m\.?s\.?|m\.?b\.?a\.?|b\.?a\.?)/i;
    const yearPattern = /\b(20\d{2}|19\d{2})\b/;
    
    if (degreePattern.test(trimmed) || (currentEdu === null && trimmed.length > 10)) {
      if (currentEdu) {
        education.push(currentEdu);
      }
      
      currentEdu = {
        school: '',
        degree: trimmed,
        year: ''
      };
      
      // Extract year
      const yearMatch = trimmed.match(yearPattern);
      if (yearMatch) {
        currentEdu.year = yearMatch[0];
      }
      
    } else if (currentEdu && !currentEdu.school && trimmed.length > 5) {
      currentEdu.school = trimmed;
    }
  }
  
  if (currentEdu) {
    education.push(currentEdu);
  }
  
  return education.slice(0, 5); // Limit to 5 education entries
}

// Parse skills section
function parseSkills(text) {
  const skills = [];
  
  // Remove section header
  const cleanText = text.replace(/^(skills|technical skills|competencies|expertise)[\s:]+/i, '');
  
  // Split by common delimiters
  const delimiters = /[,;•·\n|]/;
  const items = cleanText.split(delimiters);
  
  for (const item of items) {
    const skill = item.trim();
    // Valid skills are typically 2-50 characters and don't contain multiple sentences
    if (skill.length >= 2 && skill.length <= 50 && !skill.includes('.') && !skill.includes('  ')) {
      skills.push(skill);
    }
  }
  
  return [...new Set(skills)].slice(0, 30); // Remove duplicates and limit to 30 skills
}

// Scan profile for comparison
$$('#scanProfile').addEventListener('click', async () => {
  const statusEl = $$('#compareStatus');
  const resultsEl = $$('#comparisonResults');
  
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
  const listEl = $$('#versionsList');
  
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
    $$all('.restore-version').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const versionId = parseInt(e.target.dataset.versionId);
        await restoreVersion(versionId);
      });
    });
    
    $$all('.delete-version').forEach(btn => {
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

// Load current resume when overlay is first opened
// This is called by overlay-inject.js after the overlay is initialized
if (typeof initializeResumeData === 'undefined') {
  window.initializeResumeData = function() {
    const loadBtn = $$('#loadResume');
    if (loadBtn) {
      loadBtn.click();
    }
  };
  // Auto-load on script execution
  setTimeout(() => {
    window.initializeResumeData();
  }, 100);
}

