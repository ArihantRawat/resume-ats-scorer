import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

if (!("DOMMatrix" in globalThis)) {
  Object.assign(globalThis, {
    DOMMatrix: class DOMMatrix {},
    ImageData: class ImageData {},
    Path2D: class Path2D {},
  });
}

Object.assign(globalThis, {
  __PDFJS_WORKER_SRC__: pathToFileURL(
    `${process.cwd()}\\node_modules\\pdfjs-dist\\legacy\\build\\pdf.worker.mjs`,
  ).toString(),
});

const { analyzeResume } = await import("../src/lib/analyzer");
const { parsePdfResume } = await import("../src/lib/pdf");

const filePath = process.argv[2];

if (!filePath) {
  throw new Error("Usage: tsx scripts/sanity-check.ts <resume.pdf>");
}

const bytes = await readFile(filePath);
const fileName = filePath.split(/[\\/]/).at(-1) ?? "resume.pdf";
const file = new File([bytes], fileName, { type: "application/pdf" });
const parsed = await parsePdfResume(file);
const analysis = analyzeResume(parsed, "");

const metricLines = parsed.lines.filter((line) =>
  /(\d+[%+]?|\$[\d,.]+|million|billion|hours?|days?|weeks?|months?|users?|customers?|revenue|latency|cost|growth|accuracy|uptime|x\b)/i.test(
    line,
  ),
);

console.log(
  JSON.stringify(
    {
      fileName: parsed.fileName,
      pages: parsed.pageCount,
      extractedLines: parsed.lines.length,
      wordCount: analysis.stats.wordCount,
      extractionQuality: analysis.stats.extractionQuality,
      bulletCount: analysis.stats.bulletCount,
      quantifiedBulletCount: analysis.stats.quantifiedBulletCount,
      actionVerbCount: analysis.stats.actionVerbCount,
      dateMentions: analysis.stats.dateMentions,
      roleHeadingCount: analysis.stats.roleHeadingCount,
      multiColumnRisk: Number(parsed.layout.multiColumnRisk.toFixed(3)),
      topIssues: analysis.issues
        .filter((issue) => issue.severity !== "success")
        .slice(0, 6)
        .map((issue) => issue.title),
      sections: analysis.sections.map((section) => ({
        label: section.label,
        found: section.found,
      })),
      firstLines: parsed.lines.slice(0, 12),
      metricLines: metricLines.slice(0, 12),
    },
    null,
    2,
  ),
);
