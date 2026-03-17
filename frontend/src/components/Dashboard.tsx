"use client";
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ThemeProvider, { useTheme } from "./ThemeProvider";
import ChatInput from "./ChatInput";
import ChartRenderer from "./ChartRenderer";
import KPICards from "./KPICards";
import InsightBox from "./InsightBox";
import QueryHistory from "./QueryHistory";
import DataTable from "./DataTable";
import ExportButtons from "./ExportButtons";
import CSVUpload from "./CSVUpload";
import DatasetSwitcher from "./DatasetSwitcher";
import ErrorBoundary from "./ErrorBoundary";
import { toPng } from "html-to-image";
import {
  sendQuery,
  fetchSuggestions,
  fetchSchema,
  fetchTables,
  setActiveTable as apiSetActiveTable,
  deleteTable as apiDeleteTable,
  uploadCSV,
  uploadPreview,
} from "@/services/api";
import type {
  QueryResponse,
  Suggestion,
  SchemaInfo,
  TableInfo,
  ChartConfig,
  ChatMessage,
  Conversation,
  UploadPreview,
} from "@/types";

/* ══════════════════════════════════════════════════════════════════ */
/* SAMPLE DATA URL                                                   */
/* ══════════════════════════════════════════════════════════════════ */
const SAMPLE_DATA_URL = "https://raw.githubusercontent.com/pabitra27706-oss/matriq/main/sample_data.csv";

/* ══════════════════════════════════════════════════════════════════ */
/* CHART TYPES                                                       */
/* ══════════════════════════════════════════════════════════════════ */
const ALL_CHART_TYPES = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "scatter", label: "Scatter" },
];

/* ══════════════════════════════════════════════════════════════════ */
/* GENERIC SUGGESTIONS — works with any dataset                      */
/* ══════════════════════════════════════════════════════════════════ */
const GENERIC_SUGGESTIONS: Suggestion[] = [
  {
    query: "Show me an overview of all the data",
    difficulty: "Simple",
    description: "Get a high-level summary of your dataset",
  },
  {
    query: "What are the top 10 records by the highest numeric value?",
    difficulty: "Simple",
    description: "Find the top entries in your data",
  },
  {
    query: "Show me the distribution of data across categories",
    difficulty: "Medium",
    description: "Visualize how data is spread across groups",
  },
  {
    query: "What trends can you find in the data over time?",
    difficulty: "Medium",
    description: "Discover patterns and trends",
  },
  {
    query: "Compare the top 5 categories by total values",
    difficulty: "Medium",
    description: "Side-by-side comparison of key groups",
  },
  {
    query: "Show me a statistical summary of all numeric columns",
    difficulty: "Simple",
    description: "Mean, median, min, max for all numbers",
  },
];

/* ══════════════════════════════════════════════════════════════════ */
/* UTILITIES                                                         */
/* ══════════════════════════════════════════════════════════════════ */
function getCompatibleTypes(config: ChartConfig | null): string[] {
  if (!config) return ALL_CHART_TYPES.map((t) => t.value);
  const yCount = config.y_axis?.length || 0;
  const xAxis = config.x_axis || "";
  const isTime = /month|date|year|week/i.test(xAxis);
  const compat = ["bar", "line", "area"];
  if (!isTime && yCount <= 1) compat.push("pie", "donut");
  if (yCount >= 1) compat.push("scatter");
  return [...new Set(compat)];
}

function generateTitle(q: string): string {
  const c = q.replace(/['"]/g, "").trim();
  return c.length <= 50 ? c : c.substring(0, 47) + "\u2026";
}

function createConversation(firstQuery?: string): Conversation {
  const now = new Date().toISOString();
  return {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
    title: firstQuery ? generateTitle(firstQuery) : "New conversation",
    messages: [],
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    isArchived: false,
  };
}

function serializeConversations(convs: Conversation[]): string {
  const withMessages = convs.filter((c) => c.messages.length > 0);
  return JSON.stringify(
    withMessages.slice(0, 50).map((c) => ({
      ...c,
      messages: c.messages.map((m) => ({
        ...m,
        response: m.response
          ? { ...m.response, data: m.response.data.slice(0, 50) }
          : undefined,
      })),
    }))
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* PDF EXPORT                                                        */
/* ══════════════════════════════════════════════════════════════════ */
async function doExportPDF(
  resp: QueryResponse,
  chartEl: HTMLElement | null,
  activeTable: string,
  isDark: boolean
) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF("p", "mm", "a4");
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 15;
  const cw = pw - 2 * m;
  let y = 0;
  const check = (n: number) => {
    if (y + n > ph - m) {
      doc.addPage();
      y = m;
    }
  };

  doc.setFillColor(34, 197, 94);
  doc.rect(0, 0, pw, 24, "F");
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("MATRIQ Report", m, 16);
  doc.setFontSize(8);
  doc.text(
    `${new Date().toLocaleString()} \u00B7 ${activeTable}`,
    pw - m,
    16,
    { align: "right" }
  );
  y = 32;

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  const qL = doc.splitTextToSize(`"${resp.query}"`, cw);
  doc.text(qL, m, y);
  y += qL.length * 4.5 + 8;

  if (resp.kpis.length) {
    check(25);
    doc.setFontSize(13);
    doc.setTextColor(34, 197, 94);
    doc.text("Key Metrics", m, y);
    y += 8;
    resp.kpis.forEach((k) => {
      check(8);
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      doc.text(k.label, m, y);
      doc.setFontSize(13);
      doc.setTextColor(30, 30, 30);
      doc.text(k.value, m + 55, y);
      if (k.trend) {
        doc.setFontSize(8);
        const u = k.trend_direction === "up";
        doc.setTextColor(u ? 34 : 239, u ? 197 : 68, u ? 94 : 68);
        doc.text(k.trend, m + 100, y);
      }
      y += 8;
    });
    y += 6;
  }

  if (chartEl && resp.data.length) {
    check(95);
    doc.setFontSize(13);
    doc.setTextColor(34, 197, 94);
    doc.text(resp.chart_config?.title || "Chart", m, y);
    y += 5;
    try {
      const bg = isDark ? "#0c0e14" : "#ffffff";
      const url = await toPng(chartEl, { backgroundColor: bg, pixelRatio: 2 });
      const w = cw;
      const h = w * 0.55;
      check(h + 8);
      doc.addImage(url, "PNG", m, y, w, h);
      y += h + 10;
    } catch {
      // chart export failed silently
    }
  }

  if (resp.insight) {
    check(30);
    doc.setFontSize(13);
    doc.setTextColor(34, 197, 94);
    doc.text("AI Insight", m, y);
    y += 7;
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const iL = doc.splitTextToSize(resp.insight, cw);
    check(iL.length * 4.5);
    doc.text(iL, m, y);
    y += iL.length * 4.5 + 8;
  }

  if (resp.sql) {
    check(18);
    doc.setFontSize(13);
    doc.setTextColor(34, 197, 94);
    doc.text("SQL Query", m, y);
    y += 7;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    const sL = doc.splitTextToSize(resp.sql, cw);
    check(sL.length * 3.5);
    doc.text(sL, m, y);
    y += sL.length * 3.5 + 8;
  }

  if (resp.data.length) {
    check(25);
    doc.setFontSize(13);
    doc.setTextColor(34, 197, 94);
    doc.text(`Data (${resp.data.length} rows)`, m, y);
    y += 7;
    const cols = Object.keys(resp.data[0]);
    const colW = Math.min(cw / cols.length, 35);
    doc.setFontSize(6);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(34, 197, 94);
    doc.rect(m, y - 3, cw, 5, "F");
    cols.forEach((c, i) => {
      doc.text(c.substring(0, 14), m + i * colW + 1, y);
    });
    y += 5;
    doc.setTextColor(60, 60, 60);
    resp.data.slice(0, 25).forEach((row, ri) => {
      check(5);
      if (ri % 2 === 0) {
        doc.setFillColor(240, 253, 244);
        doc.rect(m, y - 3, cw, 5, "F");
      }
      cols.forEach((c, i) => {
        doc.text(String(row[c] ?? "-").substring(0, 14), m + i * colW + 1, y);
      });
      y += 4;
    });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `MATRIQ \u2014 Page ${i}/${pages}`,
      pw / 2,
      ph - 5,
      { align: "center" }
    );
  }
  const fileName = (resp.chart_config?.title || "report")
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 30);
  doc.save(`${fileName}.pdf`);
}

/* ══════════════════════════════════════════════════════════════════ */
/* FULLSCREEN MODAL                                                  */
/* ══════════════════════════════════════════════════════════════════ */
function FullscreenModal({
  config,
  data,
  darkMode,
  chartType,
  onClose,
}: {
  config: ChartConfig;
  data: Record<string, unknown>[];
  darkMode: boolean;
  chartType: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 dark:bg-black/70 backdrop-blur-md animate-[fade-in_0.2s]">
      <div className="glass-card rounded-2xl w-[95vw] h-[90vh] flex flex-col overflow-hidden animate-[scale-in_0.3s] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border)]">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              {config.title || "Chart"}
            </h3>
            <p className="text-[10px] text-[var(--color-muted)] mono-sm">
              {data.length} pts &middot; {chartType}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportButtons chartRef={ref} data={data} title={config.title || "chart"} />
            <button type="button" onClick={onClose} className="btn-icon" aria-label="Close">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div ref={ref} className="flex-1 p-6 overflow-auto">
          <ChartRenderer data={data} config={config} darkMode={darkMode} overrideChartType={chartType} />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* CHART TYPE SWITCHER                                               */
/* ══════════════════════════════════════════════════════════════════ */
function ChartTypeSwitcher({
  currentType,
  compatibleTypes,
  onChange,
}: {
  currentType: string;
  compatibleTypes: string[];
  onChange: (t: string) => void;
}) {
  return (
    <div className="flex gap-1 flex-wrap" role="radiogroup" aria-label="Chart type">
      {ALL_CHART_TYPES.filter((t) => compatibleTypes.includes(t.value)).map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          role="radio"
          aria-checked={currentType === t.value}
          className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all border ${
            currentType === t.value
              ? "bg-[#22c55e]/10 text-[#22c55e] border-[#22c55e]/25 shadow-sm"
              : "text-[var(--color-muted-foreground)] border-[var(--color-border)] hover:border-[#22c55e]/15 hover:text-[var(--color-foreground)]"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* TYPING INDICATOR                                                  */
/* ══════════════════════════════════════════════════════════════════ */
function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-[fade-in_0.3s]">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#22c55e] to-[#15803d] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-[#22c55e]/15 animate-[glow-pulse_3s_infinite]">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      </div>
      <div className="glass-card rounded-2xl rounded-tl-sm px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="typing-dot" />
          <span className="text-xs text-[#22c55e] ml-1 font-semibold">Analyzing&hellip;</span>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* WELCOME UPLOAD MODAL                                              */
/* ══════════════════════════════════════════════════════════════════ */
function WelcomeUploadModal({
  onUploadDone,
  onSkip,
}: {
  onUploadDone: (tableName: string, suggestedQuestions?: string[]) => void;
  onSkip: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [done, setDone] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const MAX_SIZE = 50 * 1024 * 1024;

  const handleSelectFile = async (f: File) => {
    setError("");
    setPreview(null);
    if (!f.name.toLowerCase().endsWith(".csv")) {
      setError("Only .csv files are supported.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("File too large. Maximum size is 50 MB.");
      return;
    }
    setFile(f);
    setLoadingPreview(true);
    try {
      const p = await uploadPreview(f);
      if (p.success) setPreview(p);
      else setError(p.error || "Preview failed");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleSelectFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleSelectFile(f);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setProgress(0);
    const tName = file.name.replace(/\.csv$/i, "").replace(/[^\w]/g, "_");
    try {
      const r = await uploadCSV(file, tName, (p: number) => setProgress(p));
      if (r.success) {
        setDone(true);
        setTimeout(() => onUploadDone(r.table_name, r.suggested_questions), 900);
      } else {
        setError(r.error || "Upload failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setError("");
    setProgress(0);
    try {
      let blob: Blob | null = null;
      try {
        const response = await fetch(SAMPLE_DATA_URL, {
          mode: "cors",
          cache: "no-cache",
        });
        if (response.ok) {
          blob = await response.blob();
        }
      } catch {
        console.warn("GitHub fetch failed, trying local fallback...");
      }

      if (!blob) {
        try {
          const localResponse = await fetch("/sample_data.csv");
          if (localResponse.ok) {
            blob = await localResponse.blob();
          }
        } catch {
          console.warn("Local fallback also failed");
        }
      }

      if (!blob) {
        throw new Error(
          "Could not load sample data. Please download it manually from GitHub and upload it using the file picker above."
        );
      }

      const sampleFile = new File([blob], "sample_data.csv", { type: "text/csv" });
      const r = await uploadCSV(sampleFile, "sample_data", (p: number) => setProgress(p));
      if (r.success) {
        setDone(true);
        setTimeout(() => onUploadDone(r.table_name, r.suggested_questions), 900);
      } else {
        setError(r.error || "Failed to load sample data");
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load sample data. Please download it manually from GitHub and upload it."
      );
    } finally {
      setLoadingSample(false);
    }
  };

  const resetFile = () => {
    setFile(null);
    setPreview(null);
    setError("");
    setProgress(0);
    setDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fmtSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 dark:bg-black/70 backdrop-blur-lg animate-[fade-in_0.3s]">
      <div className="relative w-full max-w-2xl mx-4 max-h-[92vh] overflow-y-auto glass-card rounded-2xl shadow-2xl animate-[scale-in_0.35s] border border-[var(--color-border)]">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#22c55e]/60 to-transparent rounded-t-2xl" />

        <button
          type="button"
          onClick={onSkip}
          className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-foreground)] transition-all active:scale-[0.97]"
          aria-label="Skip"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
          Skip
        </button>

        <div className="p-8 pt-10">
          <div className="text-center mb-8">
            <div className="mb-5 mx-auto animate-[scale-in_0.5s]">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-[#22c55e] to-[#15803d] flex items-center justify-center shadow-xl shadow-[#22c55e]/20 animate-[glow-pulse_4s_infinite]">
                <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                </svg>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
              Welcome to <span className="gradient-text-brand">MATRIQ</span>
            </h2>
            <p className="text-sm text-[var(--color-muted-foreground)] max-w-md mx-auto leading-relaxed">
              Upload your CSV dataset to start exploring with AI-powered analytics, or try with our sample data.
            </p>
          </div>

          {done && (
            <div className="text-center py-12 animate-[scale-in_0.3s]">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#22c55e]/10 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-[#22c55e]">Dataset loaded successfully!</p>
              <p className="text-xs text-[var(--color-muted)] mt-1">Preparing your workspace&hellip;</p>
            </div>
          )}

          {!file && !loadingPreview && !done && !loadingSample && (
            <div className="space-y-5">
              <div
                onClick={() => fileRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 group ${
                  dragOver
                    ? "border-[#22c55e] bg-[#22c55e]/5 scale-[1.01]"
                    : "border-[var(--color-border)] hover:border-[#22c55e]/40 hover:bg-[var(--color-surface-2)]"
                }`}
              >
                <svg
                  className={`w-12 h-12 mx-auto mb-4 transition-colors duration-300 ${
                    dragOver
                      ? "text-[#22c55e]"
                      : "text-[var(--color-muted)]/30 group-hover:text-[#22c55e]/50"
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm font-medium text-[var(--color-foreground)] mb-1">
                  {dragOver ? "Drop your CSV here" : "Click or drag & drop your CSV file"}
                </p>
                <p className="text-[11px] text-[var(--color-muted)]">
                  Supports .csv files up to 50 MB
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-[var(--color-border)]" />
                <span className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-[var(--color-border)]" />
              </div>

              <button
                type="button"
                onClick={handleLoadSample}
                className="w-full flex items-center justify-center gap-3 px-5 py-4 rounded-xl border border-[var(--color-border)] hover:border-[#22c55e]/30 hover:bg-[#22c55e]/[0.03] transition-all duration-300 group/sample active:scale-[0.99]"
              >
                <div className="w-10 h-10 rounded-lg bg-[#3b82f6]/10 flex items-center justify-center flex-shrink-0 group-hover/sample:bg-[#3b82f6]/15 transition-colors">
                  <svg className="w-5 h-5 text-[#3b82f6]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
                  </svg>
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-[var(--color-foreground)] group-hover/sample:text-[#22c55e] transition-colors">
                    Try with Sample Data
                  </p>
                  <p className="text-[10px] text-[var(--color-muted)] mt-0.5">
                    Load a small demo dataset to explore features
                  </p>
                </div>
                <svg className="w-4 h-4 text-[var(--color-muted)] group-hover/sample:text-[#22c55e] transition-colors ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>

              <div className="flex items-center justify-center gap-3 flex-wrap pt-2">
                <span className="badge badge-green py-1 px-3 text-[10px]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                  Secure
                </span>
                <span className="badge badge-blue py-1 px-3 text-[10px]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>
                  AI-Powered
                </span>
                <span className="badge badge-purple py-1 px-3 text-[10px]">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75Z" /></svg>
                  Auto Charts
                </span>
              </div>
            </div>
          )}

          {loadingPreview && (
            <div className="flex flex-col items-center py-16 animate-[fade-in_0.3s]">
              <div className="w-10 h-10 border-[3px] border-transparent border-t-[#22c55e] rounded-full animate-spin mb-4" />
              <p className="text-xs text-[var(--color-muted-foreground)]">Analyzing your file&hellip;</p>
            </div>
          )}

          {loadingSample && !done && (
            <div className="flex flex-col items-center py-16 animate-[fade-in_0.3s]">
              <div className="w-10 h-10 border-[3px] border-transparent border-t-[#3b82f6] rounded-full animate-spin mb-4" />
              <p className="text-xs text-[var(--color-muted-foreground)]">Loading sample data&hellip;</p>
              {progress > 0 && (
                <div className="w-48 mt-3">
                  <div className="w-full h-1.5 bg-[var(--color-surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#3b82f6] to-[#22c55e] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <p className="text-[10px] text-[var(--color-muted)] text-center mt-1">{progress}%</p>
                </div>
              )}
            </div>
          )}

          {preview && !done && (
            <div className="space-y-5 animate-[fade-in-up_0.3s]">
              <div className="glass-subtle rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[#22c55e]/10 flex items-center justify-center">
                      <svg className="w-4 h-4 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-foreground)]">{preview.file_name}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">{fmtSize(preview.file_size)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={resetFile} className="btn-icon text-[var(--color-muted)]" aria-label="Remove file">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex gap-4 text-[10px] text-[var(--color-muted-foreground)]">
                  <span className="badge badge-green">{preview.row_count.toLocaleString()} rows</span>
                  <span className="badge badge-blue">{preview.columns.length} columns</span>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-[var(--color-muted-foreground)] mb-2">Columns detected:</p>
                <div className="flex flex-wrap gap-1.5">
                  {preview.columns.map((col, i) => (
                    <span key={i} className="px-2.5 py-1 text-[10px] rounded-md bg-[var(--color-surface-2)] border border-[var(--color-border)] text-[var(--color-foreground)]">
                      {col.name} <span className="text-[var(--color-muted)]">({col.type})</span>
                    </span>
                  ))}
                </div>
              </div>

              {preview.sample_rows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--color-muted-foreground)] mb-2">Preview (first {preview.sample_rows.length} rows)</p>
                  <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                    <table className="w-full text-[10px]">
                      <thead className="bg-[var(--color-surface-2)]">
                        <tr>
                          {preview.columns.map((col, i) => (
                            <th key={i} className="px-2.5 py-2 text-left font-semibold text-[var(--color-muted-foreground)] whitespace-nowrap">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.sample_rows.map((row, ri) => (
                          <tr key={ri} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)] transition-colors">
                            {preview.columns.map((col, ci) => (
                              <td key={ci} className="px-2.5 py-1.5 text-[var(--color-foreground)] whitespace-nowrap font-mono max-w-[150px] truncate">
                                {row[col.name] != null ? String(row[col.name]) : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {uploading && (
                <div className="animate-[fade-in_0.2s]">
                  <div className="flex justify-between text-[10px] text-[var(--color-muted-foreground)] mb-1">
                    <span>{progress < 100 ? "Uploading\u2026" : "Processing\u2026"}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-[var(--color-surface-3)] rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#22c55e] to-[#4ade80] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={resetFile} disabled={uploading} className="flex-1 px-4 py-3 text-sm font-medium rounded-xl border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-3)] transition-all disabled:opacity-50">
                  Change file
                </button>
                <button type="button" onClick={handleUpload} disabled={uploading} className="flex-1 px-4 py-3 text-sm font-semibold rounded-xl btn-primary disabled:opacity-50 flex items-center justify-center gap-2">
                  {uploading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      Uploading&hellip;
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                      Upload &amp; Start Analyzing
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2.5 text-xs text-[var(--color-destructive)] bg-[var(--color-destructive)]/5 rounded-xl px-4 py-3 border border-[var(--color-destructive)]/10 animate-[fade-in_0.3s]">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
              <div>
                <p className="font-semibold mb-0.5">Error</p>
                <p className="opacity-80 leading-relaxed">{error}</p>
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
        </div>

        {!done && !preview && !loadingPreview && !loadingSample && (
          <div className="px-8 pb-6">
            <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--color-border)]">
              <button type="button" onClick={onSkip} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors font-medium">
                Skip for now &mdash; I&apos;ll upload later
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* ASSISTANT BLOCK                                                   */
/* ══════════════════════════════════════════════════════════════════ */
function AssistantBlock({
  message,
  darkMode,
  onDrillDown,
  activeTable,
  isLatest,
}: {
  message: ChatMessage;
  darkMode: boolean;
  onDrillDown: (q: string) => void;
  activeTable: string;
  isLatest: boolean;
}) {
  const { isDark } = useTheme();
  const chartRef = useRef<HTMLDivElement>(null);
  const [showTable, setShowTable] = useState(false);
  const [chartType, setChartType] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState<{ config: ChartConfig; data: Record<string, unknown>[] } | null>(null);
  const [exporting, setExporting] = useState(false);
  const resp = message.response;
  if (!resp) return null;

  const hasData = resp.success && resp.data.length > 0;
  const hasChart = resp.chart_config && hasData;
  const curType = chartType || resp.chart_config?.chart_type || "bar";
  const compat = getCompatibleTypes(resp.chart_config || null);

  const handleExport = async () => {
    setExporting(true);
    try { await doExportPDF(resp, chartRef.current, activeTable, isDark); } catch (e) { console.error(e); } finally { setExporting(false); }
  };

  if (!resp.success) {
    return (
      <div className="flex items-start gap-3 animate-[fade-in-up_0.4s]">
        <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-[var(--color-destructive)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <svg className="w-4 h-4 text-[var(--color-destructive)]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
        </div>
        <div className="flex-1 glass-card rounded-2xl rounded-tl-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-bold text-[var(--color-destructive)]">Error</span>
            <span className="badge badge-red">failed</span>
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed mb-3">{resp.error}</p>
          <button type="button" onClick={() => onDrillDown(resp.query)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-destructive)] hover:underline">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" /></svg>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-[fade-in-up_0.4s]">
      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#22c55e] to-[#15803d] flex items-center justify-center flex-shrink-0 mt-0.5 shadow-lg shadow-[#22c55e]/15">
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5"><span className="status-dot" /><span className="text-xs font-bold text-[#22c55e]">MATRIQ</span></div>
          {resp.cache_hit && <span className="badge badge-amber">cached</span>}
          {resp.is_modification && <span className="badge badge-green">modified</span>}
          {resp.execution_time > 0 && <span className="badge badge-gray mono-sm">{resp.execution_time}s</span>}
          {(hasData || resp.insight) && (
            <button type="button" onClick={handleExport} disabled={exporting} className="ml-auto btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              {exporting ? "Saving\u2026" : "PDF"}
            </button>
          )}
          {!isLatest && (
            <button type="button" onClick={() => setCollapsed(!collapsed)} className="btn-icon text-[var(--color-muted)]" aria-label={collapsed ? "Expand" : "Collapse"}>
              <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? "" : "rotate-90"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </button>
          )}
        </div>

        {collapsed ? (
          <div className="text-xs text-[var(--color-muted-foreground)] line-clamp-2 cursor-pointer hover:text-[var(--color-foreground)] transition-colors rounded-xl bg-[var(--color-surface-2)] p-3 border border-[var(--color-border)] glass-card-interactive" onClick={() => setCollapsed(false)}>{resp.insight || "Expand"}</div>
        ) : (
          <div className="space-y-4">
            <ErrorBoundary fallbackTitle="KPI error"><div style={{ animation: "fade-in-up 0.4s both" }}><KPICards kpis={resp.kpis} /></div></ErrorBoundary>

            {hasChart && (
              <ErrorBoundary fallbackTitle="Chart error">
                <div className="glass-card rounded-xl overflow-hidden" style={{ animation: "fade-in-up 0.4s 0.1s both" }}>
                  <div className="h-px bg-gradient-to-r from-transparent via-[#22c55e]/20 to-transparent" />
                  <div className="flex items-center justify-between px-5 pt-4 pb-2 flex-wrap gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-foreground)]">{resp.chart_config!.title || "Results"}</h3>
                      <p className="text-[10px] text-[var(--color-muted)] mt-0.5 mono-sm">{resp.data.length} pts &middot; {curType} &middot; {resp.execution_time}s</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <ChartTypeSwitcher currentType={curType} compatibleTypes={compat} onChange={setChartType} />
                      <button type="button" onClick={() => setFullscreen({ config: resp.chart_config!, data: resp.data })} className="btn-icon border border-[var(--color-border)]" aria-label="Fullscreen">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg>
                      </button>
                      <ExportButtons chartRef={chartRef} data={resp.data} title={resp.chart_config!.title || "chart"} />
                    </div>
                  </div>
                  <div ref={chartRef} className="px-3 pb-3 print-chart">
                    <ChartRenderer data={resp.data} config={resp.chart_config!} darkMode={darkMode} overrideChartType={chartType || undefined} onDrillDown={(xVal, xField) => onDrillDown(`Show me a detailed breakdown for ${xField} = "${xVal}"`)} />
                  </div>
                </div>
              </ErrorBoundary>
            )}

            {resp.additional_charts.length > 0 && (
              <ErrorBoundary fallbackTitle="Charts error">
                <div className="grid md:grid-cols-2 gap-3" style={{ animation: "fade-in-up 0.4s 0.2s both" }}>
                  {resp.additional_charts.map((ac, i) => (
                    <div key={i} className="glass-card rounded-xl p-4 overflow-hidden">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-medium text-[var(--color-foreground)]">{ac.title}</h4>
                        <button type="button" onClick={() => setFullscreen({ config: ac, data: resp.data })} className="btn-icon" aria-label="Fullscreen">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9m11.25-5.25v4.5m0-4.5h-4.5m4.5 0L15 9m-11.25 11.25v-4.5m0 4.5h4.5m-4.5 0L9 15m11.25 5.25v-4.5m0 4.5h-4.5m4.5 0L15 15" /></svg>
                        </button>
                      </div>
                      <ChartRenderer data={resp.data} config={ac} darkMode={darkMode} />
                    </div>
                  ))}
                </div>
              </ErrorBoundary>
            )}

            <div style={{ animation: "fade-in-up 0.4s 0.15s both" }}><InsightBox insight={resp.insight} sql={resp.sql} executionTime={resp.execution_time} confidence={resp.confidence} assumptions={resp.assumptions} /></div>

            <ErrorBoundary fallbackTitle="Table error"><div style={{ animation: "fade-in-up 0.4s 0.2s both" }}><DataTable data={resp.data} visible={showTable} onToggle={() => setShowTable(!showTable)} /></div></ErrorBoundary>
          </div>
        )}
      </div>
      {fullscreen && <FullscreenModal config={fullscreen.config} data={fullscreen.data} darkMode={darkMode} chartType={curType} onClose={() => setFullscreen(null)} />}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* DASHBOARD INNER                                                   */
/* ══════════════════════════════════════════════════════════════════ */
function DashboardInner() {
  const { theme, toggle, isDark } = useTheme();
  const darkMode = isDark;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>(GENERIC_SUGGESTIONS);
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [activeTable, setActiveTable] = useState("youtube_data");
  const [tableList, setTableList] = useState<TableInfo[]>([]);
  const [uploadSuggestions, setUploadSuggestions] = useState<string[]>([]);
  const [showWelcomeUpload, setShowWelcomeUpload] = useState(false);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(0);

  const activeConv = useMemo(() => conversations.find((c) => c.id === activeConvId) ?? null, [conversations, activeConvId]);
  const messages = activeConv?.messages ?? [];
  const lastAssistant = useMemo(() => [...messages].reverse().find((m) => m.role === "assistant" && m.response), [messages]);
  const followUps = lastAssistant?.response?.follow_up_questions || [];
  const conversationCtx = useMemo(() => messages.filter((m) => m.role === "assistant" && m.response?.sql).slice(-5).map((m) => ({ query: m.query, sql: m.response!.sql, insight: m.response!.insight, chart_config: m.response!.chart_config as unknown })), [messages]);

  // Init
  useEffect(() => {
    fetchSchema().then(setSchema).catch(console.error);
    loadTables(true);
  }, []);

  // Fetch suggestions when active table changes — fall back to generic
  useEffect(() => {
    if (!activeTable) {
      setSuggestions(GENERIC_SUGGESTIONS);
      return;
    }
    fetchSuggestions()
      .then((fetched) => {
        const isYoutubeTable = activeTable.toLowerCase().includes("youtube");
        const suggestionsLookYoutube = fetched.some(
          (s) =>
            s.query.toLowerCase().includes("youtube") ||
            s.query.toLowerCase().includes("video") ||
            s.query.toLowerCase().includes("subscriber") ||
            s.query.toLowerCase().includes("channel")
        );
        if (!isYoutubeTable && suggestionsLookYoutube) {
          setSuggestions(GENERIC_SUGGESTIONS);
        } else {
          setSuggestions(fetched);
        }
      })
      .catch(() => {
        setSuggestions(GENERIC_SUGGESTIONS);
      });
  }, [activeTable]);

  // Always show welcome popup on every page load/refresh
  const loadTables = async (isInitialLoad = false) => {
    try {
      const r = await fetchTables();
      setTableList(r.tables);
      setActiveTable(r.active_table);
      if (isInitialLoad) {
        setShowWelcomeUpload(true);
      }
    } catch (e) {
      console.error(e);
      setShowWelcomeUpload(true);
    }
  };

  // Load history but ALWAYS start with fresh new chat
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bi-conversations");
      if (raw) {
        const parsed: Conversation[] = JSON.parse(raw);
        const withMessages = parsed.filter((c) => c.messages.length > 0);
        const freshConv = createConversation();
        setConversations([freshConv, ...withMessages]);
        setActiveConvId(freshConv.id);
        prevMsgCount.current = 0;
      } else {
        const freshConv = createConversation();
        setConversations([freshConv]);
        setActiveConvId(freshConv.id);
        prevMsgCount.current = 0;
      }
    } catch {
      const freshConv = createConversation();
      setConversations([freshConv]);
      setActiveConvId(freshConv.id);
      prevMsgCount.current = 0;
    }
  }, []);

  // LocalStorage save
  useEffect(() => {
    try { localStorage.setItem("bi-conversations", serializeConversations(conversations)); } catch { try { localStorage.setItem("bi-conversations", serializeConversations(conversations.slice(0, 20))); } catch { /* silently fail */ } }
  }, [conversations]);

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > prevMsgCount.current || loading) { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }
    prevMsgCount.current = messages.length;
  }, [messages, loading]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "k") { e.preventDefault(); chatInputRef.current?.focus(); }
      if (meta && e.key === "/") { e.preventDefault(); setSidebarOpen((p) => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const updateConversation = useCallback((id: string, updater: (c: Conversation) => Conversation) => { setConversations((prev) => prev.map((c) => (c.id === id ? updater(c) : c))); }, []);

  const handleNewChat = useCallback(() => {
    setConversations((prev) => prev.filter((c) => c.messages.length > 0));
    const conv = createConversation();
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(conv.id);
    setUploadSuggestions([]);
    prevMsgCount.current = 0;
    setTimeout(() => chatInputRef.current?.focus(), 100);
  }, []);

  const handleSelectConv = useCallback((id: string) => {
    setActiveConvId(id);
    const conv = conversations.find((c) => c.id === id);
    prevMsgCount.current = conv?.messages.length ?? 0;
  }, [conversations]);

  const handlePinConv = useCallback((id: string) => { updateConversation(id, (c) => ({ ...c, isPinned: !c.isPinned })); }, [updateConversation]);

  const handleArchiveConv = useCallback((id: string) => {
    updateConversation(id, (c) => ({ ...c, isArchived: !c.isArchived }));
    if (activeConvId === id) { const rem = conversations.filter((c) => c.id !== id && !c.isArchived); setActiveConvId(rem.length ? rem[0].id : null); }
  }, [updateConversation, activeConvId, conversations]);

  const handleDeleteConv = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConvId === id) { const rem = conversations.filter((c) => c.id !== id && !c.isArchived); setActiveConvId(rem.length ? rem[0].id : null); }
  }, [activeConvId, conversations]);

  const handleSwitchTable = async (name: string) => {
    try { await apiSetActiveTable(name); setActiveTable(name); handleNewChat(); await loadTables(); fetchSchema().then(setSchema).catch(console.error); } catch (e) { console.error(e); }
  };

  const handleDeleteTable = async (name: string) => {
    try { const r = await apiDeleteTable(name); setTableList(r.tables); setActiveTable(r.active_table); if (activeTable === name) handleNewChat(); fetchSchema().then(setSchema).catch(console.error); } catch (e) { console.error(e); }
  };

  const handleSubmit = useCallback(async (query: string) => {
    let convId = activeConvId;
    if (!convId) {
      setConversations((prev) => prev.filter((c) => c.messages.length > 0));
      const conv = createConversation(query);
      setConversations((prev) => [conv, ...prev]);
      convId = conv.id;
      setActiveConvId(conv.id);
    } else {
      const existing = conversations.find((c) => c.id === convId);
      if (existing && existing.messages.length === 0 && existing.title === "New conversation") {
        updateConversation(convId, (c) => ({ ...c, title: generateTitle(query) }));
      }
    }
    const capturedConvId = convId;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", query, timestamp: new Date().toISOString() };
    updateConversation(capturedConvId, (c) => ({ ...c, messages: [...c.messages, userMsg], updatedAt: new Date().toISOString() }));
    setLoading(true);
    try {
      const resp = await sendQuery(query, conversationCtx, activeTable);
      const aMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", query, response: resp, timestamp: new Date().toISOString() };
      if (resp.is_modification) {
        updateConversation(capturedConvId, (c) => { const msgs = [...c.messages]; for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].role === "assistant" && msgs[i].response) { msgs[i] = { ...msgs[i], response: resp, isCollapsed: false }; break; } } return { ...c, messages: msgs, updatedAt: new Date().toISOString() }; });
      } else {
        updateConversation(capturedConvId, (c) => ({ ...c, messages: [...c.messages, aMsg], updatedAt: new Date().toISOString() }));
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } }; message?: string };
      const msg = ax?.response?.data?.error || ax?.message || "Request failed";
      const errMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: "assistant", query, response: { success: false, query, sql: "", data: [], chart_config: null, additional_charts: [], insight: "", kpis: [], follow_up_questions: [], execution_time: 0, error: msg }, timestamp: new Date().toISOString() };
      updateConversation(capturedConvId, (c) => ({ ...c, messages: [...c.messages, errMsg], updatedAt: new Date().toISOString() }));
    } finally { setLoading(false); }
  }, [activeConvId, conversations, conversationCtx, activeTable, updateConversation]);

  const handleUploadDone = async (tableName: string, suggestedQuestions?: string[]) => {
    await loadTables();
    fetchSchema().then(setSchema).catch(console.error);
    setActiveTable(tableName);
    setSuggestions(GENERIC_SUGGESTIONS);
    handleNewChat();
    if (suggestedQuestions?.length) {
      setUploadSuggestions(suggestedQuestions);
    } else {
      setUploadSuggestions([]);
    }
  };

  const handleWelcomeUploadDone = async (tableName: string, suggestedQuestions?: string[]) => {
    setShowWelcomeUpload(false);
    await handleUploadDone(tableName, suggestedQuestions);
  };

  const activeTableInfo = tableList.find((t) => t.name === activeTable);

  return (
    <div className="flex h-screen overflow-hidden noise-bg">
      {showWelcomeUpload && (
        <WelcomeUploadModal onUploadDone={handleWelcomeUploadDone} onSkip={() => setShowWelcomeUpload(false)} />
      )}

      {sidebarOpen && (
        <aside className="w-[260px] flex-shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-1)] overflow-hidden animate-[slide-in-left_0.3s] print-hidden">
          <QueryHistory conversations={conversations} activeConvId={activeConvId} onSelect={handleSelectConv} onNewChat={handleNewChat} onPin={handlePinConv} onArchive={handleArchiveConv} onDelete={handleDeleteConv} onClose={() => setSidebarOpen(false)} />
        </aside>
      )}

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <header className="flex items-center justify-between px-5 py-2.5 glass-header z-20 print-hidden">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="btn-icon" aria-label="Toggle sidebar">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" /></svg>
            </button>
            <button type="button" onClick={handleNewChat} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[#22c55e]/5 hover:border-[#22c55e]/25 hover:text-[#22c55e] transition-all active:scale-[0.97]">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              New
            </button>
            <div className="hidden sm:flex items-center gap-2.5 ml-1">
              <img src="/logo.png" alt="MATRIQ" className="w-8 h-8 rounded-lg object-contain" />
              <div>
                <h1 className="text-base font-bold gradient-text-brand leading-none tracking-tight">MATRIQ</h1>
                <p className="text-[9px] text-[var(--color-muted)] font-mono uppercase mt-0.5">{schema ? `${schema.row_count.toLocaleString()} rows` : "Analytics"}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DatasetSwitcher tables={tableList} activeTable={activeTable} onSwitch={handleSwitchTable} onDelete={handleDeleteTable} />
            <CSVUpload onUploadDone={handleUploadDone} />
            <button type="button" onClick={toggle} className="p-2 rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-foreground)] transition-colors" aria-label={isDark ? "Light mode" : "Dark mode"}>
              {isDark ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" /></svg>
              )}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-8">
            {messages.length === 0 && !loading && (
              <div className="relative flex flex-col items-center justify-center py-24 text-center animate-[fade-in_0.5s] overflow-hidden">
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="absolute top-[15%] left-[20%] w-80 h-80 bg-[#22c55e]/[0.03] rounded-full blur-[100px] orb-1" />
                  <div className="absolute bottom-[20%] right-[15%] w-96 h-96 bg-[#3b82f6]/[0.02] rounded-full blur-[100px] orb-2" />
                </div>
                <div className="relative z-10">
                  <div className="mb-8 animate-[scale-in_0.5s] mx-auto animate-[glow-pulse_4s_infinite]">
                    <img src="/logo.png" alt="MATRIQ" className="w-20 h-20 rounded-2xl object-contain shadow-2xl shadow-[#22c55e]/20 mx-auto" />
                  </div>
                  <h2 className="text-3xl font-bold text-[var(--color-foreground)] mb-3">What would you like to explore?</h2>
                  <p className="text-sm text-[var(--color-muted-foreground)] max-w-md mx-auto mb-12">
                    {tableList.length > 0 ? (
                      <>Ask about your <span className="highlight-word">{activeTable}</span> data in plain English</>
                    ) : (
                      <>Upload a CSV dataset to get started, or try with sample data</>
                    )}
                  </p>

                  {tableList.length === 0 && (
                    <div className="mb-10 flex flex-col items-center gap-3" style={{ animation: "fade-in-up 0.5s 0.2s both" }}>
                      <button type="button" onClick={() => setShowWelcomeUpload(true)} className="btn-primary text-sm py-3 px-8 flex items-center gap-2 shadow-lg shadow-[#22c55e]/25">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" /></svg>
                        Upload Your Data
                      </button>
                      <p className="text-[11px] text-[var(--color-muted)]">or use the Upload CSV button in the header</p>
                    </div>
                  )}

                  {schema && tableList.length > 0 && (
                    <div className="flex items-center gap-3 mb-10 text-xs flex-wrap justify-center" style={{ animation: "fade-in-up 0.5s 0.2s both" }}>
                      <span className="badge badge-green py-1 px-3 text-[11px]">{(activeTableInfo?.row_count ?? schema.row_count).toLocaleString()} records</span>
                      <span className="badge badge-blue py-1 px-3 text-[11px]">{schema.tables.length} table(s)</span>
                      <span className="badge badge-purple py-1 px-3 text-[11px]">Gemini AI</span>
                    </div>
                  )}

                  <div className="grid sm:grid-cols-3 gap-4 max-w-3xl w-full">
                    {suggestions.slice(0, 3).map((s, i) => (
                      <button key={i} type="button" onClick={() => handleSubmit(s.query)} className="text-left p-5 rounded-xl glass-card glass-card-hover group" style={{ animation: `fade-in-up 0.5s ${0.3 + i * 0.08}s both` }}>
                        <span className={`inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full mb-3 ${s.difficulty === "Simple" ? "badge-green" : s.difficulty === "Medium" ? "badge-amber" : "badge-red"}`}>{s.difficulty}</span>
                        <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed group-hover:text-[var(--color-foreground)] transition-colors">{s.query}</p>
                        <p className="text-[10px] text-[var(--color-muted)] mt-2">{s.description}</p>
                      </button>
                    ))}
                  </div>

                  {suggestions.length > 3 && (
                    <div className="mt-5 flex flex-wrap gap-2 max-w-2xl justify-center" style={{ animation: "fade-in-up 0.5s 0.5s both" }}>
                      {suggestions.slice(3).map((s, i) => (
                        <button key={i} type="button" onClick={() => handleSubmit(s.query)} className="px-3.5 py-2 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[#22c55e]/20 hover:text-[#22c55e] transition-all">{s.query}</button>
                      ))}
                    </div>
                  )}

                  {uploadSuggestions.length > 0 && (
                    <div className="mt-8 w-full max-w-2xl">
                      <p className="text-xs font-semibold text-[var(--color-muted-foreground)] mb-2">Suggested for your dataset:</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        {uploadSuggestions.map((q, i) => (
                          <button key={i} type="button" onClick={() => handleSubmit(q)} className="px-3.5 py-2 text-xs rounded-lg border border-[#22c55e]/15 text-[#22c55e] hover:bg-[#22c55e]/5 transition-colors">{q}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {messages.map((msg) => {
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end animate-[slide-in-right_0.3s]">
                    <div className="max-w-[75%] flex items-start gap-3">
                      <div>
                        <div className="bg-[#22c55e] text-white rounded-2xl rounded-tr-sm px-5 py-3 shadow-lg shadow-[#22c55e]/10"><p className="text-sm leading-relaxed">{msg.query}</p></div>
                        <p className="text-[9px] text-[var(--color-muted)] text-right mt-1 mr-1 font-mono tabular-nums">{new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                      </div>
                      <div className="w-8 h-8 rounded-xl bg-[#22c55e]/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <svg className="w-4 h-4 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" /></svg>
                      </div>
                    </div>
                  </div>
                );
              }
              const isLatest = msg.id === [...messages].reverse().find((m) => m.role === "assistant")?.id;
              return <AssistantBlock key={msg.id} message={msg} darkMode={darkMode} onDrillDown={handleSubmit} activeTable={activeTable} isLatest={!!isLatest} />;
            })}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="glass-header px-6 py-3 print-hidden">
          <ChatInput onSubmit={handleSubmit} loading={loading} suggestions={suggestions} followUps={[...followUps, ...uploadSuggestions]} activeTable={activeTable} inputRef={chatInputRef} />
        </div>
      </main>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* EXPORT                                                            */
/* ══════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  return (
    <ThemeProvider>
      <DashboardInner />
    </ThemeProvider>
  );
}
