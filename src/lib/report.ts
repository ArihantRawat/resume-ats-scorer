import { jsPDF } from "jspdf";
import type { ParsedResume, ResumeAnalysis } from "../types";

export function downloadAnalysisReport(parsedResume: ParsedResume, analysis: ResumeAnalysis) {
  const document = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const left = 48;
  const right = pageWidth - 48;
  const maxWidth = right - left;
  let cursorY = 52;

  const addPageIfNeeded = (requiredHeight = 24) => {
    if (cursorY + requiredHeight <= pageHeight - 48) {
      return;
    }

    document.addPage();
    cursorY = 52;
  };

  const writeLine = (
    text: string,
    options: { size?: number; color?: [number, number, number]; bold?: boolean; gapAfter?: number } = {},
  ) => {
    const { size = 11, color = [23, 33, 28], bold = false, gapAfter = 10 } = options;
    document.setFont("helvetica", bold ? "bold" : "normal");
    document.setFontSize(size);
    document.setTextColor(color[0], color[1], color[2]);
    const lines = document.splitTextToSize(text, maxWidth) as string[];
    const lineHeight = size + 4;
    addPageIfNeeded(lines.length * lineHeight + gapAfter);
    document.text(lines, left, cursorY);
    cursorY += lines.length * lineHeight + gapAfter;
  };

  const writeRule = () => {
    addPageIfNeeded(16);
    document.setDrawColor(220, 228, 222);
    document.line(left, cursorY, right, cursorY);
    cursorY += 16;
  };

  const writeSectionTitle = (title: string) => {
    writeLine(title, { size: 15, bold: true, gapAfter: 8 });
  };

  const bullet = (label: string, value: string) => {
    writeLine(`- ${label}: ${value}`, { size: 10, gapAfter: 6 });
  };

  writeLine("Resume ATS Analysis Report", {
    size: 20,
    bold: true,
    color: [15, 93, 67],
    gapAfter: 6,
  });
  writeLine(parsedResume.fileName, { size: 11, color: [103, 115, 109], gapAfter: 4 });
  writeLine(`Overall score: ${analysis.overallScore}/100 (${analysis.rating})`, {
    size: 12,
    bold: true,
    gapAfter: 14,
  });
  writeRule();

  writeSectionTitle("Summary");
  bullet("Pages", String(analysis.stats.pageCount));
  bullet("Word count", String(analysis.stats.wordCount));
  bullet(
    "Quantified bullets",
    `${analysis.stats.quantifiedBulletCount}/${analysis.stats.bulletCount}`,
  );
  bullet("Contact signals", `${analysis.stats.contactItems}/4`);
  bullet("Extraction quality", `${analysis.stats.extractionQuality}/100`);
  bullet("Date mentions", String(analysis.stats.dateMentions));
  writeRule();

  writeSectionTitle("Category scores");
  analysis.categories.forEach((category) => {
    writeLine(`${category.label}: ${category.score}/100`, {
      size: 11,
      bold: true,
      gapAfter: 3,
    });
    writeLine(category.summary, { size: 10, color: [103, 115, 109], gapAfter: 8 });
  });
  writeRule();

  writeSectionTitle("Top fixes");
  if (analysis.quickWins.length === 0) {
    writeLine("No major fixes identified.", { size: 10 });
  } else {
    analysis.quickWins.forEach((issue, index) => {
      writeLine(`${index + 1}. ${issue.title}`, { size: 11, bold: true, gapAfter: 3 });
      writeLine(issue.detail, { size: 10, gapAfter: 4 });
      writeLine(`Fix: ${issue.fix}`, { size: 10, color: [15, 93, 67], gapAfter: 8 });
    });
  }
  writeRule();

  writeSectionTitle("Keyword report");
  bullet(
    "Matched hard skills",
    analysis.keywordReport.matchedHardSkills.slice(0, 12).join(", ") || "None",
  );
  bullet(
    "Missing hard skills",
    analysis.keywordReport.missingHardSkills.slice(0, 12).join(", ") || "None",
  );
  bullet(
    "Matched role terms",
    analysis.keywordReport.matchedRoleTerms.slice(0, 12).join(", ") || "None",
  );
  bullet(
    "Missing role terms",
    analysis.keywordReport.missingRoleTerms.slice(0, 12).join(", ") || "None",
  );
  writeRule();

  writeSectionTitle("Detected issues");
  const issues = analysis.issues.filter((issue) => issue.severity !== "success");
  if (issues.length === 0) {
    writeLine("No critical or warning issues detected.", { size: 10 });
  } else {
    issues.forEach((issue) => {
      writeLine(`${issue.title} (-${issue.points} pts)`, { size: 11, bold: true, gapAfter: 3 });
      writeLine(issue.detail, { size: 10, gapAfter: 4 });
      if (issue.evidence) {
        writeLine(`Evidence: ${issue.evidence}`, { size: 10, color: [47, 111, 159], gapAfter: 4 });
      }
      writeLine(`Fix: ${issue.fix}`, { size: 10, color: [15, 93, 67], gapAfter: 8 });
    });
  }

  const safeName = parsedResume.fileName.replace(/\.pdf$/i, "").replace(/[^a-z0-9-_]+/gi, "-");
  document.save(`${safeName || "resume"}-ats-report.pdf`);
}
