"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  insight: string;
  sql: string;
  executionTime: number;
  confidence?: string | null;
  assumptions?: string[];
}

/* ── SQL Syntax Highlight ── */
function highlightSQL(sql: string): React.ReactNode[] {
  const keywords = /\b(SELECT|FROM|WHERE|AND|OR|GROUP\s+BY|ORDER\s+BY|HAVING|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|IN|NOT|NULL|IS|BETWEEN|LIKE|LIMIT|OFFSET|COUNT|SUM|AVG|MIN|MAX|DISTINCT|CASE|WHEN|THEN|ELSE|END|UNION|ALL|strftime|ROUND|ABS|TOTAL|DESC|ASC|CAST|COALESCE|IFNULL|LENGTH|UPPER|LOWER|TRIM|REPLACE|SUBSTR)\b/gi;
  const strings = /('[^']*')/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(`(${keywords.source})|(${strings.source})|(${numbers.source})`, "gi");
  let match: RegExpExecArray | null;
  while ((match = combined.exec(sql)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`t${lastIndex}`} className="text-[var(--color-muted-foreground)]">{sql.slice(lastIndex, match.index)}</span>);
    }
    const text = match[0];
    if (match[1]) parts.push(<span key={`k${match.index}`} className="text-[#22c55e] font-semibold">{text}</span>);
    else if (match[2]) parts.push(<span key={`s${match.index}`} className="text-[#f59e0b]">{text}</span>);
    else if (match[3]) parts.push(<span key={`n${match.index}`} className="text-[#3b82f6]">{text}</span>);
    lastIndex = match.index + text.length;
  }
  if (lastIndex < sql.length) parts.push(<span key={`e${lastIndex}`} className="text-[var(--color-muted-foreground)]">{sql.slice(lastIndex)}</span>);
  return parts;
}

/* ── Confidence Bar ── */
function ConfidenceBar({ level }: { level: string }) {
  const filled = level === "high" ? 5 : level === "medium" ? 3 : 1;
  const color = level === "high" ? "#22c55e" : level === "medium" ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-1 mt-2" aria-label={`Confidence: ${level}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-500" style={{ background: i < filled ? color : "var(--color-surface-3)", opacity: i < filled ? 1 : 0.4 }} />
      ))}
    </div>
  );
}

/* ── Main Component ── */
export default function InsightBox({ insight, sql, executionTime, confidence, assumptions }: Props) {
  const [showSQL, setShowSQL] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [lineCount, setLineCount] = useState(0);

  useEffect(() => { if (sql) setLineCount(sql.split("\n").length); }, [sql]);

  const copy = useCallback(() => { navigator.clipboard.writeText(sql); setCopied(true); setTimeout(() => setCopied(false), 2500); }, [sql]);

  if (!insight) return null;
  const isConv = !sql;

  const confBadge = confidence === "high"
    ? { text: "High", cls: "badge-green" }
    : confidence === "medium"
    ? { text: "Medium", cls: "badge-amber" }
    : confidence === "low"
    ? { text: "Low", cls: "badge-red" }
    : null;

  return (
    <div className="glass-card rounded-xl overflow-hidden group/insight transition-all duration-500" role="region" aria-label="AI Insight">
      {/* Top glow */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#22c55e]/25 to-transparent opacity-60 group-hover/insight:opacity-100 transition-opacity duration-500" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#22c55e]/[0.01] to-transparent opacity-0 group-hover/insight:opacity-100 transition-opacity duration-700 pointer-events-none rounded-xl" />

      <div className="relative p-5">
        <div className="flex items-start gap-3.5">
          {/* Icon */}
          <div className="p-2.5 rounded-xl bg-[#22c55e]/8 border border-[#22c55e]/10 flex-shrink-0 group-hover/insight:bg-[#22c55e]/12 transition-colors duration-300">
            {isConv ? (
              <svg className="w-5 h-5 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg>
            ) : (
              <svg className="w-5 h-5 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" /></svg>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="status-dot" />
                <span className="text-xs font-bold text-[#22c55e] tracking-wide">MATRIQ</span>
              </div>
              {executionTime > 0 && !isConv && (
                <span className="badge badge-gray mono-sm">
                  <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>
                  {executionTime}s
                </span>
              )}
              {confBadge && (
                <span className={`badge ${confBadge.cls}`}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                  {confBadge.text}
                </span>
              )}
              {sql && lineCount > 0 && (
                <span className="badge badge-gray mono-sm">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                  {lineCount} line{lineCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Confidence bar */}
            {confidence && <ConfidenceBar level={confidence} />}

            {/* Insight text */}
            <div className="mt-3 text-sm text-[var(--color-muted-foreground)] leading-[1.75] whitespace-pre-line">
              {insight.split("\n").map((line, i) => {
                if (line.startsWith("- ") || line.startsWith("• ")) {
                  return (
                    <div key={i} className="flex items-start gap-2 my-1 ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]/60 mt-2 flex-shrink-0" />
                      <span>{line.replace(/^[-•]\s*/, "")}</span>
                    </div>
                  );
                }
                return <p key={i} className={line ? "" : "h-2"}>{line}</p>;
              })}
            </div>

            {/* Low confidence warning */}
            {confidence === "low" && (
              <div className="mt-4 flex items-start gap-2.5 text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/5 rounded-lg px-4 py-3 border border-[var(--color-warning)]/10 animate-[fade-in_0.3s]">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></svg>
                <div>
                  <p className="font-semibold mb-0.5">Low Confidence</p>
                  <p className="opacity-80 leading-relaxed">Consider rephrasing with more specific terms or column names.</p>
                </div>
              </div>
            )}

            {/* Assumptions */}
            {assumptions && assumptions.length > 0 && (
              <div className="mt-4">
                <button type="button" onClick={() => setShowAssumptions(!showAssumptions)} className="group/btn flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] font-medium transition-colors" aria-expanded={showAssumptions}>
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showAssumptions ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  <svg className="w-3.5 h-3.5 opacity-60 group-hover/btn:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" /></svg>
                  {assumptions.length} assumption{assumptions.length > 1 ? "s" : ""} made
                </button>
                {showAssumptions && (
                  <div className="mt-2.5 space-y-1.5 pl-1 animate-[fade-in-up_0.25s_ease-out]">
                    {assumptions.map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[var(--color-muted-foreground)] py-1.5 px-3 rounded-lg bg-[var(--color-surface-2)] border border-[var(--color-border)]/50" style={{ animation: `fade-in-up 0.2s ${i * 0.05}s both` }}>
                        <span className="text-[var(--color-muted)] mt-0.5 mono-sm">{i + 1}.</span>
                        <span className="leading-relaxed">{a}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SQL toggle */}
            {sql && (
              <div className="mt-4">
                <button type="button" onClick={() => setShowSQL(!showSQL)} className="group/sql flex items-center gap-1.5 text-xs text-[#22c55e] hover:text-[#4ade80] font-semibold transition-colors" aria-expanded={showSQL}>
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showSQL ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>
                  {showSQL ? "Hide SQL Query" : "View SQL Query"}
                </button>
              </div>
            )}

            {/* SQL code block */}
            {showSQL && sql && (
              <div className="mt-3 relative group/code rounded-xl overflow-hidden border border-[var(--color-border)] animate-[scale-in_0.2s_ease-out]">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-2 bg-[var(--color-surface-2)] border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-destructive)]/40" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-warning)]/40" />
                      <div className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/40" />
                    </div>
                    <span className="text-[10px] text-[var(--color-muted)] font-mono ml-2">SQL · SQLite</span>
                  </div>
                  <button type="button" onClick={copy} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] rounded-md bg-[var(--color-surface-3)] hover:bg-[var(--color-surface-4)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] font-medium transition-all opacity-0 group-hover/code:opacity-100">
                    {copied ? (
                      <><svg className="w-3 h-3 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>Copied!</>
                    ) : (
                      <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>Copy</>
                    )}
                  </button>
                </div>
                {/* Code body with line numbers */}
                <div className="relative">
                  <div className="absolute left-0 top-0 bottom-0 w-10 bg-[var(--color-surface-1)] border-r border-[var(--color-border)]/50 flex flex-col pt-4 pb-4">
                    {sql.split("\n").map((_, i) => (
                      <span key={i} className="text-[10px] text-[var(--color-muted)]/40 text-right pr-2 leading-[1.65rem] select-none font-mono">{i + 1}</span>
                    ))}
                  </div>
                  <pre className="bg-[var(--color-surface-1)] pl-14 pr-4 py-4 text-xs overflow-x-auto font-mono whitespace-pre-wrap leading-[1.65rem] max-h-[300px] overflow-y-auto">
                    <code>{highlightSQL(sql)}</code>
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}