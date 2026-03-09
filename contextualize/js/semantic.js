// semantic.js — On-device semantic similarity using all-MiniLM-L6-v2 (int8)
//
// All assets are bundled locally inside the extension (contextualize/ folder).
// Nothing is fetched at runtime — no network calls, no downloads, no CDN.
// Run `node setup.js` once from the extension root to populate contextualize/.

let _pipeline = null;

// ── Load model ────────────────────────────────────────────────────────────────
export async function loadModel(onProgress) {
  if (_pipeline) return _pipeline;

  onProgress?.(0, "Loading model…");

  const contextualizeBase = chrome.runtime.getURL("contextualize");
  const modelBase  = chrome.runtime.getURL("contextualize/model");

  // Import the bundled (local) Transformers.js
  const { pipeline, env } = await import(
    chrome.runtime.getURL("contextualize/transformers.min.js")
  );

  // Disable all remote fetching — use only bundled files
  env.allowRemoteModels = false;
  env.allowLocalModels  = true;
  env.useBrowserCache   = false;
  env.localModelPath    = modelBase + "/";

  // Point ONNX runtime at our bundled WASM binaries
  env.backends.onnx.wasm.wasmPaths = contextualizeBase + "/";

  _pipeline = await pipeline(
    "feature-extraction",
    ".",   // resolved against localModelPath
    {
      quantized: true,
      progress_callback: (info) => {
        if (info.status === "progress") {
          const pct = Math.round((info.loaded / info.total) * 100);
          onProgress?.(pct, `Loading model… ${pct}%`);
        } else if (info.status === "done") {
          onProgress?.(100, "Model ready");
        }
      }
    }
  );

  return _pipeline;
}

// ── Embed ─────────────────────────────────────────────────────────────────────
function truncate(text, maxWords = 160) {
  return (text || "").replace(/\s+/g, " ").trim().split(" ").slice(0, maxWords).join(" ");
}

async function embed(extractor, text) {
  const out = await extractor(truncate(text), { pooling: "mean", normalize: true });
  return out.data;
}

// ── Cosine similarity ─────────────────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Math.max(-1, Math.min(1, dot));
}

// ── Flatten helpers ───────────────────────────────────────────────────────────
function flattenExperience(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(e => [e.title, e.company, e.duration, e.description].filter(Boolean).join(" ")).join(" | ");
}
function flattenEducation(arr) {
  if (!Array.isArray(arr) || !arr.length) return "";
  return arr.map(e => [e.school, e.degree, e.year].filter(Boolean).join(" ")).join(" | ");
}
function flattenSkills(val) {
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "string") return val;
  return "";
}

// ── Smart compare ─────────────────────────────────────────────────────────────
export async function smartCompare(resume, profileData, onProgress) {
  const extractor = await loadModel(onProgress);
  onProgress?.(100, "Running comparison…");

  const isDeep = Boolean(profileData.site);

  const profile = {
    summary:    isDeep ? (profileData.profile?.about?.text      || "") : (profileData.summary   || ""),
    experience: isDeep ? (profileData.profile?.experience?.text || "") : flattenExperience(profileData.experience),
    education:  isDeep ? (profileData.profile?.education?.text  || "") : flattenEducation(profileData.education),
    skills:     flattenSkills(profileData.skills || []),
  };
  const res = {
    summary:    resume.summary    || "",
    experience: flattenExperience(resume.experience),
    education:  flattenEducation(resume.education),
    skills:     flattenSkills(resume.skills || []),
  };

  // Debug logging
  console.log("=== SEMANTIC COMPARISON DEBUG ===");
  console.log("Raw profile data:", profileData);
  console.log("Raw resume data:", resume);
  console.log("Flattened profile (experience array before flatten):", profileData.experience);
  console.log("Flattened profile (education array before flatten):", profileData.education);
  console.log("Flattened profile (skills array before flatten):", profileData.skills);
  console.log("Flattened resume (experience array before flatten):", resume.experience);
  console.log("Flattened resume (education array before flatten):", resume.education);
  console.log("Flattened resume (skills array before flatten):", resume.skills);
  console.log("Profile (after flattening):", profile);
  console.log("Resume (after flattening):", res);
  console.log("================================\n");

  const pairs = [
    { key: "summary",    label: "Summary / About",  rText: res.summary,    pText: profile.summary    },
    { key: "skills",     label: "Skills",            rText: res.skills,     pText: profile.skills     },
    { key: "experience", label: "Experience",        rText: res.experience, pText: profile.experience },
    { key: "education",  label: "Education",         rText: res.education,  pText: profile.education  },
  ];

  const results = [];
  for (const pair of pairs) {
    const rEmpty = !pair.rText.trim();
    const pEmpty = !pair.pText.trim();
    console.log(`Comparing ${pair.key}: resume="${pair.rText.substring(0, 50)}${pair.rText.length > 50 ? '...' : ''}" profile="${pair.pText.substring(0, 50)}${pair.pText.length > 50 ? '...' : ''}" (resume empty: ${rEmpty}, profile empty: ${pEmpty})`);
    
    if (rEmpty || pEmpty) {
      results.push({ ...pair, score: null, reason: "Missing on one or both sides" });
      continue;
    }
    const [eA, eB] = await Promise.all([embed(extractor, pair.rText), embed(extractor, pair.pText)]);
    results.push({ ...pair, score: cosineSim(eA, eB) });
  }

  const scored  = results.filter(r => r.score !== null);
  const overall = scored.length ? scored.reduce((s, r) => s + r.score, 0) / scored.length : null;

  return { results, overall };
}

// ── Score label ───────────────────────────────────────────────────────────────
export function scoreLabel(score) {
  if (score === null) return { label: "N/A",            tier: "na"       };
  if (score >= 0.75)  return { label: "Strong match",   tier: "strong"   };
  if (score >= 0.60)  return { label: "Good match",     tier: "good"     };
  if (score >= 0.40)  return { label: "Moderate match", tier: "moderate" };
                      return { label: "Low alignment",  tier: "low"      };
}
