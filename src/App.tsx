import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  Gauge,
  Lightbulb,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { analyzeResume } from "./lib/analyzer";
import { parsePdfResume } from "./lib/pdf";
import { downloadAnalysisReport } from "./lib/report";
import { SAMPLE_JOB_DESCRIPTION, SAMPLE_RESUME_TEXT } from "./lib/sample";
import type { CategoryScore, Issue, ParsedResume, ResumeAnalysis, Severity } from "./types";

const researchNotes = [
  "ATS checks start with parseability: can the system extract contact info, sections, dates, skills, and work history in reading order?",
  "Role match depends heavily on hard-skill and responsibility keywords from the exact job description.",
  "VMock-style feedback groups resume quality into impact, presentation, and competencies, so the app scores both ATS fit and recruiter readability.",
  "A strong report should show missing keywords in context, weak bullets, formatting risks, and prioritized fixes.",
];

type ResumeSource = "none" | "uploaded" | "sample";
type AnalysisPhase = {
  label: string;
  progress: number;
};

function App() {
  const [parsedResume, setParsedResume] = useState<ParsedResume | null>(null);
  const [resumeSource, setResumeSource] = useState<ResumeSource>("none");
  const [jobDescription, setJobDescription] = useState("");
  const deferredJobDescription = useDeferredValue(jobDescription);
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase | null>(null);
  const [parseError, setParseError] = useState("");
  const [activeTab, setActiveTab] = useState<"issues" | "keywords" | "parsed">("issues");

  useEffect(() => {
    if (!parsedResume) return;
    setAnalysis(analyzeResume(parsedResume, deferredJobDescription));
  }, [parsedResume, deferredJobDescription]);

  const orderedIssues = analysis?.issues.filter((issue) => issue.severity !== "success") ?? [];

  async function handleFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setParseError("Please upload a PDF resume.");
      return;
    }

    setIsParsing(true);
    setParseError("");
    try {
      setAnalysisPhase({ label: "Reading and parsing PDF", progress: 20 });
      const parsed = await parsePdfResume(file);
      const nextJobDescription = jobDescription === SAMPLE_JOB_DESCRIPTION ? "" : jobDescription;
      if (nextJobDescription !== jobDescription) {
        setJobDescription(nextJobDescription);
      }
      const nextAnalysis = await runAnalysisWorkflow(parsed, nextJobDescription, setAnalysisPhase);
      setParsedResume(parsed);
      setResumeSource("uploaded");
      setActiveTab("issues");
      setAnalysis(nextAnalysis);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "Unable to read this PDF.");
    } finally {
      setAnalysisPhase(null);
      setIsParsing(false);
    }
  }

  async function loadSample() {
    const sampleResume = {
      fileName: "sample-software-engineer-resume.txt",
      text: SAMPLE_RESUME_TEXT,
      lines: SAMPLE_RESUME_TEXT.split(/\r?\n/),
      pageCount: 1,
      layout: {
        pageCount: 1,
        textItemCount: SAMPLE_RESUME_TEXT.split(/\s+/).length,
        sparsePages: 0,
        multiColumnRisk: 0,
        averageLineLength: 72,
      },
    };
    setIsParsing(true);
    setAnalysisPhase({ label: "Loading demo resume", progress: 15 });
    const sample = await runAnalysisWorkflow(sampleResume, SAMPLE_JOB_DESCRIPTION, setAnalysisPhase);
    setParsedResume(sampleResume);
    setResumeSource("sample");
    setJobDescription(SAMPLE_JOB_DESCRIPTION);
    setActiveTab("issues");
    setAnalysis(sample);
    setAnalysisPhase(null);
    setIsParsing(false);
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="left-rail">
          <div className="brand-lockup">
            <div className="brand-mark">
              <Gauge size={22} />
            </div>
            <div>
              <p className="eyebrow">ATS Resume Scorer</p>
              <h1>Resume audit desk</h1>
            </div>
          </div>

          <UploadPanel
            isParsing={isParsing}
            parseError={parseError}
            onFile={handleFile}
            parsedResume={parsedResume}
            analysis={analysis}
            source={resumeSource}
            analysisPhase={analysisPhase}
          />

          <label className="job-panel">
            <span>
              <Target size={17} />
              Target job description
            </span>
            <textarea
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder="Paste the exact job description here for keyword match, title alignment, and missing skills."
            />
          </label>

          <div className="rail-actions">
            <button className="primary-action" type="button" onClick={loadSample}>
              <Sparkles size={17} />
              Try sample audit
            </button>
            <button
              className="ghost-action"
              type="button"
              onClick={() => {
                setParsedResume(null);
                setResumeSource("none");
                setAnalysis(null);
                setJobDescription("");
                setParseError("");
              }}
            >
              <X size={16} />
              Reset
            </button>
          </div>

          <ResearchCard />
        </aside>

        <section className="scoreboard">
          {analysis ? (
            <Dashboard
              analysis={analysis}
              activeTab={activeTab}
              issues={orderedIssues}
              setActiveTab={setActiveTab}
              fileName={parsedResume?.fileName ?? "Resume"}
              source={resumeSource}
              parsedResume={parsedResume}
            />
          ) : (
            <EmptyState isParsing={isParsing} analysisPhase={analysisPhase} />
          )}
        </section>
      </section>
    </main>
  );
}

function UploadPanel({
  isParsing,
  parseError,
  onFile,
  parsedResume,
  analysis,
  source,
  analysisPhase,
}: {
  isParsing: boolean;
  parseError: string;
  onFile: (file: File) => void;
  parsedResume: ParsedResume | null;
  analysis: ResumeAnalysis | null;
  source: ResumeSource;
  analysisPhase: AnalysisPhase | null;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={`upload-panel ${isDragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <input
        id="resume-upload"
        data-testid="resume-upload"
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <label htmlFor="resume-upload" className="upload-target">
        <div className="upload-icon">{isParsing ? <Loader2 className="spin" /> : <Upload />}</div>
        <span>{isParsing ? analysisPhase?.label ?? "Analyzing resume..." : "Upload PDF resume"}</span>
        <small>
          {isParsing
            ? `${analysisPhase?.progress ?? 0}% complete`
            : "Drag a file here or choose one from your computer"}
        </small>
      </label>
      {parseError && (
        <p className="error-text">
          <AlertTriangle size={15} />
          {parseError}
        </p>
      )}
      {parsedResume && analysis && (
        <div className={`upload-status ${source}`}>
          <FileCheck2 size={17} />
          <div>
            <strong>{source === "uploaded" ? "Uploaded resume analyzed" : "Demo resume loaded"}</strong>
            <span>
              {parsedResume.fileName} - {analysis.stats.wordCount} words - {analysis.stats.extractionQuality}/100 extraction
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Dashboard({
  analysis,
  activeTab,
  issues,
  setActiveTab,
  fileName,
  source,
  parsedResume,
}: {
  analysis: ResumeAnalysis;
  activeTab: "issues" | "keywords" | "parsed";
  issues: Issue[];
  setActiveTab: (tab: "issues" | "keywords" | "parsed") => void;
  fileName: string;
  source: ResumeSource;
  parsedResume: ParsedResume | null;
}) {
  return (
    <div className="dashboard-grid">
      <header className="score-hero">
        <div>
          <p className="eyebrow">{source === "sample" ? "Demo analysis" : "Uploaded PDF analysis"}</p>
          <h2>{fileName}</h2>
          <p className="hero-subtitle">{analysis.rating}</p>
        </div>
        <div className="hero-actions">
          <ScoreRing score={analysis.overallScore} />
          <button
            className="download-action"
            type="button"
            onClick={() => {
              if (parsedResume) {
                downloadAnalysisReport(parsedResume, analysis);
              }
            }}
            disabled={!parsedResume}
          >
            <Download size={16} />
            Download PDF report
          </button>
        </div>
      </header>

      <section className="metric-strip">
        <Metric icon={<FileText />} label="Pages" value={analysis.stats.pageCount.toString()} />
        <Metric icon={<ClipboardList />} label="Words" value={analysis.stats.wordCount.toString()} />
        <Metric icon={<BarChart3 />} label="Quantified bullets" value={`${analysis.stats.quantifiedBulletCount}/${analysis.stats.bulletCount}`} />
        <Metric icon={<ShieldCheck />} label="Contact signals" value={`${analysis.stats.contactItems}/4`} />
      </section>

      <ReadinessChecklist analysis={analysis} />

      <section className="category-grid">
        {analysis.categories.map((category) => (
          <CategoryMeter key={category.key} category={category} />
        ))}
      </section>

      <section className="main-report">
        <div className="report-tabs">
          <button className={activeTab === "issues" ? "active" : ""} onClick={() => setActiveTab("issues")}>
            <Lightbulb size={16} />
            Fixes
          </button>
          <button className={activeTab === "keywords" ? "active" : ""} onClick={() => setActiveTab("keywords")}>
            <Search size={16} />
            Keywords
          </button>
          <button className={activeTab === "parsed" ? "active" : ""} onClick={() => setActiveTab("parsed")}>
            <FileText size={16} />
            Parsed text
          </button>
        </div>

        {activeTab === "issues" && <IssuesView analysis={analysis} issues={issues} />}
        {activeTab === "keywords" && <KeywordView analysis={analysis} />}
        {activeTab === "parsed" && <ParsedTextView text={analysis.parsedText} />}
      </section>
    </div>
  );
}

function ReadinessChecklist({ analysis }: { analysis: ResumeAnalysis }) {
  const coreSectionsFound = analysis.sections.filter((section) => section.found).length;
  const checklist = [
    {
      label: "Text extraction",
      value: `${analysis.stats.extractionQuality}/100`,
      good: analysis.stats.extractionQuality >= 80,
      detail: "ATS can read the PDF text.",
      icon: <FileText />,
    },
    {
      label: "Contact info",
      value: `${analysis.stats.contactItems}/4`,
      good: analysis.stats.contactItems >= 2,
      detail: "Email and phone should be plain text.",
      icon: <ShieldCheck />,
    },
    {
      label: "Work dates",
      value: analysis.stats.dateMentions.toString(),
      good: analysis.stats.dateMentions >= 2,
      detail: "Dates help parsers build work history.",
      icon: <CalendarClock />,
    },
    {
      label: "Sections",
      value: `${coreSectionsFound}/${analysis.sections.length}`,
      good: coreSectionsFound >= 4,
      detail: "Use standard headings.",
      icon: <ClipboardList />,
    },
    {
      label: "Keyword match",
      value: analysis.keywordReport.coverage ? `${analysis.keywordReport.coverage}%` : "Needs JD",
      good: analysis.keywordReport.coverage >= 75,
      detail: "Paste a target job for a real match score.",
      icon: <Search />,
    },
    {
      label: "Measured impact",
      value: `${analysis.stats.quantifiedBulletCount}/${analysis.stats.bulletCount}`,
      good: analysis.stats.bulletCount > 0 && analysis.stats.quantifiedBulletCount / analysis.stats.bulletCount >= 0.35,
      detail: "Bullets should show scale and outcomes.",
      icon: <BarChart3 />,
    },
  ];

  return (
    <section className="readiness-grid">
      {checklist.map((item) => (
        <article key={item.label} className={`readiness-card ${item.good ? "good" : "needs-work"}`}>
          <span className="readiness-icon">{item.icon}</span>
          <div>
            <div className="readiness-topline">
              <strong>{item.label}</strong>
              <em>{item.value}</em>
            </div>
            <p>{item.detail}</p>
          </div>
        </article>
      ))}
    </section>
  );
}

function IssuesView({ analysis, issues }: { analysis: ResumeAnalysis; issues: Issue[] }) {
  return (
    <div className="report-layout">
      <div className="priority-panel">
        <div className="panel-heading">
          <h3>Highest-impact fixes</h3>
          <span>{analysis.quickWins.length} prioritized</span>
        </div>
        <div className="quick-win-list">
          {analysis.quickWins.map((issue, index) => (
            <article key={issue.id} className="quick-win">
              <span>{index + 1}</span>
              <div>
                <strong>{issue.title}</strong>
                <p>{issue.fix}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="issue-list">
        {issues.length === 0 ? (
          <div className="clear-state">
            <Check size={26} />
            <h3>No major issues detected</h3>
            <p>Use the keyword tab to keep tailoring this resume to each role.</p>
          </div>
        ) : (
          issues.map((issue) => <IssueCard key={issue.id} issue={issue} />)
        )}
      </div>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <article className={`issue-card ${issue.severity}`}>
      <div className="issue-topline">
        <span className="severity-pill">{labelForSeverity(issue.severity)}</span>
        <span className="points">-{issue.points} pts</span>
      </div>
      <h3>{issue.title}</h3>
      <p>{issue.detail}</p>
      {issue.evidence && <blockquote>{issue.evidence}</blockquote>}
      <div className="fix-line">
        <ArrowRight size={16} />
        <span>{issue.fix}</span>
      </div>
    </article>
  );
}

function KeywordView({ analysis }: { analysis: ResumeAnalysis }) {
  const { keywordReport } = analysis;
  return (
    <div className="keyword-grid">
      <KeywordColumn title="Matched hard skills" items={keywordReport.matchedHardSkills} tone="good" />
      <KeywordColumn title="Missing hard skills" items={keywordReport.missingHardSkills} tone="bad" />
      <KeywordColumn title="Matched role terms" items={keywordReport.matchedRoleTerms} tone="good" />
      <KeywordColumn title="Missing role terms" items={keywordReport.missingRoleTerms} tone="bad" />
      <KeywordColumn title="Competency signals" items={keywordReport.matchedSoftSkills} tone="neutral" />
      <KeywordColumn title="Resume-only skills" items={keywordReport.resumeOnlySkills} tone="neutral" />
    </div>
  );
}

function KeywordColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <section className="keyword-column">
      <div className="panel-heading compact">
        <h3>{title}</h3>
        <span>{items.length}</span>
      </div>
      <div className="keyword-cloud">
        {items.length > 0 ? (
          items.map((item) => (
            <span key={item} className={`keyword ${tone}`}>
              {item}
            </span>
          ))
        ) : (
          <p className="muted">Nothing detected yet.</p>
        )}
      </div>
    </section>
  );
}

function ParsedTextView({ text }: { text: string }) {
  return (
    <div className="parsed-panel">
      <div className="panel-heading">
        <h3>ATS extracted text</h3>
        <span>Check reading order</span>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

function EmptyState({
  isParsing,
  analysisPhase,
}: {
  isParsing: boolean;
  analysisPhase: AnalysisPhase | null;
}) {
  return (
    <div className="empty-state">
      <div className="empty-visual">
        <div className="paper-stack one" />
        <div className="paper-stack two" />
        <div className="paper-stack three">
          <Gauge size={46} />
        </div>
      </div>
      <p className="eyebrow">Resume intelligence</p>
      <h2>{isParsing ? analysisPhase?.label ?? "Analyzing your resume" : "Upload a PDF to generate your ATS report"}</h2>
      <p>
        The report will score parseability, searchability, impact, presentation, and competencies,
        then show the exact fixes to raise the score.
      </p>
      {isParsing && analysisPhase && (
        <div className="analysis-progress">
          <div className="analysis-progress-track">
            <span style={{ width: `${analysisPhase.progress}%` }} />
          </div>
          <strong>{analysisPhase.progress}% complete</strong>
        </div>
      )}
      <div className="empty-checks">
        <span>
          <Check size={15} />
          PDF text extraction
        </span>
        <span>
          <Check size={15} />
          Missing keyword map
        </span>
        <span>
          <Check size={15} />
          Bullet-level issues
        </span>
      </div>
    </div>
  );
}

async function runAnalysisWorkflow(
  parsed: ParsedResume,
  currentJobDescription: string,
  setAnalysisPhase: (phase: AnalysisPhase) => void,
) {
  const startedAt = performance.now();
  const steps: AnalysisPhase[] = [
    { label: "Checking ATS parseability", progress: 38 },
    { label: "Scoring keywords and impact", progress: 68 },
    { label: "Preparing report summary", progress: 92 },
  ];

  for (const step of steps) {
    setAnalysisPhase(step);
    await yieldToInterface();
  }

  const result = analyzeResume(parsed, currentJobDescription);
  const elapsed = performance.now() - startedAt;
  if (elapsed < 850) {
    await wait(850 - elapsed);
  }
  setAnalysisPhase({ label: "Finalizing analysis", progress: 100 });
  await yieldToInterface();
  return result;
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, durationMs);
  });
}

function yieldToInterface() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, 90);
  });
}

function ResearchCard() {
  const [open, setOpen] = useState(false);
  return (
    <section className="research-card">
      <button type="button" onClick={() => setOpen((value) => !value)}>
        <span>
          <ShieldCheck size={17} />
          Scoring basis
        </span>
        <ChevronDown className={open ? "open" : ""} size={17} />
      </button>
      {open && (
        <ul>
          {researchNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const gradient = `conic-gradient(var(--green) ${score * 3.6}deg, var(--line) 0deg)`;
  return (
    <div className="score-ring" style={{ background: gradient }}>
      <div>
        <strong>{score}</strong>
        <span>/ 100</span>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </div>
  );
}

function CategoryMeter({ category }: { category: CategoryScore }) {
  return (
    <article className="category-meter">
      <div className="category-header">
        <h3>{category.label}</h3>
        <span>{category.score}</span>
      </div>
      <div className="meter-track">
        <span style={{ width: `${category.score}%` }} />
      </div>
      <p>{category.summary}</p>
    </article>
  );
}

function labelForSeverity(severity: Severity) {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "Warning";
  if (severity === "success") return "Passed";
  return "Improve";
}

export default App;
