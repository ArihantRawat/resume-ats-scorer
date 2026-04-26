import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParsedResume, PdfLayoutSignal } from "../types";

const workerSrcOverride = (globalThis as { __PDFJS_WORKER_SRC__?: string }).__PDFJS_WORKER_SRC__;

pdfjsLib.GlobalWorkerOptions.workerSrc =
  workerSrcOverride ??
  new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

type TextItemLike = {
  str: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
};

type PositionedLine = {
  page: number;
  y: number;
  text: string;
  minX: number;
  maxX: number;
  maxGap: number;
  segmentCount: number;
};

export async function parsePdfResume(file: File): Promise<ParsedResume> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const lines: string[] = [];
  const positionedLines: PositionedLine[] = [];
  let textItemCount = 0;
  let sparsePages = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const items = (textContent.items as unknown[]).filter(isTextItem);
    const viewport = page.getViewport({ scale: 1 });
    textItemCount += items.length;

    if (items.length < 8) {
      sparsePages += 1;
    }

    const pageLines = buildPageLines(items, pageNumber, viewport.width);

    positionedLines.push(...pageLines);
    lines.push(...pageLines.map((line) => line.text));
  }

  const text = lines.join("\n").replace(/\u0000/g, "").trim();
  const layout = buildLayoutSignals(pdf.numPages, textItemCount, sparsePages, positionedLines);

  return {
    fileName: file.name,
    text,
    lines,
    pageCount: pdf.numPages,
    layout,
  };
}

function isTextItem(item: unknown): item is TextItemLike {
  return Boolean(item && typeof item === "object" && "str" in item);
}

function buildLayoutSignals(
  pageCount: number,
  textItemCount: number,
  sparsePages: number,
  lines: PositionedLine[],
): PdfLayoutSignal {
  const averageLineLength =
    lines.length === 0
      ? 0
      : lines.reduce((total, line) => total + line.text.length, 0) / lines.length;

  const splitLineCount = lines.filter((line) => {
    const veryWide = line.maxX - line.minX > 520 && line.text.length > 95;
    const fragmented = line.maxGap > 120 && line.segmentCount > 2;
    return fragmented || veryWide;
  }).length;

  return {
    pageCount,
    textItemCount,
    sparsePages,
    multiColumnRisk: lines.length === 0 ? 0 : splitLineCount / lines.length,
    averageLineLength,
  };
}

function buildPageLines(items: TextItemLike[], pageNumber: number, pageWidth: number) {
  const sortedItems = [...items].sort((first, second) => {
    const yDifference = (second.transform?.[5] ?? 0) - (first.transform?.[5] ?? 0);
    if (Math.abs(yDifference) > 2) {
      return yDifference;
    }
    return (first.transform?.[4] ?? 0) - (second.transform?.[4] ?? 0);
  });

  const lines: PositionedLine[] = [];
  let currentItems: TextItemLike[] = [];
  let currentY: number | null = null;
  let previousRightEdge: number | null = null;

  const flushLine = () => {
    if (currentItems.length === 0 || currentY === null) {
      currentItems = [];
      currentY = null;
      previousRightEdge = null;
      return;
    }

    const line = finalizeLine(currentItems, currentY, pageNumber, pageWidth);
    if (line.text.length > 0) {
      lines.push(line);
    }
    currentItems = [];
    currentY = null;
    previousRightEdge = null;
  };

  for (const item of sortedItems) {
    const y = item.transform?.[5] ?? 0;
    const x = item.transform?.[4] ?? 0;

    const startsNewLine =
      currentY === null ||
      Math.abs(y - currentY) > 2 ||
      (previousRightEdge !== null && x + 2 < previousRightEdge && Math.abs(y - currentY) <= 2);

    if (startsNewLine) {
      flushLine();
      currentY = y;
    }

    currentItems.push(item);
    previousRightEdge = x + (item.width ?? 0);

    if (item.hasEOL) {
      flushLine();
    }
  }

  flushLine();
  return lines;
}

function finalizeLine(
  items: TextItemLike[],
  y: number,
  pageNumber: number,
  pageWidth: number,
): PositionedLine {
  const sorted = [...items].sort(
    (first, second) => (first.transform?.[4] ?? 0) - (second.transform?.[4] ?? 0),
  );

  const xs = sorted.map((item) => item.transform?.[4] ?? 0);
  const widths = sorted.map((item) => item.width ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs.map((x, index) => x + widths[index]));
  const wideGapThreshold = Math.max(24, pageWidth * 0.08);

  let maxGap = 0;
  let segmentCount = 1;
  let text = "";

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    const value = item.str.replace(/\s+/g, " ").trim();
    if (!value) {
      continue;
    }

    if (text.length === 0) {
      text = value;
      continue;
    }

    const previousItem = sorted[index - 1];
    const previousRight = (previousItem.transform?.[4] ?? 0) + (previousItem.width ?? 0);
    const currentLeft = item.transform?.[4] ?? 0;
    const gap = currentLeft - previousRight;
    maxGap = Math.max(maxGap, gap);

    if (gap > wideGapThreshold) {
      segmentCount += 1;
      text += " | ";
    } else {
      text += " ";
    }

    text += value;
  }

  return {
    page: pageNumber,
    y: Math.round(y),
    text: text.replace(/\s+/g, " ").trim(),
    minX,
    maxX,
    maxGap,
    segmentCount,
  };
}
