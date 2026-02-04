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

    // Get the roast intensity
    const intensity = req.body?.intensity || 'medium';
    
    const intensityPrompts = {
      mild: 'Be constructively critical but gentle. Point out issues with kindness.',
      medium: 'Be direct and sarcastic. Don\'t sugarcoat problems but keep it professional.',
      brutal: 'Channel Gordon Ramsay reviewing a resume. Be savage, funny, and brutally honest. Roast hard but make it helpful.'
    };

    // Call Azure OpenAI for the roast
    const completion = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT,
      max_tokens: 2000,
      messages: [{
        role: 'system',
        content: 'You are the Resume Roaster - an AI that gives brutally honest resume feedback with a comedic edge.'
      }, {
        role: 'user',
        content: `Intensity: ${intensityPrompts[intensity] || intensityPrompts.medium}

Analyze this resume and provide:

1. **🔥 THE ROAST** (2-3 paragraphs of entertaining critique)
2. **💀 FATAL FLAWS** (Top 3-5 critical issues that will get this resume rejected)
3. **🎯 ATS SCORE** (Estimate 0-100 for getting past Applicant Tracking Systems, with reasons)
4. **💡 QUICK FIXES** (5 specific, actionable improvements they can make TODAY)
5. **✨ SILVER LININGS** (1-2 things they actually did well, if any)

Be specific. Reference actual content from their resume. No generic advice.

RESUME TEXT:
---
${resumeText.substring(0, 8000)}
---`
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
