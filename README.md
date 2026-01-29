# Resume Roaster 🔥

Get brutally honest feedback on your resume. Because your friends are too nice to tell you it sucks.

## Features

- **Three Roast Intensities:** Mild, Medium, or Brutal (Gordon Ramsay mode)
- **Comprehensive Analysis:** Fatal flaws, ATS score, quick fixes, and silver linings
- **PDF Support:** Upload any text-based PDF resume
- **Privacy-First:** Resumes are processed in memory, never stored

## Quick Start

```bash
# Install dependencies
npm install

# Set your Anthropic API key
export ANTHROPIC_API_KEY=your_key_here

# Run the server
npm start
```

Visit `http://localhost:3000`

## Deploy to Render

1. Push to GitHub
2. Connect to Render
3. Add `ANTHROPIC_API_KEY` environment variable
4. Deploy!

## Tech Stack

- Express.js
- pdf-parse for PDF extraction
- Anthropic Claude for AI analysis
- Vanilla JS frontend (no build step)

## License

MIT

---

Built with 🔥 by Luna Labs
