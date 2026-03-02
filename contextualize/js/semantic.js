// semantic.js — On-device semantic similarity using all-MiniLM-L6-v2 (int8)
//
// All assets are bundled locally inside the extension (contextualize/ folder).
// Nothing is fetched at runtime — no network calls, no downloads, no CDN.

let _pipeline = null;

// ── Load model ────────────────────────────────────────────────────────────────
export async function loadModel(onProgress) {
  if (_pipeline) return _pipeline;

  onProgress?.(0, "Loading model…");

  const vendorBase = chrome.runtime.getURL("contextualize");
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
  env.backends.onnx.wasm.wasmPaths = vendorBase + "/";

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

  const pairs = [
    { key: "summary",    label: "Summary / About",  rText: res.summary,    pText: profile.summary    },
    { key: "skills",     label: "Skills",            rText: res.skills,     pText: profile.skills     },
    { key: "experience", label: "Experience",        rText: res.experience, pText: profile.experience },
    { key: "education",  label: "Education",         rText: res.education,  pText: profile.education  },
  ];

  const results = [];
  for (const pair of pairs) {
    if (!pair.rText.trim() || !pair.pText.trim()) {
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
