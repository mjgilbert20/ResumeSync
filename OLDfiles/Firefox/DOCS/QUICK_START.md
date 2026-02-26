# Quick Start Guide

## Installation (2 minutes)

1. **Download**: Save the `resume-extension` folder to your computer

2. **Open Chrome**: Go to `chrome://extensions`

3. **Enable Developer Mode**: Toggle the switch in the top right

4. **Load Extension**: 
   - Click "Load unpacked"
   - Select the `resume-extension` folder
   - Click "Select Folder"

5. **Done!** Look for the 📄 icon in your toolbar

## First Time Setup (5 minutes)

You have two options:

### Option 1: Import from Existing PDF Resume (Fastest!) 🆕

1. Click the extension icon (📄) in your toolbar
2. In the **Import Resume** section at the top:
   - Click "Choose File" and select your PDF resume
   - Click "📄 Parse PDF & Auto-Fill"
   - Wait a moment while it extracts your information
3. Review the auto-filled data
4. Make any corrections if needed
5. Add a version note: "Imported from PDF"
6. Click "💾 Save Resume"
7. Done! 🎉

### Option 2: Manual Entry

### Step 1: Enter Your Resume Data

1. Click the extension icon (📄) in your toolbar
2. You'll see the Resume tab (already selected)
3. Fill in your information:
   - **Name**: Your full name
   - **Email**: Your email address
   - **Phone**: Your phone number
   - **Title**: Your current job title
   - **Summary**: A brief professional summary

### Step 2: Add Experience (JSON Format)

Copy this template and modify it with your own experience:

```json
[
  {
    "company": "Your Company Name",
    "title": "Your Job Title",
    "duration": "2020-2023",
    "description": "What you did at this job"
  },
  {
    "company": "Previous Company",
    "title": "Previous Title",
    "duration": "2018-2020",
    "description": "What you did here"
  }
]
```

Paste it in the "Experience" field.

### Step 3: Add Education (JSON Format)

Copy this template and modify it:

```json
[
  {
    "school": "Your University",
    "degree": "Your Degree (e.g., BS Computer Science)",
    "year": "2020"
  }
]
```

Paste it in the "Education" field.

### Step 4: Add Skills

Simply list your skills separated by commas:
```
JavaScript, Python, React, Node.js, AWS, Docker, Git
```

### Step 5: Save Your Resume

1. Add a version note (optional): e.g., "Initial resume creation"
2. Click "💾 Save Resume"
3. You should see "✓ Resume saved successfully!"

## Using the Extension

### View Version History

1. Click the extension icon
2. Go to **Versions** tab
3. See all your saved versions
4. Click "Restore" to load an old version
5. Click "Delete" to remove a version

### Compare with LinkedIn

1. Go to your LinkedIn profile: `linkedin.com/in/your-profile`
2. Click the extension icon
3. Go to **Compare** tab
4. Click "🔍 Scan Current Profile"
5. Review the differences!

### Compare with Handshake

1. Go to your Handshake profile
2. Click the extension icon
3. Go to **Compare** tab
4. Click "🔍 Scan Current Profile"
5. Review the differences!

## Understanding Comparison Results

- 🟢 **Green (Match)**: Information is the same in both places ✓
- 🟡 **Yellow (Missing)**: In your profile but NOT in your resume - consider adding!
- 🔵 **Blue (Extra)**: In your resume but NOT in your profile - consider updating profile!
- 🔴 **Red (Different)**: Information differs between resume and profile - which is correct?

## Tips for Success

### ✅ DO:
- Save a new version whenever you make significant changes
- Add descriptive version notes
- Compare regularly (monthly recommended)
- Keep your resume and profiles in sync
- Use valid JSON for experience and education

### ❌ DON'T:
- Forget to save after making changes
- Delete all your versions (keep at least one backup)
- Ignore the comparison results
- Use invalid JSON syntax

## Common Issues & Solutions

### "No saved resume found"
- You haven't saved a resume yet
- Click "💾 Save Resume" first

### "Failed to extract profile data"
- Make sure you're on YOUR profile page (not someone else's)
- Refresh the page and try again
- Check that you're logged in

### JSON Format Error
- Make sure you have matching brackets: `[ ]` and `{ }`
- Use double quotes for strings: `"text"`
- Separate items with commas
- See `example-resume.json` for reference

### Comparison shows nothing
- Make sure you saved your resume first
- Make sure you're on a profile page (LinkedIn/Handshake)
- Try refreshing the profile page

## Example Workflow

**Monthly Resume Maintenance:**

1. **Week 1**: Update your resume with any new accomplishments
2. **Week 2**: Save the updated version with notes
3. **Week 3**: Scan LinkedIn profile and update it based on comparison
4. **Week 4**: Scan Handshake profile and update it based on comparison

**Before Job Applications:**

1. Load your latest resume version
2. Scan the job description
3. Update skills and experience to match the job
4. Save as new version: "Tailored for [Company Name]"
5. Compare with LinkedIn to ensure consistency

## Need Help?

- Check the full README.md for detailed documentation
- See example-resume.json for data format examples
- Report issues on GitHub
- Remember: All your data is stored locally and private!

---

**You're ready to go! Start by clicking that 📄 icon in your toolbar.**
