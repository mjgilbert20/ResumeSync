// Handshake Profile Scraper Content Script

// Cross-browser compatibility
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

browserAPI.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfile') {
    try {
      const profileData = extractHandshakeProfile();
      sendResponse({ success: true, profileData: profileData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true; // Keep message channel open for async response
});

function extractHandshakeProfile() {
  const profileData = {
    name: '',
    title: '',
    summary: '',
    experience: [],
    education: [],
    skills: []
  };
  
  // Extract Name
  const nameElement = document.querySelector('[data-hook="profile-name"]') ||
                     document.querySelector('h1.profile-name') ||
                     document.querySelector('.student-name') ||
                     document.querySelector('h1');
  if (nameElement) {
    profileData.name = nameElement.textContent.trim();
  }
  
  // Extract Title/Headline (often found in profile summary or header)
  const titleElement = document.querySelector('[data-hook="profile-headline"]') ||
                      document.querySelector('.profile-headline') ||
                      document.querySelector('.student-headline');
  if (titleElement) {
    profileData.title = titleElement.textContent.trim();
  }
  
  // Extract Summary/About
  const summaryElement = document.querySelector('[data-hook="profile-summary"]') ||
                        document.querySelector('.profile-summary') ||
                        document.querySelector('.about-me-text') ||
                        document.querySelector('[data-test="about-me"]');
  if (summaryElement) {
    profileData.summary = summaryElement.textContent.trim();
  }
  
  // Extract Experience
  const experienceSection = document.querySelector('[data-hook="experiences-section"]') ||
                          document.querySelector('.experiences-section') ||
                          document.querySelector('[data-test="experiences"]');
  
  if (experienceSection) {
    const expItems = experienceSection.querySelectorAll('[data-hook="experience-card"]') ||
                    experienceSection.querySelectorAll('.experience-card') ||
                    experienceSection.querySelectorAll('[data-test="experience-item"]');
    
    expItems.forEach(item => {
      const titleEl = item.querySelector('[data-hook="experience-title"]') ||
                     item.querySelector('.experience-title') ||
                     item.querySelector('h3') ||
                     item.querySelector('.position-title');
      
      const companyEl = item.querySelector('[data-hook="experience-company"]') ||
                       item.querySelector('.experience-company') ||
                       item.querySelector('.company-name');
      
      const durationEl = item.querySelector('[data-hook="experience-duration"]') ||
                        item.querySelector('.experience-duration') ||
                        item.querySelector('.date-range');
      
      const descEl = item.querySelector('[data-hook="experience-description"]') ||
                    item.querySelector('.experience-description');
      
      if (titleEl) {
        profileData.experience.push({
          title: titleEl.textContent.trim(),
          company: companyEl?.textContent.trim() || '',
          duration: durationEl?.textContent.trim() || '',
          description: descEl?.textContent.trim() || ''
        });
      }
    });
  }
  
  // Extract Education
  const educationSection = document.querySelector('[data-hook="educations-section"]') ||
                         document.querySelector('.educations-section') ||
                         document.querySelector('[data-test="education"]');
  
  if (educationSection) {
    const eduItems = educationSection.querySelectorAll('[data-hook="education-card"]') ||
                    educationSection.querySelectorAll('.education-card') ||
                    educationSection.querySelectorAll('[data-test="education-item"]');
    
    eduItems.forEach(item => {
      const schoolEl = item.querySelector('[data-hook="education-school"]') ||
                      item.querySelector('.education-school') ||
                      item.querySelector('h3') ||
                      item.querySelector('.school-name');
      
      const degreeEl = item.querySelector('[data-hook="education-degree"]') ||
                      item.querySelector('.education-degree') ||
                      item.querySelector('.degree-name');
      
      const yearEl = item.querySelector('[data-hook="education-dates"]') ||
                    item.querySelector('.education-dates') ||
                    item.querySelector('.date-range');
      
      if (schoolEl) {
        profileData.education.push({
          school: schoolEl.textContent.trim(),
          degree: degreeEl?.textContent.trim() || '',
          year: yearEl?.textContent.trim() || ''
        });
      }
    });
  }
  
  // Extract Skills
  const skillsSection = document.querySelector('[data-hook="skills-section"]') ||
                       document.querySelector('.skills-section') ||
                       document.querySelector('[data-test="skills"]');
  
  if (skillsSection) {
    const skillItems = skillsSection.querySelectorAll('[data-hook="skill-tag"]') ||
                      skillsSection.querySelectorAll('.skill-tag') ||
                      skillsSection.querySelectorAll('.skill-item') ||
                      skillsSection.querySelectorAll('[data-test="skill"]');
    
    skillItems.forEach(item => {
      const skillName = item.textContent.trim();
      if (skillName) {
        profileData.skills.push(skillName);
      }
    });
  }
  
  // Fallback: Try to find skills in a simple list format
  if (profileData.skills.length === 0) {
    const skillsList = document.querySelectorAll('.skills li') ||
                      document.querySelectorAll('[class*="skill"] span');
    
    skillsList.forEach(item => {
      const skillName = item.textContent.trim();
      if (skillName && skillName.length < 50) { // Avoid picking up long descriptions
        profileData.skills.push(skillName);
      }
    });
  }
  
  // Clean up empty strings and duplicates
  profileData.skills = [...new Set(profileData.skills.filter(s => s.length > 0))];
  
  return profileData;
}

// Auto-extract when extension is loaded on Handshake profile page
if (window.location.href.includes('joinhandshake.com')) {
  console.log('Handshake Profile Scraper: Ready to extract profile data');
}
