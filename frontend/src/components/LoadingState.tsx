"use client";
import React, { useState, useEffect, useMemo } from "react";

const STEPS = [
  { label: "Understanding your question", detail: "Parsing intent and entities", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" /></svg>, color: "#22c55e" },
  { label: "Generating SQL query", detail: "Building optimized query", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" /></svg>, color: "#3b82f6" },
  { label: "Executing database query", detail: "Scanning millions of records", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>, color: "#8b5cf6" },
  { label: "Building visualizations", detail: "Charts, KPIs and insights", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>, color: "#f59e0b" },
];
const FACTS = ["Processing over 1M data points…", "Optimizing query performance…", "Applying AI analysis…", "Cross-referencing patterns…", "Computing statistics…"];

function ProgressRing({ progress, size = 72 }: { progress: number; size?: number }) {
  const sw = 3; const r = (size - sw * 2) / 2; const c = 2 * Math.PI * r; const off = c - (progress / 100) * c;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-surface-3)" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#22c55e" strokeWidth={sw} strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-300" style={{ filter: "drop-shadow(0 0 4px rgba(34,197,94,0.3))" }} />
      </svg>
      <div className="absolute inset-[6px]"><svg width={size-12} height={size-12} className="animate-[spin-slow_3s_linear_infinite]"><circle cx={(size-12)/2} cy={(size-12)/2} r={(size-16)/2} fill="none" stroke="rgba(34,197,94,0.15)" strokeWidth={1.5} strokeDasharray="6 8" /></svg></div>
      <div className="absolute inset-[10px]"><svg width={size-20} height={size-20} className="animate-[spin-reverse_5s_linear_infinite]"><circle cx={(size-20)/2} cy={(size-20)/2} r={(size-24)/2} fill="none" stroke="rgba(59,130,246,0.1)" strokeWidth={1} strokeDasharray="4 12" /></svg></div>
      <div className="absolute inset-0 flex items-center justify-center"><span className="text-sm font-bold text-[var(--color-foreground)] font-mono tabular-nums">{Math.round(progress)}%</span></div>
    </div>
  );
}

export default function LoadingState() {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [factIdx, setFactIdx] = useState(0);

  useEffect(() => { const t = [setTimeout(() => setStep(1), 1200), setTimeout(() => setStep(2), 3000), setTimeout(() => setStep(3), 5500)]; return () => t.forEach(clearTimeout); }, []);
  useEffect(() => { const iv = setInterval(() => { setPct(p => { if (step === 0) return Math.min(p+1.2, 25); if (step === 1) return Math.min(p+1.8, 55); if (step === 2) return Math.min(p+1.5, 80); return Math.min(p+0.6, 95); }); }, 80); return () => clearInterval(iv); }, [step]);
  useEffect(() => { const iv = setInterval(() => setElapsed(e => e + 0.1), 100); return () => clearInterval(iv); }, []);
  useEffect(() => { const iv = setInterval(() => setFactIdx(f => (f + 1) % FACTS.length), 3000); return () => clearInterval(iv); }, []);
  const fact = useMemo(() => FACTS[factIdx], [factIdx]);

  return (
    <div className="space-y-6 animate-[fade-in_0.4s]" role="status" aria-label="Loading">
      {/* Skeleton KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => (<div key={i} className="relative h-[100px] rounded-xl glass-card overflow-hidden" style={{ animation: `fade-in 0.3s ${i*0.08}s both` }}><div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#22c55e]/10 to-transparent" /><div className="p-4 space-y-3"><div className="w-8 h-8 rounded-lg skeleton" /><div className="w-16 h-3 rounded skeleton" /><div className="w-24 h-5 rounded skeleton" /></div><div className="absolute inset-0 shimmer-line" /></div>))}
      </div>

      {/* Main card */}
      <div className="glass-card rounded-xl overflow-hidden">
        <div className="h-0.5 bg-[var(--color-surface-2)]"><div className="h-full rounded-r-full transition-all duration-300" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #22c55e, #4ade80, #86efac)", boxShadow: "0 0 10px rgba(34,197,94,0.4)" }} /></div>
        <div className="p-8">
          <div className="min-h-[340px] bg-[var(--color-surface-1)] rounded-xl flex flex-col items-center justify-center gap-8 border border-[var(--color-border)]/50 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none overflow-hidden"><div className="absolute top-1/4 left-1/3 w-40 h-40 bg-[#22c55e]/[0.03] rounded-full blur-[60px] orb-1" /><div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-[#3b82f6]/[0.02] rounded-full blur-[60px] orb-2" /></div>
            <div className="relative z-10"><ProgressRing progress={pct} /></div>
            <div className="w-full max-w-md space-y-2 relative z-10 px-4">
              {STEPS.map((s, i) => { const isDone = i < step; const isActive = i === step; return (
                <div key={i} className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-500 ${isActive ? "bg-[var(--color-surface-3)]/80 border border-[var(--color-border)] shadow-sm" : isDone ? "opacity-40" : "opacity-15"}`} style={{ animation: isActive ? "scale-in 0.3s ease-out" : "none" }}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${isDone ? "bg-[#22c55e] text-white shadow-sm shadow-[#22c55e]/30" : isActive ? "border-2 text-[var(--color-foreground)] animate-[ring-ping_2s_infinite]" : "border border-[var(--color-border)] text-[var(--color-muted)]"}`} style={{ borderColor: isActive ? s.color : undefined, color: isActive ? s.color : undefined }}>
                    {isDone ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <span className="text-current">{s.icon}</span>}
                  </div>
                  <div className="flex-1 min-w-0"><span className={`text-xs font-semibold ${isActive ? "text-[var(--color-foreground)]" : "text-[var(--color-muted-foreground)]"}`}>{s.label}</span>{isActive && <p className="text-[10px] text-[var(--color-muted)] mt-0.5 animate-[fade-in_0.3s]">{s.detail}</p>}</div>
                  {isActive && <div className="flex gap-1 flex-shrink-0"><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color }} /><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color, animationDelay: "0.15s" }} /><span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: s.color, animationDelay: "0.3s" }} /></div>}
                </div>
              ); })}
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <span className="mono-sm text-[var(--color-muted)]">{elapsed.toFixed(1)}s</span>
              <div className="w-px h-3 bg-[var(--color-border)]" />
              <span className="text-[10px] text-[var(--color-muted)] animate-[fade-in_0.5s]" key={factIdx}>{fact}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Skeleton chart */}
      <div className="glass-card rounded-xl overflow-hidden" style={{ animation: "fade-in 0.4s 0.3s both" }}>
        <div className="h-px bg-gradient-to-r from-transparent via-[#22c55e]/10 to-transparent" />
        <div className="p-5">
          <div className="flex items-center justify-between mb-4"><div className="space-y-2"><div className="w-32 h-4 rounded skeleton" /><div className="w-20 h-3 rounded skeleton" /></div><div className="flex gap-1.5">{[0,1,2].map(i => <div key={i} className="w-10 h-6 rounded skeleton" />)}</div></div>
          <div className="h-[280px] rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)]/30 relative overflow-hidden">
            <div className="absolute bottom-8 left-12 right-8 flex items-end gap-3 h-[200px]">{[65,80,45,90,55,75,40,85,60,70].map((h, i) => <div key={i} className="flex-1 rounded-t skeleton" style={{ height: `${h}%`, animation: `fade-in-up 0.4s ${0.5+i*0.05}s both` }} />)}</div>
            <div className="absolute inset-0 shimmer-line" />
          </div>
        </div>
      </div>

      {/* Skeleton insight */}
      <div className="glass-card rounded-xl p-5 relative overflow-hidden" style={{ animation: "fade-in 0.4s 0.5s both" }}>
        <div className="flex items-start gap-3"><div className="w-10 h-10 rounded-xl skeleton" /><div className="flex-1 space-y-2.5"><div className="w-24 h-3 rounded skeleton" /><div className="w-full h-3 rounded skeleton" /><div className="w-3/4 h-3 rounded skeleton" /><div className="w-1/2 h-3 rounded skeleton" /></div></div>
        <div className="absolute inset-0 shimmer-line rounded-xl" />
      </div>
    </div>
  );
}