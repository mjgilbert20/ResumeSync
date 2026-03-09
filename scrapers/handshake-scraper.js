// ResumeSync - Handshake Content Script

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extractProfile") {
    try {
      const profileData = extractHandshakeProfile();
      console.log("[ResumeSync] Handshake extracted:", profileData);
      sendResponse({ success: true, profileData });
    } catch (error) {
      console.error("[ResumeSync] Handshake extraction error:", error);
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

  const main = document.querySelector("main") || document.body;
  const allElements = main.querySelectorAll("*");

  // === NAME ===
  profileData.name = (
    document.querySelector('[data-hook="profile-name"]')?.textContent.trim() ||
    main.querySelector("h1")?.textContent.trim() ||
    ""
  ).trim();
  console.log("[ResumeSync] Handshake name:", profileData.name);

  // === TITLE ===
  profileData.title = (
    document.querySelector('[data-hook="profile-headline"]')?.textContent.trim() ||
    main.querySelector("h2")?.textContent.trim() ||
    ""
  ).trim();
  console.log("[ResumeSync] Handshake title:", profileData.title);

  // === SUMMARY - Generic scanner ===
  console.log("[ResumeSync] Scanning for summary section...");
  let summaryFound = false;
  
  // First try specific selectors as fallback
  let aboutEl = document.querySelector('[data-hook="profile-summary"]') ||
    document.querySelector(".about-me-text") ||
    document.querySelector('[data-test="about-me"]');
  
  if (aboutEl) {
    profileData.summary = aboutEl.textContent.trim();
    summaryFound = true;
    console.log("[ResumeSync] Summary found via data selector");
  }
  
  // If not found, scan for "About" or "Summary" heading
  if (!summaryFound) {
    for (let el of allElements) {
      const heading = el.querySelector("h2, h3, h4, h5");
      if (heading && /^about|^summary|biography|bio/i.test(heading.textContent.trim())) {
        const text = el.textContent.trim();
        // Get only the content after the heading, not the entire section
        const headingText = heading.textContent.trim();
        let summaryText = text.replace(headingText, "").trim();
        
        // Clean up and get reasonable length (not too short, not entire page)
        if (summaryText.length > 20 && summaryText.length < 2000) {
          profileData.summary = summaryText;
          summaryFound = true;
          console.log("[ResumeSync] Summary found via heading scan");
          break;
        }
      }
    }
  }
  
  // Final fallback: look for paragraph immediately after name/title
  if (!summaryFound && profileData.title) {
    for (let el of allElements) {
      const text = el.textContent.trim();
      if (text.includes(profileData.title) && text.length < 1000 && text.length > 50) {
        profileData.summary = text.replace(profileData.title, "").replace(profileData.name, "").trim();
        if (profileData.summary.length > 20) {
          summaryFound = true;
          console.log("[ResumeSync] Summary found via context scan");
          break;
        }
      }
    }
  }
  
  console.log("[ResumeSync] Handshake summary:", profileData.summary.substring(0, 50) + "...");

  // === EXPERIENCE - Generic scanner ===
  console.log("[ResumeSync] Scanning for experience section...");
  for (let el of allElements) {
    const text = el.textContent;
    // Look for section headings
    const heading = el.querySelector("h2, h3, h4, h5");
    if (heading && /experience|work|employment|job|position/i.test(heading.textContent) && text.length < 5000) {
      console.log("[ResumeSync] Found experience-like section");
      // Scan children for job entries
      const children = el.querySelectorAll("div, li, article, section");
      for (let child of children) {
        const childText = child.textContent;
        if (childText.length > 30 && childText.length < 1000) {
          // extract job info
          const lines = childText.split("\n").map(l => l.trim()).filter(l => l);
          if (lines.length >= 1) {
            profileData.experience.push({
              title: lines[0] || "",
              company: lines[1] || "",
              duration: lines[2] || "",
              description: lines.slice(3).join(" ").substring(0, 500)
            });
          }
        }
      }
      if (profileData.experience.length > 0) break;
    }
  }
  console.log("[ResumeSync] Experience items found:", profileData.experience.length);

  // === EDUCATION - Generic scanner ===
  console.log("[ResumeSync] Scanning for education section...");
  for (let el of allElements) {
    const heading = el.querySelector("h2, h3, h4, h5");
    if (heading && /education|school|university|college|degree/i.test(heading.textContent) && el.textContent.length < 5000) {
      console.log("[ResumeSync] Found education-like section");
      // Get all text from section and split into lines
      const sectionText = el.textContent;
      const allLines = sectionText.split("\n").map(l => l.trim()).filter(l => l);
      
      // Group lines into education entries
      // An education entry typically contains: school name, degree, year, gpa, etc.
      // We'll group lines that seem to belong together
      let currentEntry = { school: "", degree: "", year: "" };
      let entriesFound = [];
      
      for (let line of allLines) {
        // Skip the section heading
        if (/^education|^school|^university|^college/i.test(line)) continue;
        
        // Check if this line looks like a year (for grouping entries)
        const yearMatch = line.match(/\d{4}|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i);
        
        // If we have a year and previous entry has content, start new entry
        if (yearMatch && (currentEntry.school || currentEntry.degree)) {
          if (currentEntry.school || currentEntry.degree || currentEntry.year) {
            entriesFound.push({...currentEntry});
          }
          currentEntry = { school: "", degree: "", year: "" };
        }
        
        // Try to categorize the line
        if (/bachelor|master|associate|phd|degree|b\.?a|b\.?s|m\.?a|m\.?s/i.test(line)) {
          currentEntry.degree = line;
        } else if (/\d{4}|present|current|january|february|march|april|may|june|july|august|september|october|november|december/i.test(line)) {
          currentEntry.year = line;
        } else if (!currentEntry.school && (line.length > 10 || /university|college|school|institute/i.test(line))) {
          currentEntry.school = line;
        }
      }
      
      // Add last entry if it has content
      if (currentEntry.school || currentEntry.degree || currentEntry.year) {
        entriesFound.push(currentEntry);
      }
      
      profileData.education = entriesFound;
      if (profileData.education.length > 0) {
        console.log("[ResumeSync] Education items found with line grouping:", profileData.education.length);
        break;
      }
    }
  }
  console.log("[ResumeSync] Education items found:", profileData.education.length);

  // === SKILLS - Generic scanner ===
  console.log("[ResumeSync] Scanning for skills section...");
  for (let el of allElements) {
    const heading = el.querySelector("h2, h3, h4, h5");
    if (heading && /^skills?$/i.test(heading.textContent) && el.textContent.length < 3000) {
      console.log("[ResumeSync] Found skills section");
      // Get all text nodes and skill-like elements
      const skillTexts = new Set();
      const items = el.querySelectorAll("span, button, div, a, li, p");
      for (let item of items) {
        const text = item.textContent.trim();
        // Skills are typically short, non-action words
        if (text && text.length > 1 && text.length < 40 &&
            !/button|edit|add|remove|show|endorse|view/i.test(text)) {
          skillTexts.add(text);
        }
      }
      profileData.skills = Array.from(skillTexts);
      if (profileData.skills.length > 0) break;
    }
  }
  console.log("[ResumeSync] Skills items found:", profileData.skills.length);

  console.log("[ResumeSync] Final Handshake profile data:", profileData);
  return profileData;
}

if (window.location.href.includes("joinhandshake.com")) {
  console.log("ResumeSync: Handshake scraper ready");
}
