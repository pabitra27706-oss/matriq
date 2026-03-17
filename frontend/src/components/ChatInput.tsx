"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Suggestion } from "@/types";

interface Props {
  onSubmit: (q: string) => void;
  loading: boolean;
  suggestions: Suggestion[];
  followUps: string[];
  activeTable?: string;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
}

function CharCounter({ current, max }: { current: number; max: number }) {
  const pct = (current / max) * 100;
  const isNear = pct > 75;
  const isOver = pct > 95;
  if (current === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <svg width="14" height="14" viewBox="0 0 14 14">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="var(--color-surface-3)" strokeWidth="1.5" />
        <circle cx="7" cy="7" r="5.5" fill="none" stroke={isOver ? "#ef4444" : isNear ? "#f59e0b" : "rgba(34,197,94,0.4)"} strokeWidth="1.5" strokeDasharray={`${2 * Math.PI * 5.5}`} strokeDashoffset={`${2 * Math.PI * 5.5 * (1 - Math.min(pct / 100, 1))}`} strokeLinecap="round" transform="rotate(-90 7 7)" className="transition-all duration-300" />
      </svg>
      <span className={`text-[9px] font-mono tabular-nums ${isOver ? "text-[var(--color-destructive)]" : isNear ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"}`}>{current}</span>
    </div>
  );
}

function VoiceWaveform() {
  return (
    <div className="flex items-center gap-[3px] h-4">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="w-[3px] rounded-full bg-[#22c55e]" style={{ height: "100%", animation: `typing-bounce 0.8s ${i * 0.1}s infinite ease-in-out`, transformOrigin: "bottom" }} />
      ))}
    </div>
  );
}

export default function ChatInput({ onSubmit, loading, suggestions, followUps, activeTable, inputRef: externalRef }: Props) {
  const [value, setValue] = useState("");
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = externalRef || internalRef;
  const lastSubmitTime = useRef(0);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const MAX_CHARS = 1000;

  useEffect(() => {
    textareaRef.current?.focus();
    if (typeof window !== "undefined") setVoiceSupported(!!(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, [textareaRef]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }
  }, [value, textareaRef]);

  const startListening = useCallback(() => {
    if (!voiceSupported) return;
    try {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!Ctor) return;
      const r = new Ctor();
      r.continuous = false; r.interimResults = true; r.lang = "en-US";
      r.onstart = () => setIsListening(true);
      r.onend = () => setIsListening(false);
      r.onresult = (ev: SpeechRecognitionEvent) => { let t = ""; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; setValue(t); };
      r.onerror = () => setIsListening(false);
      recognitionRef.current = r; r.start();
    } catch { setIsListening(false); }
  }, [voiceSupported]);

  const stopListening = useCallback(() => { try { recognitionRef.current?.stop(); } catch {} setIsListening(false); }, []);

  const doSubmit = useCallback((overrideQuery?: string) => {
    const q = (overrideQuery || value).trim();
    if (!q || loading || q.length > MAX_CHARS) return;
    const now = Date.now();
    if (now - lastSubmitTime.current < 400) return;
    lastSubmitTime.current = now;
    onSubmit(q);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [value, loading, onSubmit, textareaRef]);

  const handleKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); doSubmit(); }
  }, [doSubmit]);

  const handleChipClick = useCallback((query: string) => {
    if (loading) return;
    onSubmit(query);
    setValue("");
  }, [loading, onSubmit]);

  const handleSendClick = useCallback(() => { doSubmit(); }, [doSubmit]);

  const chips = followUps.length > 0 ? followUps : suggestions.slice(0, 4).map(s => s.query);
  const placeholder = activeTable ? `Ask about ${activeTable}…` : "Ask anything about your data…";
  const canSend = value.trim().length > 0 && !loading;

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3" role="list" aria-label="Suggestions">
          {chips.map((c, i) => (
            <button key={i} type="button" role="listitem" onClick={() => handleChipClick(c)} disabled={loading}
              className="group/chip flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[#22c55e]/30 hover:text-[#22c55e] hover:bg-[#22c55e]/[0.04] transition-all duration-200 truncate max-w-[320px] disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.97]"
              style={{ animation: `fade-in-up 0.3s ${i * 0.06}s both` }}>
              <svg className="w-3 h-3 flex-shrink-0 opacity-40 group-hover/chip:opacity-100 group-hover/chip:text-[#22c55e] transition-all" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
              <span className="truncate">{c.length > 55 ? c.slice(0, 52) + "…" : c}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className={`relative glass-input rounded-xl transition-all duration-300 ${isFocused ? "border-[#22c55e]/20 shadow-[0_0_0_3px_rgba(34,197,94,0.05)]" : ""} ${isListening ? "border-[#22c55e]/40 shadow-[0_0_20px_rgba(34,197,94,0.1)]" : ""}`}>
        {isListening && <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-[#22c55e] to-transparent animate-[shimmer_1.5s_linear_infinite]" />}
        <div className="flex items-end gap-2 p-2">
          <textarea ref={textareaRef} value={value} onChange={e => { if (e.target.value.length <= MAX_CHARS) setValue(e.target.value); }} onKeyDown={handleKey} onFocus={() => setIsFocused(true)} onBlur={() => setIsFocused(false)} rows={1} placeholder={placeholder} disabled={loading} aria-label="Query input"
            className="flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]/50 focus:outline-none leading-relaxed max-h-[140px] disabled:opacity-50" style={{ minHeight: "42px" }} />
          <div className="flex items-center gap-1.5 pb-1">
            <CharCounter current={value.length} max={MAX_CHARS} />
            {voiceSupported && (
              <button type="button" onClick={isListening ? stopListening : startListening} disabled={loading}
                className={`relative p-2.5 rounded-lg transition-all duration-300 ${isListening ? "bg-[#22c55e] text-white shadow-lg shadow-[#22c55e]/25" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-3)]"} disabled:opacity-30 disabled:cursor-not-allowed`}
                aria-label={isListening ? "Stop recording" : "Start recording"}>
                {isListening && <span className="absolute inset-0 rounded-lg animate-[ring-ping_1.5s_ease-in-out_infinite]" />}
                <span className="relative z-10">
                  {isListening ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 0 1 7.5 5.25h9a2.25 2.25 0 0 1 2.25 2.25v9a2.25 2.25 0 0 1-2.25 2.25h-9a2.25 2.25 0 0 1-2.25-2.25v-9Z" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4m-4 0h8" /></svg>
                  )}
                </span>
              </button>
            )}
            <button type="button" onClick={handleSendClick} disabled={!canSend}
              className="p-2.5 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-[var(--color-surface-3)] text-white disabled:text-[var(--color-muted)] transition-all duration-200 shadow-md shadow-[#22c55e]/15 hover:shadow-lg hover:shadow-[#22c55e]/25 disabled:shadow-none active:scale-95 disabled:cursor-not-allowed"
              aria-label="Send message">
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5" /></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Voice indicator */}
      {isListening && (
        <div className="flex items-center justify-center gap-3 mt-3 py-2 px-4 rounded-lg bg-[#22c55e]/5 border border-[#22c55e]/15 animate-[fade-in_0.3s]">
          <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#22c55e]" /></span>
          <VoiceWaveform />
          <p className="text-[11px] text-[#22c55e] font-semibold">Listening — speak now…</p>
          <button type="button" onClick={stopListening} className="ml-auto text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] font-medium transition-colors">Cancel</button>
        </div>
      )}

      {/* Keyboard hints */}
      <div className="flex items-center justify-center gap-4 mt-2.5">
        <span className="text-[10px] text-[var(--color-muted)]/50 flex items-center gap-1.5">
          <kbd className="inline-flex items-center justify-center h-[18px] px-1.5 rounded bg-[var(--color-surface-3)] font-mono text-[9px] border border-[var(--color-border)] text-[var(--color-muted-foreground)]">↵</kbd><span>send</span>
        </span>
        <span className="text-[10px] text-[var(--color-muted)]/50 flex items-center gap-1.5">
          <kbd className="inline-flex items-center justify-center h-[18px] px-1.5 rounded bg-[var(--color-surface-3)] font-mono text-[9px] border border-[var(--color-border)] text-[var(--color-muted-foreground)]">⇧↵</kbd><span>newline</span>
        </span>
        <span className="text-[10px] text-[var(--color-muted)]/50 flex items-center gap-1.5">
          <kbd className="inline-flex items-center justify-center h-[18px] px-1.5 rounded bg-[var(--color-surface-3)] font-mono text-[9px] border border-[var(--color-border)] text-[var(--color-muted-foreground)]">⌘K</kbd><span>focus</span>
        </span>
      </div>
    </div>
  );
}