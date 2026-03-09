
(() => {
  // ── Session keys ──────────────────────────────────────────────────────────
  const FLOW_KEY  = "rs_flow";
  const STEP_KEY  = "rs_step";
  const QUEUE_KEY = "rs_queue";
  const HOME_KEY   = "rs_homeSnapshot";
  const CERTS_KEY  = "rs_certsResult";
  const SKILLS_KEY = "rs_skillsResult";
  const EDU_KEY    = "rs_eduResult";
  const FLOW_NAME     = "LINKEDIN_DEEP";
  const STEP_FINALIZE = "FINALIZE";

  // LinkedIn details routes
  const DETAILS = {
    certifications: "details/certifications/",
    skills: "details/skills/",
    education: "details/education/",
  //we can add more later
  };

  const CERT_BTN_SEL = '[data-view-name="license-certifications-see-license-button"]';

  // ── Utilities ─────────────────────────────────────────────────────────────
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const q = (sel, root = document) => [...root.querySelectorAll(sel)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function waitFor(predicate, { timeout = 15000, interval = 250, label = "" } = {}) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        if (predicate()) return true;
      } catch {}
      await sleep(interval);
    }
    console.warn("[ResumeSync] waitFor timed out:", label);
    return false;
  }

  function dedupe(arr, keyFn) {
    const seen = new Set();
    return (arr || []).filter((x) => {
      const k = clean(keyFn(x)).toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  function safeJsonParse(raw, fallback) {
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  // ── URL + page-type helpers ───────────────────────────────────────────────
  function getProfileBaseUrlSafe() {
    const url = new URL(location.href);
    const path = url.pathname || "";
    if (!path.includes("/in/")) return null;

    const basePath = path.includes("/details/")
      ? path.split("/details/")[0] + "/"
      : path.endsWith("/") ? path : path + "/";

    return url.origin + basePath;
  }

  const isHomePage = () =>
    location.hostname.includes("linkedin.com") &&
    location.pathname.startsWith("/in/") &&
    !location.pathname.includes("/details/");

  const isCertsPage = () => location.pathname.includes("/details/certifications");
  const isSkillsPage = () => location.pathname.includes("/details/skills");
  const isEducationPage = () => location.pathname.includes("/details/education");

  // ── Sections (robust finders) ──────────────────────────────────────────────
  const getSectionByViewName = (name) =>
    document.querySelector(`[data-view-name="${name}"]`)?.closest("section") ||
    document.querySelector(`[data-view-name="${name}"]`) ||
    null;

  const getSectionByHeading = (re) => {
    const main = document.querySelector("main") || document.body;
    const candidates = q("section, div", main);
    return (
      candidates.find((el) => {
        const h = el.querySelector("h2,h3");
        const ht = clean(h?.textContent);
        return ht && re.test(ht);
      }) || null
    );
  };

  const getEducationSection = () =>
    document.querySelector("#education")?.closest("section") ||
    getSectionByViewName("profile-card-education") ||
    getSectionByHeading(/^education$/i) ||
    getSectionByHeading(/education/i);

  // ── Summary/About extraction ──────────────────────────────────────────────
  function scrapeSummary() {
    let summary = "";
    
    // Try specific selectors first
    summary = document.querySelector('[data-view-name="about"] p')?.textContent?.trim() || "";
    if (summary) {
      console.log("[ResumeSync] Summary found via about data-view-name");
      return clean(summary).substring(0, 1000);
    }
    
    // Try to find summary section by heading
    const aboutSection = getSectionByHeading(/^about$/i) || getSectionByHeading(/about|biography|bio/i);
    if (aboutSection) {
      const p = q("p", aboutSection)[0];
      summary = p?.textContent?.trim() || "";
      if (summary) {
        console.log("[ResumeSync] Summary found via heading scan");
        return clean(summary).substring(0, 1000);
      }
    }
    
    // Another specific selector approach
    summary = document.querySelector('[data-view-name="profile-intro"] p')?.textContent?.trim() || "";
    if (summary) {
      console.log("[ResumeSync] Summary found via profile-intro");
      return clean(summary).substring(0, 1000);
    }
    
    // Try looking for text in the about section div
    const aboutDiv = document.querySelector('[data-view-name="about"]');
    if (aboutDiv) {
      const allText = aboutDiv.textContent || "";
      if (allText.length > 50) {
        summary = allText.trim();
        console.log("[ResumeSync] Summary found via about div text");
        return clean(summary).substring(0, 1000);
      }
    }
    
    console.log("[ResumeSync] No summary found");
    return "";
  }

  const getSkillsSection = () =>
    document.querySelector("#skills")?.closest("section") ||
    getSectionByViewName("profile-card-skills") ||
    getSectionByHeading(/^skills$/i) ||
    getSectionByHeading(/skills/i);

  const getCertsSection = () =>
    document.querySelector("#licenses_and_certifications")?.closest("section") ||
    document.querySelector("#licenses-and-certifications")?.closest("section") ||
    getSectionByViewName("profile-card-certifications") ||
    getSectionByViewName("profile-card-licenses-and-certifications") ||
    getSectionByHeading(/licenses|certifications/i);

  //  Top card 
  function getFullName() {
    const top = document.querySelector('[data-view-name="profile-top-card-verified-badge"]') || document;
    return (
      clean(top.querySelector("h1")?.textContent) ||
      clean(top.querySelector("h2")?.textContent) ||
      clean(document.querySelector('meta[property="og:title"]')?.content?.split(" - ")[0]) ||
      ""
    );
  }

  // ── Show all detection 
  function hasShowAllIn(section, { dataViewName, ariaLabel, hrefContains } = {}) {
    if (!section) return false;

    if (dataViewName && section.querySelector(`[data-view-name="${dataViewName}"]`)) return true;
    if (ariaLabel && section.querySelector(`a[aria-label="${ariaLabel}"], button[aria-label="${ariaLabel}"]`)) return true;
    if (hrefContains && section.querySelector(`a[href*="${hrefContains}"]`)) return true;

    return q("a,button", section).some((el) => {
      const t = clean(el.textContent || el.innerText);
      const a = clean(el.getAttribute("aria-label"));
      return /^show all\b/i.test(t) || /^show all\b/i.test(a);
    });
  }

  function getShowAllPlan(baseUrl) {
    const plan = {
      certifications: {
        hasShowAll: hasShowAllIn(getCertsSection(), {
          dataViewName: "license-certifications-see-all-button",
          ariaLabel: "Show all licenses",
          hrefContains: "/details/certifications/",
        }),
        url: baseUrl + DETAILS.certifications,
      },
      skills: {
        hasShowAll: hasShowAllIn(getSkillsSection(), {
          ariaLabel: "Show all skills",
          hrefContains: "/details/skills/",
        }),
        url: baseUrl + DETAILS.skills,
      },
      education: {
        hasShowAll: hasShowAllIn(getEducationSection(), {
          dataViewName: "education-see-all-education-button",
          ariaLabel: "Show all educations",
          hrefContains: "/details/education/",
        }),
        url: baseUrl + DETAILS.education,
      },
    };

    const queue = [];
    if (plan.certifications.hasShowAll) queue.push({ key: "certifications", url: plan.certifications.url });
    if (plan.skills.hasShowAll) queue.push({ key: "skills", url: plan.skills.url });
    if (plan.education.hasShowAll) queue.push({ key: "education", url: plan.education.url });

    return { plan, queue };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Scrapers
  // ──────────────────────────────────────────────────────────────────────────

  // Education
  function scrapeEducationFromRoot(root) {
    const container = root || (document.querySelector("main") || document.body);
    const seen = new Set();

    const isYear = (s) =>
      /\b(19|20)\d{2}\b/.test(s) &&
      (/\bPresent\b/i.test(s) ||
        /[–—-]/.test(s) ||
        /\bto\b/i.test(s) ||
        /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(s));

    // Try school link selectors first
    let results = q('a[href*="/school/"]', container)
      .map((a) => q("p", a).map((p) => clean(p.textContent)).filter(Boolean))
      .filter((ps) => ps.length >= 1)
      .map((ps) => {
        const school = ps[0] || "";
        const year = ps.find(isYear) || null;
        const yearIndex = year ? ps.indexOf(year) : ps.length;
        const degree = ps.slice(1, yearIndex).find((t) => !isYear(t)) || "";
        return { school, degree, year };
      })
      .filter((e) => {
        const key = `${e.school}||${e.degree}||${e.year || ""}`.toLowerCase();
        if (!e.school || seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    console.log("[ResumeSync] Education found with school links:", results.length);

    // If no results, scan for education entries by looking for year patterns
    if (!results.length) {
      console.log("[ResumeSync] Using generic education scanner");
      q("div, li", container)
        .forEach((el) => {
          const text = el.textContent;
          // Look for education-like entries (has school name and year)
          if (/\b(19|20)\d{2}\b/.test(text) && text.length > 10 && text.length < 500) {
            const ps = q("p, span", el).map((p) => clean(p.textContent)).filter(Boolean);
            if (ps.length >= 1) {
              const school = ps[0] || "";
              const year = ps.find(isYear) || null;
              const yearIndex = year ? ps.indexOf(year) : ps.length;
              const degree = ps.slice(1, yearIndex).filter(t => !isYear(t))[0] || "";
              
              const key = `${school}||${degree}||${year || ""}`.toLowerCase();
              if (school && !seen.has(key)) {
                seen.add(key);
                results.push({ school, degree, year });
              }
            }
          }
        });
      console.log("[ResumeSync] Education found with generic scanner:", results.length);
    }

    return results;
  }

  function getEducationHome() {
    const sec = getEducationSection();
    console.log("[ResumeSync] Education section found:", !!sec);
    const result = sec ? scrapeEducationFromRoot(sec) : [];
    console.log("[ResumeSync] Education items found:", result);
    return result;
  }

  function scrapeEducationDetails() {
    return scrapeEducationFromRoot(document.querySelector("main") || document.body);
  }

  // Certifications 
  function scrapeCertificationsByButtons(root) {
    const container = root || (document.querySelector("main") || document.body);
    const buttons = Array.from(container.querySelectorAll(CERT_BTN_SEL));
    if (!buttons.length) return [];

    const certs = buttons
      .map((btn) => {
        let card = btn;
        for (let i = 0; i < 12 && card; i++) {
          card = card.parentElement;
          if (!card) break;

          const text = clean(card.innerText);
          if (/Issued\s+[A-Za-z]{3,9}\s+\d{4}/i.test(text)) break;
          if (/Credential ID\b/i.test(text) || /No expiration date\b/i.test(text) || /Expires\b/i.test(text)) break;
        }
        if (!card) return null;

        const lines = Array.from(card.querySelectorAll("p"))
          .map((p) => clean(p.textContent))
          .filter(Boolean)
          .filter((t) => !/^Show credential$/i.test(t));

        if (!lines.length) return null;

        const name = lines[0] || "";
        if (!name) return null;

        const issuer =
          lines[1] ||
          lines.find((t, idx) => idx > 0 && !/^(Issued|Expires|Credential ID|No expiration date)\b/i.test(t)) ||
          "";

        const issuedLine = lines.find((t) => /^Issued\s+/i.test(t)) || "";
        const expiresLine = lines.find((t) => /^Expires\s+/i.test(t)) || "";
        const credIdLine = lines.find((t) => /^Credential ID\s+/i.test(t)) || "";
        const noExpLine = lines.find((t) => /^No expiration date\b/i.test(t)) || "";

        const issued = issuedLine ? issuedLine : (noExpLine ? "No expiration date" : "");
        const expires = expiresLine || "";
        const credentialId = credIdLine ? credIdLine.replace(/^Credential ID\s+/i, "").trim() : "";

        const link =
          Array.from(card.querySelectorAll('a[href^="http"]'))
            .map((a) => a.href)
            .find((h) => h && h.length > 12) || "";

        return { name, issuer, issued, expires, credentialId, link };
      })
      .filter(Boolean);

    return dedupe(certs, (c) => `${c.name}||${c.issuer}||${c.issued}||${c.credentialId}`);
  }

  function getCertificationsHome() {
    const sec = getCertsSection();
    return sec ? scrapeCertificationsByButtons(sec) : [];
  }

  function scrapeCertificationsDetails() {
    return scrapeCertificationsByButtons(document.querySelector("main") || document.body);
  }

  // Skills
  async function scrapeSkills() {
    const seen = new Set();

    // Scroll to load skills
    for (let i = 0; i < 8; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await sleep(120);
    }

    // Try to find skills section by various selectors
    let skillsSection = getSkillsSection();
    if (!skillsSection) {
      const main = document.querySelector("main") || document.body;
      const allSections = main.querySelectorAll("section, [role='region']");
      for (let s of allSections) {
        const heading = s.querySelector("h2, h3, h4");
        if (heading && /^skills$/i.test(heading.textContent)) {
          skillsSection = s;
          console.log("[ResumeSync] Found skills section by text match");
          break;
        }
      }
    }

    let skills = [];

    // Try componentkey selector
    if (skillsSection) {
      skills = q('[componentkey*="com.linkedin.sdui.profile.skill("]', skillsSection)
        .map((card) => {
          const top = card.querySelector("p") || card.querySelector("span");
          return top ? clean(top.textContent) : "";
        })
        .filter(Boolean);

      console.log("[ResumeSync] Skills found with componentkey:", skills.length);
    }

    // Fallback: Look for skill elements in the section 
    if (!skills.length && skillsSection) {
      console.log("[ResumeSync] Using skills section text extraction");
      skills = q("button, a, span, div", skillsSection)
        .map((el) => {
          const text = clean(el.textContent);
          // Filter: skills are short text without action words
          if (text && text.length > 1 && text.length < 50 && 
              !/endorse|remove|edit|add|show|more|button|skill/i.test(text)) {
            return text;
          }
          return "";
        })
        .filter(Boolean)
        .filter((skill, idx, arr) => arr.indexOf(skill) === idx); // unique only

      console.log("[ResumeSync] Skills found with text extraction:", skills.length);
    }

    // Last resort: scan entire page for skill-like text
    if (!skills.length) {
      console.log("[ResumeSync] Using full page skill scan");
      const main = document.querySelector("main") || document.body;
      // Look for any elements in a skills-related section
      const allElements = main.querySelectorAll("button, a, span");
      skills = Array.from(allElements)
        .map((el) => {
          const text = clean(el.textContent);
          // Very generic: just get short text
          if (text && text.length > 2 && text.length < 40 && !/button|show|more|endorse/i.test(text)) {
            return text;
          }
          return "";
        })
        .filter(Boolean)
        .filter((skill, idx, arr) => arr.indexOf(skill) === idx)
        .slice(0, 50); // limit to prevent noise

      console.log("[ResumeSync] Skills found with full page scan:", skills.length);
    }

    // Deduplicate by lowercasing
    const result = [];
    for (const skill of skills) {
      const k = skill.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        result.push({ skill });
      }
    }

    console.log("[ResumeSync] Final skills count:", result.length);
    return result;
  }

  // Projects and Experience 
  const isDateRange = (s) =>
    /\b(19|20)\d{2}\b/.test(clean(s)) &&
    (/\bPresent\b/i.test(s) || /[–—-]/.test(s) || /\bto\b/i.test(s) || /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(s));

  const pickDuration = (texts) => clean((texts || []).find(isDateRange) || "").split("·")[0].trim();

  function scrapeProjects() {
    const sec = getSectionByViewName("profile-card-projects");
    if (!sec) return [];

    const items = q('span[data-testid="expandable-text-box"]', sec)
      .map((descEl) => {
        let root = descEl;
        for (let i = 0; i < 14 && root; i++) {
          root = root.parentElement;
          if (!root || !sec.contains(root)) break;

          const ps = q("p", root).map((p) => clean(p.textContent)).filter(Boolean);
          if (ps.length >= 2 && ps.some(isDateRange)) break;
        }

        root ||= descEl.closest("div") || descEl.parentElement;

        const ps = q("p", root).map((p) => clean(p.textContent)).filter(Boolean);
        const title = ps[0] || "";
        const duration = pickDuration(ps) || null;
        const location = ps.find((t) => /^Associated with/i.test(t)) || null;
        const description = clean((descEl.textContent || "").replace(/\s*…\s*more\b/gi, "").replace(/\s*…\s*$/g, ""));

        const link =
          q('a[href^="http"]', root)
            .map((a) => a.href)
            .find((h) => h && !h.includes("linkedin.com") && h.length > 12) || null;

        if (!title) return null;
        if (/Programming Language\)?$/i.test(title)) return null;
        if (/\band \+\d+ skills\b/i.test(title)) return null;

        return { title, duration, location, description, link };
      })
      .filter(Boolean);

    return dedupe(items, (p) => `${p.title}||${p.duration}||${p.description}`);
  }

  function scrapeExperience() {
    // First try the specific section selector
    let sec = getSectionByViewName("profile-card-experience");
    if (!sec) {
      // Fallback: find by heading
      sec = getSectionByHeading(/^experience$/i) || getSectionByHeading(/experience/i);
    }
    console.log("[ResumeSync] Experience section found:", !!sec);
    
    if (!sec) {
      // Last resort: scan entire document for experience-like sections
      const main = document.querySelector("main") || document.body;
      const allSections = main.querySelectorAll("section, [role='region']");
      for (let s of allSections) {
        const heading = s.querySelector("h2, h3, h4");
        if (heading && /experience|work|employment|job/i.test(heading.textContent)) {
          sec = s;
          console.log("[ResumeSync] Found experience section by text scan");
          break;
        }
      }
    }
    
    if (!sec) {
      console.log("[ResumeSync] No experience section found");
      return [];
    }

    const allP = (root) => q("p", root).map((p) => clean(p.textContent)).filter(Boolean);
    const desc = (root) =>
      clean((root.querySelector('span[data-testid="expandable-text-box"]')?.textContent || "")
        .replace(/\s*…\s*more\b/gi, "")
        .replace(/\s*…\s*$/g, ""));

    const companyFromLogo = (root) =>
      clean(root.querySelector('figure[aria-label$="logo"]')?.getAttribute("aria-label")?.replace(/\s*logo$/i, "") || "");

    const companyFromDot = (texts) => clean((texts.find((t) => /·/.test(t)) || "").split("·")[0]);

    const parseSingle = (entity) => {
      const pAll = allP(entity);
      const anchor = q('a[href*="/company/"], a[href*="/school/"]', entity)
        .find((a) => a.querySelectorAll("p").length >= 2);

      const ps = anchor ? allP(anchor) : pAll;

      const title = ps[0] || "";
      const duration = pickDuration(ps) || pickDuration(pAll) || null;
      const where = companyFromLogo(entity) || companyFromDot(ps) || companyFromDot(pAll) || "";
      const description = desc(entity);

      return where || title || duration || description ? { where, duration, title, description } : null;
    };

    // Try component key first
    let items = q('div[componentkey^="entity-collection-item-"]', sec)
      .flatMap((entity) => [parseSingle(entity)])
      .filter(Boolean);

    console.log("[ResumeSync] Experience items found with componentkey selector:", items.length);

    // If that didn't work, look for divs that contain job info
    if (!items.length) {
      console.log("[ResumeSync] Trying generic experience item selector");
      items = q('div, li', sec)
        .filter(el => {
          const text = el.textContent;
          // Look for elements that likely contain experience info
          return /\d{4}|present|current|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(text);
        })
        .map(parseSingle)
        .filter(Boolean);
      
      console.log("[ResumeSync] Experience items found with generic selector:", items.length);
    }

    return dedupe(items, (r) => `${r.where}||${r.title}||${r.duration}||${r.description}`);
  }

  // ── Home snapshot ──────────────────────────────────────────────────────────
  async function scrapeHomeSnapshot(skip = {}) {
    return {
      fullName: getFullName(),
      summary: scrapeSummary(),
      projects: scrapeProjects(),
      experience: scrapeExperience(),
      certifications: skip.certifications ? [] : getCertificationsHome(),
      skills: skip.skills ? [] : await scrapeSkills(),
      education: skip.education ? [] : getEducationHome(),
    };
  }

  // ── Flow controller ────────────────────────────────────────────────────────
  async function handleFlowOnLoad() {
    if (sessionStorage.getItem(FLOW_KEY) !== FLOW_NAME) return;

    const baseUrl = getProfileBaseUrlSafe();
    if (!baseUrl) {
      [FLOW_KEY, STEP_KEY, QUEUE_KEY, HOME_KEY, CERTS_KEY, SKILLS_KEY, EDU_KEY].forEach((k) => sessionStorage.removeItem(k));
      return;
    }

    const queue = safeJsonParse(sessionStorage.getItem(QUEUE_KEY) || "[]", []);
    const step = sessionStorage.getItem(STEP_KEY) || "";

    if (step === "certifications" && isCertsPage()) {
      await waitFor(() => document.querySelectorAll(CERT_BTN_SEL).length > 0, { label: "cert buttons", timeout: 20000 });

      for (let i = 0; i < 4; i++) { window.scrollTo(0, document.body.scrollHeight); await sleep(400); }
      window.scrollTo(0, 0);
      await sleep(250);

      const certs = scrapeCertificationsDetails();
      sessionStorage.setItem(CERTS_KEY, JSON.stringify(certs));

      const idx = queue.findIndex((x) => x.key === "certifications");
      const next = queue[idx + 1];
      sessionStorage.setItem(STEP_KEY, next ? next.key : STEP_FINALIZE);
      location.assign(next ? next.url : baseUrl);
      return;
    }

    if (step === "skills" && isSkillsPage()) {
      const skills = await scrapeSkills();
      sessionStorage.setItem(SKILLS_KEY, JSON.stringify(skills));

      const idx = queue.findIndex((x) => x.key === "skills");
      const next = queue[idx + 1];
      sessionStorage.setItem(STEP_KEY, next ? next.key : STEP_FINALIZE);
      location.assign(next ? next.url : baseUrl);
      return;
    }

    if (step === "education" && isEducationPage()) {
      await waitFor(() => document.querySelectorAll('a[href*="/school/"] p').length >= 2, { label: "education anchors" });

      for (let i = 0; i < 4; i++) { window.scrollTo(0, document.body.scrollHeight); await sleep(400); }
      window.scrollTo(0, 0);
      await sleep(250);

      const education = scrapeEducationDetails();
      sessionStorage.setItem(EDU_KEY, JSON.stringify(education));

      const idx = queue.findIndex((x) => x.key === "education");
      const next = queue[idx + 1];
      sessionStorage.setItem(STEP_KEY, next ? next.key : STEP_FINALIZE);
      location.assign(next ? next.url : baseUrl);
      return;
    }

    if (step === STEP_FINALIZE && isHomePage()) {
      const home = safeJsonParse(sessionStorage.getItem(HOME_KEY) || "null", null);
      const certs = safeJsonParse(sessionStorage.getItem(CERTS_KEY) || "[]", []);
      const skills = safeJsonParse(sessionStorage.getItem(SKILLS_KEY) || "[]", []);
      const education = safeJsonParse(sessionStorage.getItem(EDU_KEY) || "[]", []);

      const finalResult = {
        site: "linkedin",
        baseUrl,
        profile: {
          fullName: home?.fullName || "",
          projects: home?.projects || [],
          experience: home?.experience || [],
        },
        education: education.length ? education : (home?.education || []),
        certs: certs.length ? certs : (home?.certifications || []),
        skills: (skills.length ? skills : (home?.skills || []))
          .map((s) => (typeof s === "string" ? s : s.skill))
          .filter(Boolean),
      };

      await chrome.storage.local.set({ rs_lastResult: finalResult });
      console.log("[ResumeSync] Deep scan final result stored to rs_lastResult:", finalResult);

      [FLOW_KEY, STEP_KEY, QUEUE_KEY, HOME_KEY, CERTS_KEY, SKILLS_KEY, EDU_KEY].forEach((k) => sessionStorage.removeItem(k));
      return;
    }

    // Recovery redirects (if user navigates away mid-flow)
    if (queue.length) {
      const hit = queue.find((x) => x.key === step);
      if (step === "certifications" && hit && !isCertsPage()) location.assign(hit.url);
      if (step === "skills" && hit && !isSkillsPage()) location.assign(hit.url);
      if (step === "education" && hit && !isEducationPage()) location.assign(hit.url);
      if (step === STEP_FINALIZE && !isHomePage()) location.assign(baseUrl);
    }
  }

  handleFlowOnLoad();

  // ── Popup command  ───────────────────────────────────────────────
  // ── Normalize experience format ────────────────────────────────────────────
  function normalizeExperience(expArray) {
    return (expArray || []).map(exp => ({
      title: exp.title || "",
      company: exp.where || exp.company || "",  // LinkedIn uses 'where', Handshake uses 'company'
      duration: exp.duration || "",
      description: exp.description || ""
    }));
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Quick extraction for Compare button
    if (request.action === "extractProfile") {
      (async () => {
        try {
          const homeSnapshot = await scrapeHomeSnapshot();
          
          const profileData = {
            name: homeSnapshot.fullName || "",
            title: "", // LinkedIn profile doesn't have headline on home
            summary: homeSnapshot.summary || "",
            experience: normalizeExperience(homeSnapshot.experience),
            education: homeSnapshot.education || [],
            skills: (homeSnapshot.skills || []).map((s) => (typeof s === "string" ? s : s.skill)).filter(Boolean),
          };
          
          console.log("[ResumeSync] LinkedIn extracted:", profileData);
          sendResponse({ success: true, profileData });
        } catch (error) {
          console.error("[ResumeSync] LinkedIn extraction error:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; 
    }

    // Deep scan flow
    if (request.cmd !== "START_CERTS_SKILLS_FLOW") return;

    (async () => {
      const baseUrl = getProfileBaseUrlSafe();
      if (!baseUrl) {
        sendResponse({ success: false, error: "Not on a LinkedIn profile page." });
        return;
      }

      const { plan, queue } = getShowAllPlan(baseUrl);

      // If "Show all" exists, do scraping that section to /details/*
      const skip = {
        certifications: plan.certifications.hasShowAll,
        skills: plan.skills.hasShowAll,
        education: plan.education.hasShowAll,
      };

      const homeSnapshot = await scrapeHomeSnapshot(skip);

      sessionStorage.setItem(HOME_KEY, JSON.stringify(homeSnapshot));
      sessionStorage.setItem(QUEUE_KEY, JSON.stringify(queue));

      if (!queue.length) {
        const finalResult = {
          site: "linkedin",
          baseUrl,
          profile: {
            fullName: homeSnapshot.fullName || "",
            projects: homeSnapshot.projects || [],
            experience: homeSnapshot.experience || [],
          },
          education: homeSnapshot.education || [],
          certs: homeSnapshot.certifications || [],
          skills: (homeSnapshot.skills || []).map((s) => (typeof s === "string" ? s : s.skill)).filter(Boolean),
        };

        await chrome.storage.local.set({ rs_lastResult: finalResult });

        sendResponse({ success: true, redirected: false });
        return;
      }

      // Start navigation flow
      sessionStorage.setItem(FLOW_KEY, FLOW_NAME);
      sessionStorage.setItem(STEP_KEY, queue[0].key);

      location.assign(queue[0].url);
      sendResponse({ success: true, redirected: true });
    })().catch((err) => {
      sendResponse({ success: false, error: err?.message || String(err) });
    });

    return true; 
  });

   if (window.location.href.includes("linkedin.com/in/")) {
    console.log("ResumeSync: LinkedIn scraper ready");
  }
})();
