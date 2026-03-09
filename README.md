# ResumeSync

ResumeSync is a Chrome extension that helps you keep one structured resume and compare it with profile data from LinkedIn or Handshake.

All current behavior is local-first:
- Resume data is saved in `chrome.storage.local`.
- Semantic comparison runs on-device using a bundled MiniLM model.
- No backend service is required for the core popup workflow.

## Team
- [Abhigna Nimmagadda](https://github.com/4bh1gn4)
- [Isha Rajpure](https://github.com/irajpure)
- [Kevin Garcia](https://github.com/manchanegra2004)
- [Michael Gilbert](https://github.com/mjgilbert20)
- [Soha Khan](https://github.com/skhan-cloud)

## Current Project Status (March 2026)

Implemented now:
- Resume editor in popup (name, email, summary, education, experience, skills)
- Resume version history with restore/delete (capped at 20 versions)
- JSON import and JSON export for resume data
- Formatted resume preview tab for copy/paste workflows
- Profile extraction from LinkedIn (`scrapers/linkedin-scraper.js`)
- Profile extraction from Handshake (`scrapers/handshake-scraper.js`)
- Compare tab that runs semantic similarity scoring locally via `contextualize/js/semantic.js` and `contextualize/js/semantic-ui.js`
- Bundled local model files in `contextualize/model/`
- Right-click context menu entry on supported sites (`ResumeSync: Compare with Resume`)

Not implemented in the current codebase:
- Automatic profile syncing/pushing updates to LinkedIn or Handshake
- Cloud backend, database, or user authentication
- Full PDF/TXT import flow in popup UI (a PDF extractor utility exists, but JSON import is the active flow)

## Features

### 1. Resume Management
- Save and load a structured resume in popup UI
- Add/remove education and experience cards
- Capture optional version notes on each save

### 2. Version History
- Keeps a rolling history of up to 20 saved versions
- Restore previous versions directly from the Versions tab
- Delete individual versions

### 3. Import and Export
- Import resume data from `.json`
- Export the current resume as formatted `.json`

### 4. Resume Preview
- Shows a formatted text view of current data for easy copy/paste into applications

### 5. Compare with LinkedIn/Handshake
- Click `Compare Resume` on a LinkedIn/Handshake profile tab
- Extension extracts profile data through content scripts
- Semantic comparison scores are produced locally across Summary/About, Skills, Experience, and Education
- UI displays per-section scores and an overall alignment score

## Privacy and Data Handling
- Resume and scan artifacts are stored in browser local extension storage (`chrome.storage.local`).
- AI model assets are bundled with the extension and loaded locally.
- No runtime API calls are required for semantic scoring.

Primary storage keys include:
- `currentResume`
- `resumeVersions`
- `rs_siteRaw`
- `rs_lastResult`
- `rs_quickResult`

## Tech Stack
- Chrome Extension Manifest V3
- Vanilla HTML/CSS/JavaScript
- Local on-device NLP using Transformers.js + ONNX runtime WASM
- Playwright for extension UI/integration testing

## Repository Structure
```
background.js                 # Service worker and message routing
manifest.json                 # Extension manifest and permissions
popup/                        # Popup UI (tabs, forms, compare results)
scrapers/                     # LinkedIn and Handshake content scripts
contextualize/                # Local semantic model + runtime assets
parse/pdf-extract.js          # Utility PDF text extractor
tests/                        # Playwright extension tests
playwright.config.js          # Playwright configuration
```

## Setup

### Prerequisites
- Chrome or Edge (Chromium-based)

### Load Extension in Browser
1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the project root (`ResumeSync`).

## Usage
1. Open the extension popup.
2. In `Resume`, enter/edit your resume data and click `Save Resume`.
3. Optional: import/export JSON from the same tab.
4. Open a LinkedIn or Handshake profile in the active tab.
5. Go to `Compare` and click `Compare Resume`.
6. Review section-by-section semantic similarity results.

## Internal/Advanced Flow Notes
- `background.js` contains a native messaging bridge (`com.resumesync.parser`) with JS fallback comparison logic for compatibility.
- `scrapers/linkedin-scraper.js` includes a deeper multi-page LinkedIn flow (`START_CERTS_SKILLS_FLOW`) that can store enriched results in `rs_lastResult`.
- The default popup compare button currently uses the direct `extractProfile` + local semantic scoring path.

## License
This project is licensed under the MIT License. See `LICENSE`.
## AI Usage
Our team utilized AI to aid the development process.