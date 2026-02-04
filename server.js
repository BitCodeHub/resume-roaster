require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const anthropic = new Anthropic();

app.use(express.static('public'));
app.use(express.json());

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Roast endpoint
app.post('/api/roast', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Parse PDF
    let resumeText;
    try {
      const pdfData = await pdfParse(req.file.buffer);
      resumeText = pdfData.text;
    } catch (e) {
      return res.status(400).json({ error: 'Could not parse PDF. Make sure it\'s a valid PDF file.' });
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: 'Resume appears to be empty or too short. Is this a scanned image? We need text-based PDFs.' });
    }

    // Get the roast intensity
    const intensity = req.body?.intensity || 'medium';
    
    const intensityPrompts = {
      mild: 'Be constructively critical but gentle. Point out issues with kindness.',
      medium: 'Be direct and sarcastic. Don\'t sugarcoat problems but keep it professional.',
      brutal: 'Channel Gordon Ramsay reviewing a resume. Be savage, funny, and brutally honest. Roast hard but make it helpful.'
    };

    // Call Claude for the roast
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: `You are the Resume Roaster - an AI that gives brutally honest resume feedback with a comedic edge.

Intensity: ${intensityPrompts[intensity] || intensityPrompts.medium}

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

    const roast = message.content[0].text;
    
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
