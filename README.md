# Resume ATS Scorer

Local, privacy-first resume ATS scoring and feedback app inspired by tools like VMock.

This app:
- Parses an uploaded resume PDF in the browser (no server required).
- Scores ATS parseability, searchability (job description match), impact, presentation, and competencies.
- Highlights concrete issues and provides prioritized fixes.
- Exports a PDF report of the analysis.

## Features

- PDF upload + ATS text extraction preview
- Weighted score breakdown (0-100) with category meters
- Keyword matching against a pasted job description (missing hard skills / role terms)
- Impact checks (quantified bullets, action verbs, weak phrasing)
- Parseability checks (contact detection, date detection, layout fragmentation signals)
- Downloadable PDF report

## Run locally

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Sanity check (CLI)

Runs the same parser + scorer against a local PDF and prints a JSON summary.

```bash
npm run sanity -- "C:\Users\ariha\Downloads\Arihant New Resume.pdf"
```

## Notes

- The scoring model is transparent rules-based logic. It is not affiliated with VMock and does not reproduce proprietary scoring.
- Keyword matching depends on the exact job description you paste in.
- Some PDFs extract bullets as separate lines (e.g. a standalone "•"). The analyzer merges wrapped bullet content before scoring metrics.

