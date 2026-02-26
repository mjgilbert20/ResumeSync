// ResumeSync - LinkedIn Content Script
// Handles two modes:
//   1. extractProfile  — quick single-page scrape triggered by the Compare tab
//   2. START_CERTS_SKILLS_FLOW — deep multi-page scrape (certs → skills) for full profile data

(() => {
  // ── Constants ──────────────────────────────────────────────────────────────
  const FLOW_KEY    = "rs_flow";
  const STEP_KEY    = "rs_step";
  const PROFILE_KEY = "rs_profileSnapshot";
  const CERTS_KEY   = "rs_certsResult";
  const SKILLS_KEY  = "rs_skillsResult";

  // ── Utilities ──────────────────────────────────────────────────────────────
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const norm  = (s) => clean(s).toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── URL helpers ────────────────────────────────────────────────────────────

  // Returns the root profile URL (e.g. https://linkedin.com/in/johndoe/)
  // Works whether we're on the profile home page or any /details/ sub-page.
  // Returns null if the current page is not a profile page.
  function getProfileBaseUrlSafe() {
    const url  = new URL(location.href);
    const path = url.pathname || "";
    if (!path.includes("/in/")) return null;

    const basePath = path.includes("/details/")
      ? path.split("/details/")[0] + "/"
      : path.endsWith("/") ? path : path + "/";

    return url.origin + basePath;
  }

  const isCertsPage  = () => location.pathname.includes("/details/certifications");
  const isSkillsPage = () => location.pathname.includes("/details/skills");

  // ── MODE 1: Quick single-page scrape ──────────────────────────────────────
  // Used by the popup Compare tab "Quick Scan" button.
  // Extracts name, title, summary, experience, education, skills from the
  // currently visible profile page without any navigation.

  function extractLinkedInProfile() {
    const profileData = {
      name: "", title: "", summary: "",
      experience: [], education: [], skills: []
    };

    // Name
    const nameEl =
      document.querySelector("h1.text-heading-xlarge") ||
      document.querySelector(".pv-text-details__left-panel h1") ||
      document.querySelector(".inline.t-24.t-black.t-normal.break-words");
    if (nameEl) profileData.name = nameEl.textContent.trim();

    // Headline / title
    const titleEl =
      document.querySelector(".text-body-medium.break-words") ||
      document.querySelector(".pv-text-details__left-panel .text-body-medium") ||
      document.querySelector(".mt1.t-18.t-black.t-normal.break-words");
    if (titleEl) profileData.title = titleEl.textContent.trim();

    // About / summary
    const aboutSection =
      document.querySelector("#about") ||
      document.querySelector(".pv-about-section");
    if (aboutSection) {
      const summaryText =
        aboutSection.closest("section")?.querySelector(".inline-show-more-text") ||
        aboutSection.closest("section")?.querySelector(".pv-about__summary-text");
      if (summaryText) profileData.summary = summaryText.textContent.trim();
    }

    // Experience
    const expSection = document.querySelector("#experience");
    if (expSection) {
      const items = expSection.closest("section")?.querySelectorAll("li.artdeco-list__item") || [];
      items.forEach((item) => {
        const titleEl2   = item.querySelector('.mr1.t-bold span[aria-hidden="true"]') ||
                           item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
        const companyEl  = item.querySelector('.t-14.t-normal span[aria-hidden="true"]') ||
                           item.querySelector('.pvs-entity__secondary-subtitle span[aria-hidden="true"]');
        const durationEl = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        if (titleEl2 || companyEl) {
          profileData.experience.push({
            title:    titleEl2?.textContent.trim()   || "",
            company:  companyEl?.textContent.trim()  || "",
            duration: durationEl?.textContent.trim() || "",
            description: ""
          });
        }
      });
    }

    // Education
    const eduSection = document.querySelector("#education");
    if (eduSection) {
      const items = eduSection.closest("section")?.querySelectorAll("li.artdeco-list__item") || [];
      items.forEach((item) => {
        const schoolEl = item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
                         item.querySelector('.pvs-entity__caption-wrapper span[aria-hidden="true"]');
        const degreeEl = item.querySelector('.t-14.t-normal span[aria-hidden="true"]');
        const yearEl   = item.querySelector('.t-14.t-normal.t-black--light span[aria-hidden="true"]');
        if (schoolEl) {
          profileData.education.push({
            school: schoolEl?.textContent.trim() || "",
            degree: degreeEl?.textContent.trim() || "",
            year:   yearEl?.textContent.trim()   || ""
          });
        }
      });

      // Fallback for older LinkedIn layout
      if (profileData.education.length === 0) {
        document.querySelectorAll(".pv-profile-section__card-item").forEach((item) => {
          const schoolEl = item.querySelector("h3");
          if (schoolEl) {
            profileData.education.push({
              school: schoolEl.textContent.trim(),
              degree: item.querySelector(".pv-entity__secondary-title")?.textContent.trim() || "",
              year:   item.querySelector(".pv-entity__date-range span:nth-child(2)")?.textContent.trim() || ""
            });
          }
        });
      }
    }

    // Skills (from the profile home page #skills section)
    const skillsSection = document.querySelector("#skills");
    if (skillsSection) {
      const items = skillsSection.closest("section")?.querySelectorAll("li.artdeco-list__item") || [];
      items.forEach((item) => {
        const skillEl =
          item.querySelector('.mr1.hoverable-link-text.t-bold span[aria-hidden="true"]') ||
          item.querySelector('span[aria-hidden="true"]');
        if (skillEl) {
          const name = skillEl.textContent.trim();
          if (name && !/endorsement/i.test(name)) profileData.skills.push(name);
        }
      });
    }

    return profileData;
  }

  // ── MODE 2: Deep multi-page scrape ────────────────────────────────────────
  // Navigates certifications page → skills page → back to profile home,
  // collecting data at each stop and stitching it together.
  // Triggered by "Deep Scan LinkedIn" in the popup.

  // -- Basic info from the profile home page (about / experience / education text blocks)
  function scrapeProfileBasic() {
    const main  = document.querySelector("main") || document.body;
    const cards = [...main.querySelectorAll("section, div")]
      .map((el) => {
        const h          = el.querySelector("h2,h3");
        const headingRaw = clean(h?.innerText);
        const heading    = norm(headingRaw);
        const text       = clean(el.innerText);
        return { headingRaw, heading, text };
      })
      .filter((c) => c.text.length > 120 && c.headingRaw);

    const pick = (kws) => cards.find((c) => kws.some((k) => c.heading.includes(k))) || null;

    const about      = pick(["about"]);
    const experience = pick(["experience"]);
    const education  = pick(["education"]);

    return {
      url:        location.href,
      about:      about      ? { heading: about.headingRaw,      text: about.text      } : null,
      experience: experience ? { heading: experience.headingRaw, text: experience.text } : null,
      education:  education  ? { heading: education.headingRaw,  text: education.text  } : null
    };
  }

  // -- Certifications/licenses page scraper
  async function scrapeCertifications() {
    const cleanLines = (txt) =>
      (txt || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) =>
          !/^Edit license or certification/i.test(s) &&
          !/^Edit\b/i.test(s) &&
          !/^(Show|See) credential/i.test(s)
        );

    const editButtons = [...document.querySelectorAll(
      'button[data-view-name="license-certifications-edit-button"], ' +
      'button[aria-label^="Edit license or certification"]'
    )];

    const containers = [];
    for (const btn of editButtons) {
      const card = btn.closest("li") || btn.closest("div");
      if (card && !containers.includes(card)) containers.push(card);
    }

    const results = containers.map((card) => {
      const btn          = card.querySelector(
        'button[data-view-name="license-certifications-edit-button"], ' +
        'button[aria-label^="Edit license or certification"]'
      );
      const aria         = btn?.getAttribute("aria-label") || "";
      const nameFromAria = aria.replace(/^Edit license or certification\s*/i, "").trim();
      const lines        = cleanLines(card.innerText);
      const name         = nameFromAria || lines[0] || "";
      const issued       = lines.find((l) => /^Issued/i.test(l))        || "";
      const expires      = lines.find((l) => /^Expires/i.test(l))       || "";
      const credentialId = lines.find((l) => /^Credential ID/i.test(l)) || "";
      const issuer       = lines.find((l, idx) => {
        if (!l)                                           return false;
        if (idx === 0 && l === name)                     return false;
        if (/^(Issued|Expires|Credential ID)/i.test(l))  return false;
        if (/^No expiration date/i.test(l))              return false;
        return true;
      }) || "";
      const link = card.querySelector('a[href^="https://"], a[href^="/"]')?.href || "";

      return { name, issuer, issued, expires, credentialId, link };
    });

    const seen = new Set();
    return results.filter((r) => {
      const key = (r.name + "|" + r.issuer).toLowerCase();
      if (!r.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // -- Skills page scraper
  async function scrapeSkills() {
    // Scroll to trigger lazy-loaded content
    for (let i = 0; i < 4; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(600);
    }

    const skillEls = [...document.querySelectorAll('[componentkey^="com.linkedin.sdui.profile.skill("]')];
    let skills = [];

    if (skillEls.length) {
      skills = skillEls
        .map((el) => clean(el.querySelector("p")?.innerText || el.innerText))
        .filter(Boolean);
    } else {
      // Fallback: scan all <p>/<span> and filter to skill-like strings
      skills = [...document.querySelectorAll("p,span")]
        .map((el) => clean(el.innerText))
        .filter(Boolean)
        .filter((t) => t.length >= 2 && t.length <= 60)
        .filter((t) => !/show all|see all|edit|add a skill|endorse/i.test(t.toLowerCase()))
        .filter((t) => !t.toLowerCase().includes(" at "))
        .filter((t) => !/^skills$/i.test(t));
    }

    return [...new Set(skills)];
  }

  // ── Multi-page flow controller ─────────────────────────────────────────────
  // Runs on every LinkedIn page load. Checks sessionStorage to see whether
  // a deep scan is in progress and, if so, executes the appropriate step.

  async function handleFlowOnLoad() {
    const flow = sessionStorage.getItem(FLOW_KEY);
    if (!flow) return;

    const baseUrl = getProfileBaseUrlSafe();
    if (!baseUrl) {
      sessionStorage.removeItem(FLOW_KEY);
      sessionStorage.removeItem(STEP_KEY);
      return;
    }

    const step = sessionStorage.getItem(STEP_KEY) || "";

    if (flow === "CERTS_SKILLS") {
      // ── Step 1: scrape certifications page, then navigate to skills ──
      if (step === "CERTS" && isCertsPage()) {
        const certs = await scrapeCertifications();
        sessionStorage.setItem(CERTS_KEY, JSON.stringify(certs));
        sessionStorage.setItem(STEP_KEY, "SKILLS");
        location.assign(baseUrl + "details/skills/");
        return;
      }

      // ── Step 2: scrape skills page, assemble payload, save to storage ──
      if (step === "SKILLS" && isSkillsPage()) {
        const skills = await scrapeSkills();
        sessionStorage.setItem(SKILLS_KEY, JSON.stringify(skills));

        let profile = null;
        let certs   = [];
        try { profile = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null"); } catch {}
        try { certs   = JSON.parse(sessionStorage.getItem(CERTS_KEY)   || "[]");   } catch {}

        const payload = { site: "linkedin", baseUrl, profile, certs, skills };
        await chrome.storage.local.set({ rs_lastResult: payload });

        // Clean up temp keys
        [FLOW_KEY, STEP_KEY, PROFILE_KEY, CERTS_KEY, SKILLS_KEY]
          .forEach((k) => sessionStorage.removeItem(k));

        location.assign(baseUrl);
        return;
      }

      // ── Recovery: wrong page, redirect back on track ──
      if (step === "CERTS"  && !isCertsPage())  location.assign(baseUrl + "details/certifications/");
      if (step === "SKILLS" && !isSkillsPage()) location.assign(baseUrl + "details/skills/");
    }
  }

  handleFlowOnLoad();

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    // Quick scan — called by popup "Quick Scan Profile" button
    if (request.action === "extractProfile") {
      try {
        const profileData = extractLinkedInProfile();
        sendResponse({ success: true, profileData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    // Deep scan — called by popup "Deep Scan LinkedIn" button
    // Navigates through certifications and skills sub-pages to collect full data
    if (request.cmd === "START_CERTS_SKILLS_FLOW") {
      const baseUrl = getProfileBaseUrlSafe();
      if (!baseUrl) {
        sendResponse({ success: false, error: "Not on a LinkedIn profile page." });
        return true;
      }

      const profileSnapshot = scrapeProfileBasic();
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify(profileSnapshot));
      sessionStorage.setItem(FLOW_KEY, "CERTS_SKILLS");
      sessionStorage.setItem(STEP_KEY, "CERTS");

      location.assign(baseUrl + "details/certifications/");
      sendResponse({ success: true });
      return true;
    }
  });

  if (window.location.href.includes("linkedin.com/in/")) {
    console.log("ResumeSync: LinkedIn scraper ready");
  }
})();
