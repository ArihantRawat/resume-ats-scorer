import type {
  CategoryScore,
  Issue,
  KeywordReport,
  ParsedResume,
  ResumeAnalysis,
  SectionStatus,
} from "../types";
import {
  ACTION_VERBS,
  EDUCATION_TERMS,
  HARD_SKILLS,
  SOFT_SKILLS,
  STANDARD_SECTIONS,
  WEAK_PHRASES,
} from "./keywords";

const CATEGORY_WEIGHTS = {
  ats: 0.24,
  searchability: 0.24,
  impact: 0.22,
  presentation: 0.16,
  competencies: 0.14,
};

export function analyzeResume(parsed: ParsedResume, jobDescription: string): ResumeAnalysis {
  const normalized = normalize(parsed.text);
  const lines = parsed.lines.map((line) => line.trim()).filter(Boolean);
  const wordCount = wordCountOf(parsed.text);
  const sections = detectSections(lines, normalized);
  const bullets = getImpactLines(lines, sections);
  const keywordReport = buildKeywordReport(parsed.text, jobDescription);
  const contact = detectContact(normalized);
  const dateMentions = countDateMentions(parsed.text);
  const roleHeadingCount = countRoleHeadings(lines);
  const extractionQuality = estimateExtractionQuality(parsed);
  const quantifiedBulletCount = bullets.filter(hasMetric).length;
  const actionVerbCount = bullets.filter(hasActionVerb).length;
  const weakBullets = bullets.filter((bullet) => containsAny(normalize(bullet), WEAK_PHRASES));
  const strongBulletCount = bullets.filter((bullet) => hasMetric(bullet) && hasActionVerb(bullet)).length;
  const resumeCompetencySignals = detectCompetencySignals(normalized);

  const issues: Issue[] = [
    ...scoreAts(parsed, normalized, sections, contact, dateMentions, roleHeadingCount, extractionQuality),
    ...scoreSearchability(keywordReport, jobDescription),
    ...scoreImpact(bullets, weakBullets, quantifiedBulletCount, actionVerbCount),
    ...scorePresentation(parsed, wordCount, bullets, sections),
    ...scoreCompetencies(resumeCompetencySignals, normalized),
  ];

  const categories = buildCategoryScores(issues, keywordReport, sections, bullets, parsed, resumeCompetencySignals);
  const overallScore = Math.round(
    categories.reduce((total, category) => total + category.score * category.weight, 0),
  );

  const sortedIssues = issues.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2, success: 3 };
    return severityOrder[a.severity] - severityOrder[b.severity] || b.points - a.points;
  });

  return {
    overallScore,
    rating: getRating(overallScore),
    categories,
    issues: sortedIssues,
    quickWins: sortedIssues
      .filter((issue) => issue.severity !== "success")
      .sort((a, b) => b.points - a.points)
      .slice(0, 5),
    keywordReport,
    sections,
    stats: {
      wordCount,
      bulletCount: bullets.length,
      quantifiedBulletCount,
      strongBulletCount,
      weakBulletCount: weakBullets.length,
      actionVerbCount,
      contactItems: [contact.email, contact.phone, contact.linkedin, contact.portfolio].filter(Boolean).length,
      pageCount: parsed.pageCount,
      dateMentions,
      roleHeadingCount,
      extractionQuality,
    },
    parsedText: parsed.text,
  };
}

export function analyzeTextResume(text: string, jobDescription: string): ResumeAnalysis {
  return analyzeResume(
    {
      fileName: "sample-resume.txt",
      text,
      lines: text.split(/\r?\n/),
      pageCount: estimatePages(text),
      layout: {
        pageCount: estimatePages(text),
        textItemCount: Math.max(1, text.split(/\s+/).length),
        sparsePages: 0,
        multiColumnRisk: 0,
        averageLineLength: 72,
      },
    },
    jobDescription,
  );
}

function scoreAts(
  parsed: ParsedResume,
  normalized: string,
  sections: SectionStatus[],
  contact: ReturnType<typeof detectContact>,
  dateMentions: number,
  roleHeadingCount: number,
  extractionQuality: number,
): Issue[] {
  const issues: Issue[] = [];

  if (parsed.text.length < 500 || parsed.layout.sparsePages > 0 || extractionQuality < 55) {
    issues.push({
      id: "pdf-text-extraction",
      severity: "critical",
      category: "ats",
      title: "PDF text extraction looks weak",
      detail: `Extraction quality is ${extractionQuality}/100, which means ATS systems may miss important resume fields.`,
      fix: "Export a text-based PDF from Word or Google Docs. Avoid scanned PDFs, screenshots, and text embedded inside images.",
      points: 18,
    });
  } else {
    issues.push({
      id: "pdf-text-readable",
      severity: "success",
      category: "ats",
      title: "PDF text is readable",
      detail: "The uploaded file produced usable text for ATS parsing.",
      fix: "Keep exporting as a text-based PDF.",
      points: 0,
    });
  }

  if (!contact.email || !contact.phone) {
    issues.push({
      id: "contact-searchability",
      severity: "critical",
      category: "ats",
      title: "Contact details are incomplete or hard to parse",
      detail: "ATS systems need a plain-text email and phone number near the top of the resume.",
      fix: "Put email, phone, LinkedIn, and portfolio links in normal body text on the first page, not only in a header graphic.",
      points: contact.email || contact.phone ? 9 : 16,
    });
  }

  if (contact.email && contact.phone && !contact.isNearTop) {
    issues.push({
      id: "contact-position",
      severity: "warning",
      category: "ats",
      title: "Contact details are not near the top",
      detail: "The parser found contact details, but not in the first part of the resume text.",
      fix: "Place your name, email, phone, LinkedIn, and portfolio in plain text at the top of page one.",
      points: 7,
    });
  }

  const requiredSections = ["summary", "skills", "experience", "education"];
  const missingSections = sections.filter(
    (section) => requiredSections.includes(section.key) && !section.found,
  );

  if (missingSections.length > 0) {
    issues.push({
      id: "standard-headings",
      severity: missingSections.length > 1 ? "critical" : "warning",
      category: "ats",
      title: "Standard resume sections are missing",
      detail: `Missing ATS-friendly section labels: ${missingSections
        .map((section) => section.label)
        .join(", ")}.`,
      fix: "Use direct headings such as Summary, Skills, Experience, Projects, and Education.",
      points: missingSections.length * 6,
    });
  }

  if (parsed.layout.multiColumnRisk > 0.26) {
    issues.push({
      id: "layout-risk",
      severity: "warning",
      category: "ats",
      title: "Layout may be difficult for ATS parsers",
      detail: "The extracted text shows repeated fragmented lines that look more like columns or table cells than simple right-aligned dates.",
      fix: "Use a single-column layout for core content. Simple right-aligned dates are usually fine, but avoid tables, sidebars, and stacked text boxes.",
      points: 10,
    });
  }

  if (dateMentions < 2 && roleHeadingCount > 0) {
    issues.push({
      id: "missing-dates",
      severity: "warning",
      category: "ats",
      title: "Work-history dates are hard to detect",
      detail: `Only ${dateMentions} date signal${dateMentions === 1 ? "" : "s"} were found across the resume.`,
      fix: "Use clear dates beside each role, such as Jun 2023 - Present or 2021 - 2024. Avoid hiding dates in icons or sidebars.",
      points: 9,
    });
  }

  if (roleHeadingCount === 0 && normalized.includes("experience")) {
    issues.push({
      id: "role-heading-structure",
      severity: "info",
      category: "ats",
      title: "Role headings are hard to identify",
      detail: "The resume has an experience section, but job title, company, and date lines are not easy to separate.",
      fix: "Format each role as Job Title | Company | Location | Dates, followed by bullets.",
      points: 6,
    });
  }

  if (/(text box|canva|template)/i.test(normalized)) {
    issues.push({
      id: "template-risk",
      severity: "info",
      category: "ats",
      title: "Template language detected",
      detail: "Some visual templates rely on boxes, icons, or hidden positioning that can break parsing.",
      fix: "Check the parsed text panel and make sure every skill and role appears in normal reading order.",
      points: 4,
    });
  }

  return issues;
}

function scoreSearchability(keywordReport: KeywordReport, jobDescription: string): Issue[] {
  const issues: Issue[] = [];
  const hasJobDescription = normalize(jobDescription).length > 80;

  if (!hasJobDescription) {
    issues.push({
      id: "missing-job-description",
      severity: "warning",
      category: "searchability",
      title: "No target job description added",
      detail: "A strong ATS score needs comparison against a specific role because keyword priorities change by posting.",
      fix: "Paste the exact job description to get missing hard skills, title alignment, and role-specific keyword coverage.",
      points: 14,
    });
    return issues;
  }

  if (keywordReport.coverage < 55) {
    issues.push({
      id: "low-keyword-match",
      severity: "critical",
      category: "searchability",
      title: "Keyword match is below ATS-ready range",
      detail: `Current role keyword coverage is ${keywordReport.coverage}%.`,
      fix: "Add the most important missing hard skills only where you can support them with real experience.",
      evidence: keywordReport.missingHardSkills.slice(0, 8).join(", "),
      points: 20,
    });
  } else if (keywordReport.coverage < 75) {
    issues.push({
      id: "medium-keyword-match",
      severity: "warning",
      category: "searchability",
      title: "Keyword match needs tightening",
      detail: `Current role keyword coverage is ${keywordReport.coverage}%.`,
      fix: "Work the top missing tools, responsibilities, and job-title terms into your summary, skills, and experience bullets.",
      evidence: keywordReport.missingHardSkills.slice(0, 6).join(", "),
      points: 12,
    });
  }

  if (keywordReport.missingHardSkills.length >= 4) {
    issues.push({
      id: "hard-skills-gap",
      severity: "warning",
      category: "searchability",
      title: "Several hard skills from the role are missing",
      detail: "Hard skills usually carry more ATS weight than generic soft skills.",
      fix: "Prioritize missing tools, platforms, methods, and technical nouns from the job description.",
      evidence: keywordReport.missingHardSkills.slice(0, 10).join(", "),
      points: Math.min(16, keywordReport.missingHardSkills.length * 2),
    });
  }

  if (
    keywordReport.matchedHardSkills.length > 0 &&
    keywordReport.resumeOnlySkills.length > keywordReport.matchedHardSkills.length * 2
  ) {
    issues.push({
      id: "keyword-focus",
      severity: "info",
      category: "searchability",
      title: "Skills section may be too broad for this role",
      detail: "The resume lists many skills that are not emphasized in the target job description.",
      fix: "Keep relevant skills visible first, then move lower-priority tools later or remove them for this application.",
      evidence: keywordReport.resumeOnlySkills.slice(0, 8).join(", "),
      points: 5,
    });
  }

  if (keywordReport.missingRoleTerms.length > 0) {
    issues.push({
      id: "role-terms-gap",
      severity: "info",
      category: "searchability",
      title: "Some role terms are not reflected",
      detail: "The resume may be underselling alignment with the job title or core responsibilities.",
      fix: "Mirror exact role wording in your summary or most relevant experience when it is accurate.",
      evidence: keywordReport.missingRoleTerms.slice(0, 8).join(", "),
      points: Math.min(8, keywordReport.missingRoleTerms.length * 2),
    });
  }

  return issues;
}

function scoreImpact(
  bullets: string[],
  weakBullets: string[],
  quantifiedBulletCount: number,
  actionVerbCount: number,
): Issue[] {
  const issues: Issue[] = [];

  if (bullets.length < 5) {
    issues.push({
      id: "few-bullets",
      severity: "warning",
      category: "impact",
      title: "Experience has too few achievement bullets",
      detail: "Recruiters and ATS reports need evidence of scope, tools, and outcomes.",
      fix: "Add 2 to 5 bullets under each recent role, focused on achievement and measurable results.",
      points: 10,
    });
  }

  const quantifiedRatio = bullets.length === 0 ? 0 : quantifiedBulletCount / bullets.length;
  if (quantifiedRatio < 0.35) {
    issues.push({
      id: "low-measurable-impact",
      severity: "critical",
      category: "impact",
      title: "Not enough quantified impact",
      detail: `${quantifiedBulletCount} of ${bullets.length} bullets include numbers, scale, frequency, money, time, or percent impact.`,
      fix: "Rewrite bullets with action + scope + metric. Example: Built SQL dashboards for 1,200 users, reducing weekly reporting time by 8 hours.",
      points: 18,
    });
  }

  const actionRatio = bullets.length === 0 ? 0 : actionVerbCount / bullets.length;
  if (actionRatio < 0.55) {
    issues.push({
      id: "weak-action-verbs",
      severity: "warning",
      category: "impact",
      title: "Bullets need stronger leading verbs",
      detail: "Many bullets do not start with outcome-oriented action verbs.",
      fix: "Start bullets with verbs like Built, Automated, Improved, Reduced, Led, Shipped, Analyzed, or Designed.",
      points: 10,
    });
  }

  if (weakBullets.length > 0) {
    issues.push({
      id: "weak-phrases",
      severity: "warning",
      category: "impact",
      title: "Vague responsibility language found",
      detail: "Phrases like 'responsible for' and 'worked on' usually do not show business impact.",
      fix: "Replace responsibility phrasing with ownership, tools used, and measurable outcomes.",
      evidence: weakBullets.slice(0, 3).join(" | "),
      points: Math.min(12, weakBullets.length * 4),
    });
  }

  return issues;
}

function scorePresentation(
  parsed: ParsedResume,
  wordCount: number,
  bullets: string[],
  sections: SectionStatus[],
): Issue[] {
  const issues: Issue[] = [];

  if (wordCount < 320) {
    issues.push({
      id: "too-short",
      severity: "warning",
      category: "presentation",
      title: "Resume appears too thin",
      detail: `${wordCount} words is usually too light to communicate experience, tools, and achievements.`,
      fix: "Add more role context, project detail, hard skills, and quantified bullets.",
      points: 10,
    });
  } else if (wordCount > 900 && parsed.pageCount <= 1) {
    issues.push({
      id: "too-dense",
      severity: "warning",
      category: "presentation",
      title: "Resume may be too dense for one page",
      detail: `${wordCount} words on ${parsed.pageCount} page can be hard to scan.`,
      fix: "Trim lower-value bullets, remove repeated skills, and keep bullets to one or two lines.",
      points: 8,
    });
  }

  if (parsed.pageCount > 2) {
    issues.push({
      id: "too-many-pages",
      severity: "warning",
      category: "presentation",
      title: "Resume is longer than typical recruiter scan depth",
      detail: `${parsed.pageCount} pages may bury the highest-value evidence.`,
      fix: "Keep most resumes to one page for early career or two pages for experienced candidates.",
      points: 10,
    });
  }

  const longBullets = bullets.filter((bullet) => bullet.split(/\s+/).length > 32);
  if (longBullets.length > 0) {
    issues.push({
      id: "long-bullets",
      severity: "info",
      category: "presentation",
      title: "Some bullets are too long",
      detail: "Long bullets reduce skim speed and make keywords harder to spot.",
      fix: "Split long bullets or tighten them to action, scope, and result.",
      evidence: longBullets.slice(0, 2).join(" | "),
      points: Math.min(8, longBullets.length * 2),
    });
  }

  const foundCore = sections.filter((section) => section.found).length;
  if (foundCore >= 4) {
    issues.push({
      id: "section-structure-good",
      severity: "success",
      category: "presentation",
      title: "Section structure is easy to scan",
      detail: "Core resume sections were detected with standard labels.",
      fix: "Keep section names conventional.",
      points: 0,
    });
  }

  return issues;
}

function scoreCompetencies(resumeCompetencySignals: string[], normalized: string): Issue[] {
  const issues: Issue[] = [];

  if (resumeCompetencySignals.length < 2) {
    issues.push({
      id: "competency-signals",
      severity: "info",
      category: "competencies",
      title: "Competency signals are light",
      detail: "The resume does not show many in-demand collaboration, communication, or leadership signals.",
      fix: "Add truthful examples of cross-functional work, stakeholder communication, mentoring, ownership, or analytical thinking.",
      points: 8,
    });
  }

  if (!/(led|owned|partnered|collaborated|mentored|presented|communicated|stakeholder)/i.test(normalized)) {
    issues.push({
      id: "leadership-context",
      severity: "info",
      category: "competencies",
      title: "Leadership or collaboration context is hard to see",
      detail: "VMock-style competency scoring rewards evidence of how you worked, not only what tools you used.",
      fix: "Mention the teams, users, stakeholders, or decision process behind your strongest work.",
      points: 7,
    });
  }

  return issues;
}

function buildCategoryScores(
  issues: Issue[],
  keywordReport: KeywordReport,
  sections: SectionStatus[],
  bullets: string[],
  parsed: ParsedResume,
  resumeCompetencySignals: string[],
): CategoryScore[] {
  const penalty = (category: keyof typeof CATEGORY_WEIGHTS, base = 100) =>
    clamp(
      base -
        issues
          .filter((issue) => issue.category === category && issue.severity !== "success")
          .reduce((total, issue) => total + issue.points, 0),
      0,
      100,
    );

  const keywordBase = keywordReport.coverage === 0 ? 66 : Math.max(30, keywordReport.coverage);
  const impactBase =
    bullets.length === 0
      ? 45
      : Math.round(
          ((bullets.filter(hasMetric).length / bullets.length) * 45 +
            (bullets.filter(hasActionVerb).length / bullets.length) * 35 +
            20) *
            1,
        );
  const sectionCoverage = sections.filter((section) => section.found).length / sections.length;

  return [
    {
      key: "ats",
      label: "ATS Parseability",
      score: penalty("ats"),
      weight: CATEGORY_WEIGHTS.ats,
      summary:
        parsed.layout.sparsePages > 0
          ? "PDF readability needs work"
          : parsed.layout.multiColumnRisk > 0.26
            ? "Some extracted lines still look fragmented"
            : "PDF text is extractable",
    },
    {
      key: "searchability",
      label: "Searchability",
      score: penalty("searchability", keywordBase),
      weight: CATEGORY_WEIGHTS.searchability,
      summary:
        keywordReport.coverage > 0
          ? `${keywordReport.coverage}% role keyword coverage`
          : "Add a job description for role match",
    },
    {
      key: "impact",
      label: "Impact",
      score: penalty("impact", clamp(impactBase, 25, 100)),
      weight: CATEGORY_WEIGHTS.impact,
      summary: `${bullets.filter(hasMetric).length} quantified bullets detected`,
    },
    {
      key: "presentation",
      label: "Presentation",
      score: penalty("presentation", Math.round(72 + sectionCoverage * 28)),
      weight: CATEGORY_WEIGHTS.presentation,
      summary: `${sections.filter((section) => section.found).length} of ${sections.length} standard sections found`,
    },
    {
      key: "competencies",
      label: "Competencies",
      score: penalty("competencies", Math.min(100, 58 + resumeCompetencySignals.length * 10)),
      weight: CATEGORY_WEIGHTS.competencies,
      summary: `${resumeCompetencySignals.length} competency signals detected`,
    },
  ];
}

function buildKeywordReport(resumeText: string, jobDescription: string): KeywordReport {
  const resume = normalize(resumeText);
  const job = normalize(jobDescription);
  const hasJob = job.length > 80;
  const jobHardSkills = hasJob ? termsPresent(job, HARD_SKILLS) : [];
  const jobSoftSkills = hasJob ? termsPresent(job, SOFT_SKILLS) : [];
  const jobEducationTerms = hasJob ? termsPresent(job, EDUCATION_TERMS) : [];
  const roleTerms = hasJob ? extractRoleTerms(jobDescription) : [];
  const resumeSkills = termsPresent(resume, HARD_SKILLS);

  const matchedHardSkills = jobHardSkills.filter((term) => includesTerm(resume, term));
  const matchedSoftSkills = jobSoftSkills.filter((term) => includesTerm(resume, term));
  const matchedEducationTerms = jobEducationTerms.filter((term) => includesTerm(resume, term));
  const matchedRoleTerms = roleTerms.filter((term) => includesTerm(resume, term));
  const totalTargets =
    jobHardSkills.length * 2 + jobSoftSkills.length + roleTerms.length + jobEducationTerms.length;
  const matchedTargets =
    matchedHardSkills.length * 2 +
    matchedSoftSkills.length +
    matchedRoleTerms.length +
    matchedEducationTerms.length;

  return {
    matchedHardSkills,
    missingHardSkills: jobHardSkills.filter((term) => !matchedHardSkills.includes(term)),
    matchedSoftSkills,
    missingSoftSkills: jobSoftSkills.filter((term) => !matchedSoftSkills.includes(term)),
    matchedRoleTerms,
    missingRoleTerms: roleTerms.filter((term) => !matchedRoleTerms.includes(term)),
    matchedEducationTerms,
    missingEducationTerms: jobEducationTerms.filter((term) => !matchedEducationTerms.includes(term)),
    resumeOnlySkills: resumeSkills.filter((term) => !jobHardSkills.includes(term)),
    coverage: hasJob && totalTargets > 0 ? Math.round((matchedTargets / totalTargets) * 100) : 0,
  };
}

function detectSections(lines: string[], normalized: string): SectionStatus[] {
  return STANDARD_SECTIONS.map((section) => {
    const headingFound = lines.some((line) => {
      const clean = normalize(line).replace(/[:|]/g, "").trim();
      return section.aliases.some((alias) => clean === alias || clean.startsWith(`${alias} `));
    });
    const textFound = section.aliases.some((alias) => includesTerm(normalized, alias));

    return {
      ...section,
      found: headingFound || textFound || (section.key === "summary" && hasProfileIntro(lines)),
    };
  });
}

function detectContact(normalized: string) {
  const firstChunk = normalized.slice(0, 500);
  return {
    email: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(normalized),
    phone: /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(normalized),
    linkedin: /linkedin\.com\/in\//.test(normalized),
    portfolio: /(github\.com|behance\.net|dribbble\.com|portfolio|personal website)/.test(normalized),
    isNearTop:
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(firstChunk) &&
      /(\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/.test(firstChunk),
  };
}

function getImpactLines(lines: string[], sections: SectionStatus[]) {
  const mergedBulletLines = mergeExtractedBulletLines(lines, sections);
  if (mergedBulletLines.length > 0) {
    return mergedBulletLines;
  }

  return getHeuristicImpactLines(lines, sections);
}

function mergeExtractedBulletLines(lines: string[], sections: SectionStatus[]) {
  const bulletLines: string[] = [];
  let currentBullet: string | null = null;

  const flushBullet = () => {
    if (currentBullet && currentBullet.trim().length >= 18) {
      bulletLines.push(currentBullet.replace(/\s+/g, " ").trim());
    }
    currentBullet = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    if (isSectionHeading(trimmedLine, sections) || isLikelyRoleHeading(trimmedLine)) {
      flushBullet();
      continue;
    }

    if (isStandaloneBulletMarker(trimmedLine)) {
      flushBullet();
      currentBullet = "";
      continue;
    }

    if (isExplicitBulletLine(trimmedLine)) {
      flushBullet();
      currentBullet = stripBulletPrefix(trimmedLine);
      continue;
    }

    if (currentBullet !== null) {
      currentBullet = `${currentBullet} ${trimmedLine}`.trim();
    }
  }

  flushBullet();
  return bulletLines;
}

function getHeuristicImpactLines(lines: string[], sections: SectionStatus[]) {
  const hasExperienceSection = sections.some(
    (section) => section.key === "experience" && section.found,
  );

  return lines.filter((line) => {
    const trimmedLine = line.trim();
    const normalizedLine = normalize(trimmedLine);
    if (trimmedLine.length < 18) {
      return false;
    }
    if (isSectionHeading(trimmedLine, sections)) {
      return false;
    }
    if (isLikelyRoleHeading(trimmedLine)) {
      return false;
    }
    if (/^[-*\u2022]|^\d+\./.test(trimmedLine)) {
      return true;
    }
    if (!hasExperienceSection) {
      return false;
    }

    const startsWithAction = hasActionVerb(trimmedLine);
    const hasMetricSignal = hasMetric(trimmedLine);
    const hasStrongVerbLater = ACTION_VERBS.some((verb) =>
      normalizedLine.startsWith(`${verb} `) || normalizedLine.includes(` ${verb} `),
    );

    return (startsWithAction && trimmedLine.split(/\s+/).length >= 6) || (hasMetricSignal && hasStrongVerbLater);
  });
}

function isStandaloneBulletMarker(line: string) {
  return /^[-*\u2022]$/.test(line);
}

function isExplicitBulletLine(line: string) {
  return /^[-*\u2022]\s+\S|^\d+\.\s+\S/.test(line);
}

function stripBulletPrefix(line: string) {
  return line.replace(/^[-*\u2022]\s*/, "").replace(/^\d+\.\s*/, "").trim();
}

function hasMetric(text: string) {
  return /(\d+[%+]?|\$[\d,.]+|million|billion|hours?|days?|weeks?|months?|users?|customers?|revenue|latency|cost|growth|accuracy|uptime|x\b)/i.test(
    text,
  );
}

function hasActionVerb(text: string) {
  const firstWord = normalize(text).replace(/^[-*\u2022\d.\s]+/, "").split(/\s+/)[0];
  return ACTION_VERBS.includes(firstWord);
}

function isSectionHeading(line: string, sections: SectionStatus[]) {
  const normalizedLine = normalize(line).replace(/[:|]/g, "").trim();
  return sections.some((section) =>
    section.aliases.some((alias) => normalizedLine === alias || normalizedLine.startsWith(`${alias} `)),
  );
}

function isLikelyRoleHeading(line: string) {
  const wordCount = line.trim().split(/\s+/).length;
  return wordCount <= 12 && /\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b/i.test(line);
}

function hasProfileIntro(lines: string[]) {
  const experienceIndex = lines.findIndex((line) => /\bexperience\b/i.test(line));
  if (experienceIndex <= 2) {
    return false;
  }

  const introText = lines
    .slice(2, experienceIndex)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return introText.split(/\s+/).length >= 25 && /experience|years?|candidate|developer|manager|analyst|engineer/i.test(introText);
}

function countDateMentions(text: string) {
  const dateMatches =
    text.match(
      /\b((jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(19|20)\d{2}\b|\bpresent\b|\bcurrent\b/gi,
    ) ?? [];
  return dateMatches.length;
}

function countRoleHeadings(lines: string[]) {
  return lines.filter((line) => {
    const normalizedLine = normalize(line);
    const hasSeparator = /(\|| - |,)/.test(line);
    const hasDate = /\b(19|20)\d{2}\b|\bpresent\b|\bcurrent\b/i.test(line);
    const hasRoleWord =
      /\b(engineer|developer|analyst|manager|designer|consultant|intern|specialist|associate|lead|director|coordinator)\b/.test(
        normalizedLine,
      );
    return hasRoleWord && (hasSeparator || hasDate);
  }).length;
}

function detectCompetencySignals(normalized: string) {
  const explicitSignals = termsPresent(normalized, SOFT_SKILLS);
  const contextualSignals = [
    ["stakeholder management", /\bstakeholders?\b/],
    ["cross-functional", /\bcross-functional|cross functionally|product and marketing|product managers?|designers?\b/],
    ["leadership", /\bled\b|\blead\b|\bmanaged\b|\bowned\b/],
    ["communication", /\bpresented\b|\bpresentation\b|\bcommunicated\b|\btranslated insights\b/],
    ["collaboration", /\bpartnered\b|\bcollaborated\b|\bworked with\b/],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(normalized))
    .map(([label]) => label as string);

  return [...new Set([...explicitSignals, ...contextualSignals])];
}

function estimateExtractionQuality(parsed: ParsedResume) {
  const textLengthScore = clamp(
    Math.round((parsed.text.length / Math.max(1400, parsed.pageCount * 900)) * 55),
    0,
    55,
  );
  const itemScore = clamp(
    Math.round((parsed.layout.textItemCount / Math.max(40, parsed.pageCount * 35)) * 20),
    0,
    20,
  );
  const sparsePenalty = parsed.layout.sparsePages * 20;
  const columnPenalty = parsed.layout.multiColumnRisk > 0.12 ? 10 : 0;
  return clamp(textLengthScore + itemScore + 25 - sparsePenalty - columnPenalty, 0, 100);
}

function termsPresent(text: string, terms: string[]) {
  return [...new Set(terms.filter((term) => includesTerm(text, term)))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function extractRoleTerms(jobDescription: string) {
  const lines = jobDescription
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstLineTerms = lines[0]?.match(/[a-zA-Z][a-zA-Z+#./-]*(?:\s+[a-zA-Z][a-zA-Z+#./-]*){0,2}/g) ?? [];
  const recurring = normalize(jobDescription)
    .split(/[^a-z0-9+#./-]+/)
    .filter((word) => word.length > 4)
    .reduce<Record<string, number>>((counts, word) => {
      counts[word] = (counts[word] ?? 0) + 1;
      return counts;
    }, {});

  const recurringTerms = Object.entries(recurring)
    .filter(([, count]) => count >= 2)
    .map(([word]) => word);

  return [...new Set([...firstLineTerms.map(normalize), ...recurringTerms])]
    .filter((term) => !STOP_WORDS.has(term) && term.length > 3)
    .slice(0, 14);
}

function includesTerm(text: string, term: string) {
  const escaped = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, "i").test(text);
}

function containsAny(text: string, terms: string[]) {
  return terms.some((term) => includesTerm(text, term));
}

function normalize(text: string) {
  return text.toLowerCase().replace(/[\u2019]/g, "'").replace(/\s+/g, " ").trim();
}

function wordCountOf(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimatePages(text: string) {
  return Math.max(1, Math.ceil(wordCountOf(text) / 550));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRating(score: number) {
  if (score >= 88) return "ATS-ready";
  if (score >= 75) return "Strong with targeted edits";
  if (score >= 60) return "Needs focused revision";
  return "High-risk for ATS";
}

const STOP_WORDS = new Set([
  "about",
  "across",
  "along",
  "and",
  "build",
  "for",
  "from",
  "hiring",
  "include",
  "into",
  "required",
  "responsibilities",
  "skills",
  "strong",
  "that",
  "the",
  "this",
  "with",
  "work",
  "you",
]);
