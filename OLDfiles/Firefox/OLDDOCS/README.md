# Resume Sync & Version Manager Browser Extension

A powerful browser extension that helps you manage your resume, track changes over time, and compare your resume with your professional profiles on LinkedIn and Handshake.

## 🌟 Features

### 1. **Local Resume Storage**
- Store your complete resume data securely on your local device
- No cloud storage required - complete privacy
- Easy-to-use form interface for entering resume information
- Support for:
  - Personal information (name, email, phone, title)
  - Professional summary
  - Work experience (with JSON format support)
  - Education history
  - Skills (comma-separated list)

### 2. **Version Control**
- Automatic versioning when you save your resume
- Track up to 20 versions of your resume
- Each version includes:
  - Timestamp of when it was saved
  - Optional notes describing the changes
  - Complete snapshot of your resume data
- Restore any previous version with one click
- Delete unwanted versions
- Version comparison to see what changed

### 3. **Profile Comparison**
- Scan your LinkedIn profile
- Scan your Handshake profile
- Automatically compare with your stored resume
- Identify differences including:
  - Missing information (in profile but not in resume)
  - Extra information (in resume but not in profile)
  - Mismatched information
  - Matching information
- Color-coded results for easy visualization:
  - 🟢 Green: Matching
  - 🟡 Yellow: Missing in resume
  - 🔵 Blue: Extra in resume
  - 🔴 Red: Different values

## 📦 Installation

### For Chrome/Edge/Brave

1. **Download the Extension**
   - Download or clone this repository to your computer

2. **Open Extensions Page**
   - Open Chrome and navigate to `chrome://extensions`
   - Or Edge: `edge://extensions`
   - Or Brave: `brave://extensions`

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Navigate to the `resume-extension` folder
   - Click "Select Folder"

5. **Verify Installation**
   - You should see the Resume Manager extension icon in your browser toolbar
   - The icon shows a document with a checkmark

### For Firefox

1. **Download the Extension**
   - Download or clone this repository

2. **Open Add-ons Page**
   - Navigate to `about:debugging#/runtime/this-firefox`

3. **Load Temporary Add-on**
   - Click "Load Temporary Add-on"
   - Navigate to the `resume-extension` folder
   - Select the `manifest.json` file

Note: Firefox requires temporary loading during development. For permanent installation, the extension would need to be signed by Mozilla.

## 🚀 Usage

### Managing Your Resume

1. **Click the extension icon** in your browser toolbar
2. Navigate to the **Resume** tab
3. Fill in your information:
   - Basic info: Name, email, phone, title
   - Summary: Your professional summary
   - Experience: Use JSON format like:
     ```json
     [
       {
         "company": "Tech Corp",
         "title": "Senior Developer",
         "duration": "2020-2023",
         "description": "Led development of web applications"
       }
     ]
     ```
   - Education: Use JSON format like:
     ```json
     [
       {
         "school": "University Name",
         "degree": "BS Computer Science",
         "year": "2020"
       }
     ]
     ```
   - Skills: Comma-separated like: `JavaScript, Python, React, Node.js`
4. Add optional version notes (e.g., "Updated work experience")
5. Click **Save Resume**

### Viewing Version History

1. Click the extension icon
2. Navigate to the **Versions** tab
3. See all saved versions with:
   - Date and time of save
   - Version notes
   - Quick summary
4. Actions available:
   - **Restore**: Load this version as your current resume
   - **Delete**: Remove this version from history

### Comparing with LinkedIn

1. Navigate to your LinkedIn profile page (linkedin.com/in/your-profile)
2. Click the extension icon
3. Go to the **Compare** tab
4. Click **Scan Current Profile**
5. Review the comparison results showing:
   - What's in your profile but missing from your resume
   - What's in your resume but not in your profile
   - What matches between both
   - What's different

### Comparing with Handshake

1. Navigate to your Handshake profile page
2. Click the extension icon
3. Go to the **Compare** tab
4. Click **Scan Current Profile**
5. Review the detailed comparison

## 🎨 UI Overview

### Resume Tab
- Clean form interface for entering all resume data
- JSON editors for structured data (experience, education)
- Save and load buttons
- Status messages for feedback

### Versions Tab
- Chronological list of all saved versions
- Each version card shows:
  - Save date and time
  - Version notes
  - Quick summary
  - Action buttons

### Compare Tab
- Instructions for use
- Scan button
- Color-coded comparison results
- Organized by resume sections:
  - Name
  - Title
  - Summary
  - Experience
  - Education
  - Skills

## 🔒 Privacy & Security

- **100% Local Storage**: All data is stored locally in your browser using Chrome's storage API
- **No Cloud Sync**: Your resume data never leaves your device
- **No Analytics**: We don't track any usage data
- **No External Requests**: The extension only reads from LinkedIn and Handshake when you explicitly click "Scan Profile"
- **Open Source**: All code is visible and auditable

## 📝 Data Format

### Resume Data Structure
```json
{
  "fullName": "John Doe",
  "email": "john@example.com",
  "phone": "+1 234-567-8900",
  "title": "Software Engineer",
  "summary": "Experienced developer...",
  "experience": [
    {
      "company": "Company Name",
      "title": "Job Title",
      "duration": "2020-2023",
      "description": "Job description"
    }
  ],
  "education": [
    {
      "school": "University Name",
      "degree": "BS Computer Science",
      "year": "2020"
    }
  ],
  "skills": ["JavaScript", "Python", "React"],
  "lastUpdated": "2024-01-01T00:00:00.000Z"
}
```

## 🛠️ Technical Details

### File Structure
```
resume-extension/
├── manifest.json           # Extension configuration
├── popup.html             # Main UI
├── css/
│   └── popup.css         # Styling
├── js/
│   ├── popup.js          # Main extension logic
│   ├── background.js     # Background service worker
│   ├── linkedin-scraper.js   # LinkedIn profile extraction
│   └── handshake-scraper.js  # Handshake profile extraction
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

### Technologies Used
- **Manifest V3**: Latest Chrome extension standard
- **Chrome Storage API**: For local data persistence
- **Content Scripts**: For extracting profile data from LinkedIn and Handshake
- **Service Worker**: Background processing
- **Vanilla JavaScript**: No dependencies, lightweight and fast

### Permissions Required
- `storage`: To save resume data locally
- `activeTab`: To read current tab URL
- `scripting`: To inject content scripts
- Host permissions for LinkedIn and Handshake

## 🐛 Troubleshooting

### Extension doesn't appear
- Make sure Developer Mode is enabled
- Try reloading the extension
- Check the browser console for errors

### Scan Profile doesn't work
- Make sure you're on your actual profile page (not someone else's)
- LinkedIn: Should be at `linkedin.com/in/your-profile`
- Handshake: Should be on your profile/settings page
- Try refreshing the page and trying again

### Data not saving
- Check that you filled in at least Name and Email
- For JSON fields (experience, education), make sure the JSON is valid
- Check browser console for error messages

### Comparison shows unexpected results
- LinkedIn and Handshake frequently update their HTML structure
- Some data might not be extracted correctly
- Check your profile to ensure the information is publicly visible

## 🔄 Future Enhancements

Potential features for future versions:
- Export resume to PDF/DOCX
- Import from LinkedIn/Handshake directly
- Side-by-side version comparison
- Resume templates
- AI-powered suggestions for improvement
- Support for more platforms (Indeed, Glassdoor, etc.)
- Bulk edit capabilities
- Search within versions
- Tags and categories for versions

## 📄 License

MIT License - feel free to use, modify, and distribute as needed.

## 🤝 Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest features
- Submit pull requests
- Improve documentation

## 💡 Tips for Best Results

1. **Keep resume updated**: Save a new version whenever you update your resume
2. **Use descriptive version notes**: Makes it easier to track what changed
3. **Regular comparisons**: Check LinkedIn/Handshake monthly to ensure consistency
4. **Valid JSON**: When entering experience/education, use valid JSON format
5. **Backup data**: Periodically export your versions (future feature)

## ⚠️ Known Limitations

- LinkedIn and Handshake may change their HTML structure, affecting scraping
- Some profile sections might not be extracted if they use dynamic loading
- Maximum 20 versions stored (older versions are automatically deleted)
- JSON fields require manual formatting

## 📞 Support

For issues, questions, or feature requests, please open an issue on the GitHub repository.

---

**Made with ❤️ for job seekers and career developers**
