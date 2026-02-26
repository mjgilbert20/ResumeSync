// LinkedIn Profile Scraper Content Script

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfile') {
    try {
      const profileData = extractLinkedInProfile();
      sendResponse({ success: true, profileData: profileData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep message channel open for async response
});

function extractLinkedInProfile() {
  const profileData = {
    name: '',
    title: '',
    summary: '',
    experience: [],
    education: [],
    skills: []
  };
  
  // Extract Name
  const nameElement = document.querySelector('h1.text-heading-xlarge') || 
                     document.querySelector('.pv-text-details__left-panel h1') ||
                     document.querySelector('.inline.t-24.t-black.t-normal.break-words');
  if (nameElement) {
    profileData.name = nameElement.textContent.trim();
  }
  
  // Extract Title/Headline
  const titleElement = document.querySelector('.text-body-medium.break-words') ||
                      document.querySelector('.pv-text-details__left-panel .text-body-medium') ||
                      document.querySelector('.mt1.t-18.t-black.t-normal.break-words');
  if (titleElement) {
    profileData.title = titleElement.textContent.trim();
  }
  
  // Extract Summary/About
  const summarySection = document.querySelector('#about') || 
                        document.querySelector('.pv-about-section');
  if (summarySection) {
    const summaryText = summarySection.closest('section')?.querySelector('.inline-show-more-text') ||
                       summarySection.closest('section')?.querySelector('.pv-about__summary-text');
    if (summaryText) {
      profileData.summary = summaryText.textContent.trim();
    }
  }
  
  // Extract Experience
  const experienceSection = document.querySelector('#experience');
  if (experienceSection) {
    const expItems = experienceSection.closest('section')?.querySelectorAll('li.artdeco-list__item') || [];
    
    expItems.forEach(item => {
      const titleEl = item.querySelector('.mr1.t-bold span[aria-hidden="true"]') ||
                     item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
      const companyEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                       item.querySelector('.pvs-entity__secondary-subtitle span[aria-hidden="true"]');
      const durationEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]') ||
                        item.querySelector('.pvs-entity__caption-wrapper .t-14 span[aria-hidden="true"]');
      
      if (titleEl || companyEl) {
        profileData.experience.push({
          title: titleEl?.textContent.trim() || '',
          company: companyEl?.textContent.trim() || '',
          duration: durationEl?.textContent.trim() || '',
          description: ''
        });
      }
    });
  }
  
  // Extract Education
  const educationSection = document.querySelector('#education');
  if (educationSection) {
    const eduItems = educationSection.closest('section')?.querySelectorAll('li.artdeco-list__item') || [];
    
    eduItems.forEach(item => {
      const schoolEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
                      item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
      const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
      const yearEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
      
      if (schoolEl) {
        profileData.education.push({
          school: schoolEl?.textContent.trim() || '',
          degree: degreeEl?.textContent.trim() || '',
          year: yearEl?.textContent.trim() || ''
        });
      }
    });
  }
  
  // Extract Skills
  const skillsSection = document.querySelector('#skills');
  if (skillsSection) {
    const skillItems = skillsSection.closest('section')?.querySelectorAll('li.artdeco-list__item') || [];
    
    skillItems.forEach(item => {
      const skillEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
                     item.querySelector('span[aria-hidden="true"]');
      
      if (skillEl) {
        const skillName = skillEl.textContent.trim();
        if (skillName && !skillName.includes('Endorsement') && !skillName.includes('endorsement')) {
          profileData.skills.push(skillName);
        }
      }
    });
  }
  
  // Fallback: Try alternative selectors if main ones didn't work
  if (profileData.experience.length === 0) {
    // Try older LinkedIn layout
    const oldExpItems = document.querySelectorAll('.pv-profile-section__card-item');
    oldExpItems.forEach(item => {
      const titleEl = item.querySelector('h3');
      const companyEl = item.querySelector('.pv-entity__secondary-title');
      const durationEl = item.querySelector('.pv-entity__date-range span:nth-child(2)');
      
      if (titleEl) {
        profileData.experience.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          duration: durationEl?.textContent.trim() || '',
          description: ''
        });
      }
    });
  }
  
  return profileData;
}

// Auto-extract when extension is loaded on LinkedIn profile page
if (window.location.href.includes('linkedin.com/in/')) {
  console.log('LinkedIn Profile Scraper: Ready to extract profile data');
}
