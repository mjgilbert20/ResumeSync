// ResumeSync - Handshake Content Script

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractProfile") {
    try {
      const profileData = extractHandshakeProfile();
      sendResponse({ success: true, profileData });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
  }
  return true;
});

function extractHandshakeProfile() {
  const profileData = {
    name: "", title: "", summary: "",
    experience: [], education: [], skills: []
  };

  // Name
  const nameEl =
    document.querySelector('[data-hook="profile-name"]') ||
    document.querySelector("h1.profile-name") ||
    document.querySelector(".student-name") ||
    document.querySelector("h1");
  if (nameEl) profileData.name = nameEl.textContent.trim();

  // Title / headline
  const titleEl =
    document.querySelector('[data-hook="profile-headline"]') ||
    document.querySelector(".profile-headline") ||
    document.querySelector(".student-headline");
  if (titleEl) profileData.title = titleEl.textContent.trim();

  // Summary / about
  const summaryEl =
    document.querySelector('[data-hook="profile-summary"]') ||
    document.querySelector(".profile-summary") ||
    document.querySelector(".about-me-text") ||
    document.querySelector('[data-test="about-me"]');
  if (summaryEl) profileData.summary = summaryEl.textContent.trim();

  // Experience
  const expSection =
    document.querySelector('[data-hook="experiences-section"]') ||
    document.querySelector(".experiences-section") ||
    document.querySelector('[data-test="experiences"]');

  if (expSection) {
    const items =
      expSection.querySelectorAll('[data-hook="experience-card"]') ||
      expSection.querySelectorAll(".experience-card") ||
      expSection.querySelectorAll('[data-test="experience-item"]');

    items.forEach((item) => {
      const titleEl2  = item.querySelector('[data-hook="experience-title"]')    || item.querySelector("h3");
      const companyEl = item.querySelector('[data-hook="experience-company"]')  || item.querySelector(".company-name");
      const durEl     = item.querySelector('[data-hook="experience-duration"]') || item.querySelector(".date-range");
      const descEl    = item.querySelector('[data-hook="experience-description"]');
      if (titleEl2) {
        profileData.experience.push({
          title:       titleEl2.textContent.trim(),
          company:     companyEl?.textContent.trim() || "",
          duration:    durEl?.textContent.trim()     || "",
          description: descEl?.textContent.trim()    || ""
        });
      }
    });
  }

  // Education
  const eduSection =
    document.querySelector('[data-hook="educations-section"]') ||
    document.querySelector(".educations-section") ||
    document.querySelector('[data-test="education"]');

  if (eduSection) {
    const items =
      eduSection.querySelectorAll('[data-hook="education-card"]') ||
      eduSection.querySelectorAll(".education-card") ||
      eduSection.querySelectorAll('[data-test="education-item"]');

    items.forEach((item) => {
      const schoolEl = item.querySelector('[data-hook="education-school"]') || item.querySelector("h3");
      const degreeEl = item.querySelector('[data-hook="education-degree"]');
      const yearEl   = item.querySelector('[data-hook="education-dates"]')  || item.querySelector(".date-range");
      if (schoolEl) {
        profileData.education.push({
          school: schoolEl.textContent.trim(),
          degree: degreeEl?.textContent.trim() || "",
          year:   yearEl?.textContent.trim()   || ""
        });
      }
    });
  }

  // Skills
  const skillsSection =
    document.querySelector('[data-hook="skills-section"]') ||
    document.querySelector(".skills-section") ||
    document.querySelector('[data-test="skills"]');

  if (skillsSection) {
    const items =
      skillsSection.querySelectorAll('[data-hook="skill-tag"]') ||
      skillsSection.querySelectorAll(".skill-tag") ||
      skillsSection.querySelectorAll(".skill-item");

    items.forEach((item) => {
      const name = item.textContent.trim();
      if (name) profileData.skills.push(name);
    });
  }

  // Fallback skills
  if (profileData.skills.length === 0) {
    document.querySelectorAll(".skills li, [class*='skill'] span").forEach((item) => {
      const name = item.textContent.trim();
      if (name && name.length < 50) profileData.skills.push(name);
    });
  }

  profileData.skills = [...new Set(profileData.skills.filter((s) => s.length > 0))];

  return profileData;
}

if (window.location.href.includes("joinhandshake.com")) {
  console.log("ResumeSync: Handshake scraper ready");
}
