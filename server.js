require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { AzureOpenAI } = require('openai');
const path = require('path');

const mammoth = require('mammoth');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword', // .doc
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'text/plain',
      'text/rtf',
      'application/rtf'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Supported: PDF, DOC, DOCX, TXT, RTF'));
    }
  }
});

const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: process.env.AZURE_OPENAI_API_VERSION,
  deployment: process.env.AZURE_OPENAI_DEPLOYMENT
});

app.use(express.static('public'));
app.use(express.json());

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the app page
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'app.html'));
});

// Parse resume based on file type
async function parseResume(file) {
  const mimeType = file.mimetype;
  const buffer = file.buffer;
  
  try {
    // PDF
    if (mimeType === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      return pdfData.text;
    }
    
    // DOCX
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    
    // DOC (legacy Word format)
    if (mimeType === 'application/msword') {
      // For .doc files, try mammoth first
      try {
        const result = await mammoth.extractRawText({ buffer });
        if (result.value && result.value.trim().length > 0) {
          return result.value;
        }
      } catch (e) {
        // Fall back to textract if mammoth fails
      }
      
      // Convert buffer to text (simple extraction)
      return buffer.toString('utf8');
    }
    
    // TXT
    if (mimeType === 'text/plain') {
      return buffer.toString('utf8');
    }
    
    // RTF
    if (mimeType === 'text/rtf' || mimeType === 'application/rtf') {
      // Basic RTF parsing (strip RTF codes)
      const text = buffer.toString('utf8');
      return text.replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '').trim();
    }
    
    throw new Error('Unsupported file type');
  } catch (error) {
    throw new Error(`Could not parse ${file.originalname}. ${error.message}`);
  }
}

// Roast endpoint
app.post('/api/roast', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse resume based on file type
    let resumeText;
    try {
      resumeText = await parseResume(req.file);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ 
        error: 'Resume appears to be empty or too short. Make sure your file contains readable text (not scanned images).' 
      });
    }

    // Get the roast intensity and job description
    const intensity = req.body?.intensity || 'medium';
    const jobDescription = req.body?.jobDescription || null;
    
    const intensityPrompts = {
      mild: 'Be constructively critical but gentle. Point out issues with kindness.',
      medium: 'Be direct and honest. Don\'t sugarcoat problems but keep it professional and helpful.',
      brutal: 'Channel Gordon Ramsay reviewing a resume. Be savage, funny, and brutally honest. Roast hard but make it helpful.'
    };

    // Build the analysis prompt based on whether job description is provided
    let userPrompt;
    
    if (jobDescription && jobDescription.trim().length > 50) {
      // DEEP ANALYSIS MODE: Resume + Job Description Matching
      userPrompt = `You are an expert resume consultant and ATS specialist. Perform a DEEP COMPARATIVE ANALYSIS between this resume and job description.

TONE: ${intensityPrompts[intensity] || intensityPrompts.medium}

RESUME:
---
${resumeText.substring(0, 6000)}
---

JOB DESCRIPTION:
---
${jobDescription.substring(0, 4000)}
---

Provide a comprehensive analysis with these sections:

## 🎯 JOB MATCH SCORE
Give an overall match percentage (0-100%) with brief justification.

## 🔍 KEYWORD ANALYSIS
- **Keywords in Resume**: List key skills/terms found in resume
- **Required Keywords Missing**: Critical keywords from job description NOT in resume
- **ATS Optimization**: Specific keywords to add for ATS compatibility

## 💼 REQUIREMENTS BREAKDOWN
Analyze each requirement from the job description:
- ✅ Requirements you clearly meet (with evidence from resume)
- ⚠️ Requirements you partially meet (explain gaps)
- ❌ Requirements you're missing (identify gaps)

## 🎓 EXPERIENCE & SKILLS GAP
- What experience/skills does the job require that your resume lacks?
- What experience/skills do you have but aren't highlighting well?
- Recommendations for reframing your experience to match

## 🔥 RESUME IMPROVEMENTS FOR THIS JOB
Provide 7-10 SPECIFIC, ACTIONABLE fixes tailored to this job:
1. Exact sentences to add/change with before → after examples
2. Skills to emphasize more prominently
3. Achievements to quantify differently
4. Keywords to naturally integrate
5. Sections to reorder or restructure

## 📊 ATS COMPATIBILITY
- Current ATS score for THIS job: X/100
- Key issues blocking ATS systems
- Format improvements needed
- Keyword density recommendations

## 💡 STRATEGIC RECOMMENDATIONS
- How to position yourself for this specific role
- Company culture insights (based on job description language)
- What to emphasize in your cover letter
- Red flags you need to address

## ✨ YOUR STRONGEST SELLING POINTS
What from your resume actually STANDS OUT for this role?

Be extremely specific. Use actual quotes from both documents. Provide ready-to-use rewrites.`;

    } else {
      // STANDARD ROAST MODE: Resume Only
      userPrompt = `You are the Resume Roaster - an expert resume consultant who gives honest, actionable feedback.

TONE: ${intensityPrompts[intensity] || intensityPrompts.medium}

Analyze this resume and provide:

## 🔥 OVERALL ASSESSMENT
2-3 paragraphs of honest critique. What works? What doesn't? First impressions matter.

## 💀 FATAL FLAWS
Top 5 critical issues that will get this resume rejected:
- Be specific about what's wrong
- Explain WHY it's a problem
- Reference actual content from the resume

## 🎯 ATS SCORE
Estimate 0-100 for getting past Applicant Tracking Systems:
- Score: X/100
- Key issues affecting ATS compatibility
- What's blocking automated screening

## 🔍 SECTION-BY-SECTION BREAKDOWN
Analyze each resume section:
- **Summary/Objective**: What's working/failing
- **Experience**: Quality of descriptions, quantification, impact
- **Skills**: Are they relevant? Properly showcased?
- **Education**: Positioned correctly?
- **Formatting**: Professional? ATS-friendly?

## 💡 IMMEDIATE FIXES
7-10 specific, actionable improvements they can make TODAY:
- Provide before → after examples where possible
- Prioritize by impact
- Be ready-to-implement specific

## 📊 WHAT'S MISSING
- Key elements every strong resume needs
- Industry-standard sections they're lacking
- Information that would strengthen their case

## ✨ WHAT WORKS
1-3 things they actually did well (if any). Give credit where due.

Be specific. Reference actual content. No generic advice. Provide examples.

RESUME TEXT:
---
${resumeText.substring(0, 8000)}
---`;
    }

    // Call Azure OpenAI for the analysis
    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      max_tokens: 3000, // Increased for deeper analysis
      temperature: 0.7,
      messages: [{
        role: 'system',
        content: 'You are an expert resume consultant, ATS specialist, and career advisor with 15 years of experience helping candidates land their dream jobs. You provide specific, actionable feedback backed by industry knowledge.'
      }, {
        role: 'user',
        content: userPrompt
      }]
    });

    const roast = completion.choices[0].message.content;
    
    res.json({ 
      success: true, 
      roast,
      wordCount: resumeText.split(/\s+/).length,
      intensity
    });

  } catch (error) {
    console.error('Roast error:', error);
    res.status(500).json({ error: 'Failed to roast resume. Our AI is taking a smoke break.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Resume Roaster running on port ${PORT}`);
});
