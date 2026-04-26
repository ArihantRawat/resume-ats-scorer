export type Severity = "critical" | "warning" | "info" | "success";

export type CategoryKey =
  | "ats"
  | "searchability"
  | "impact"
  | "presentation"
  | "competencies";

export type CategoryScore = {
  key: CategoryKey;
  label: string;
  score: number;
  weight: number;
  summary: string;
};

export type Issue = {
  id: string;
  severity: Severity;
  category: CategoryKey;
  title: string;
  detail: string;
  fix: string;
  evidence?: string;
  points: number;
};

export type SectionStatus = {
  key: string;
  label: string;
  found: boolean;
  aliases: string[];
};

export type KeywordReport = {
  matchedHardSkills: string[];
  missingHardSkills: string[];
  matchedSoftSkills: string[];
  missingSoftSkills: string[];
  matchedRoleTerms: string[];
  missingRoleTerms: string[];
  matchedEducationTerms: string[];
  missingEducationTerms: string[];
  resumeOnlySkills: string[];
  coverage: number;
};

export type PdfLayoutSignal = {
  pageCount: number;
  textItemCount: number;
  sparsePages: number;
  multiColumnRisk: number;
  averageLineLength: number;
};

export type ParsedResume = {
  fileName: string;
  text: string;
  lines: string[];
  pageCount: number;
  layout: PdfLayoutSignal;
};

export type ResumeAnalysis = {
  overallScore: number;
  rating: string;
  categories: CategoryScore[];
  issues: Issue[];
  quickWins: Issue[];
  keywordReport: KeywordReport;
  sections: SectionStatus[];
  stats: {
    wordCount: number;
    bulletCount: number;
    quantifiedBulletCount: number;
    strongBulletCount: number;
    weakBulletCount: number;
    actionVerbCount: number;
    contactItems: number;
    pageCount: number;
    dateMentions: number;
    roleHeadingCount: number;
    extractionQuality: number;
  };
  parsedText: string;
};
