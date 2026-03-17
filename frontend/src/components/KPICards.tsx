"use client";
import React, { useEffect, useRef, useState } from "react";
import type { KPI } from "@/types";

/* ══════════════════════════════════════════════════════════════════ */
/* ANIMATED COUNTER HOOK                                             */
/* ══════════════════════════════════════════════════════════════════ */
function useAnimatedCounter(target: string, duration = 800) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    if (prevRef.current === target) return;
    prevRef.current = target;

    const numMatch = target.match(/^([\d,.]+)/);
    if (!numMatch) { setDisplay(target); return; }

    const suffix = target.replace(numMatch[0], "");
    const endVal = parseFloat(numMatch[0].replace(/,/g, ""));
    if (isNaN(endVal)) { setDisplay(target); return; }

    const startTime = performance.now();
    const isDecimal = numMatch[0].includes(".");
    const decimalPlaces = isDecimal ? (numMatch[0].split(".")[1]?.length || 0) : 0;

    function step(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentVal = eased * endVal;

      if (isDecimal) {
        setDisplay(currentVal.toFixed(decimalPlaces) + suffix);
      } else {
        setDisplay(Math.round(currentVal).toLocaleString() + suffix);
      }

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setDisplay(target);
      }
    }
    requestAnimationFrame(step);
  }, [target, duration]);

  return display;
}

/* ══════════════════════════════════════════════════════════════════ */
/* MINI SPARKLINE SVG                                                */
/* ══════════════════════════════════════════════════════════════════ */
function MiniSparkline({ trend_direction }: { trend_direction: string }) {
  const isUp = trend_direction === "up";
  const isDown = trend_direction === "down";
  const color = isUp ? "#22c55e" : isDown ? "#ef4444" : "#3f3f4a";

  const points = isUp
    ? "2,18 6,14 10,16 14,10 18,12 22,6 26,8 30,4"
    : isDown
    ? "2,4 6,8 10,6 14,12 18,10 22,16 26,14 30,18"
    : "2,11 6,12 10,10 14,11 18,10 22,12 26,11 30,10";

  return (
    <svg
      width="32"
      height="22"
      viewBox="0 0 32 22"
      fill="none"
      className="opacity-30 group-hover:opacity-60 transition-opacity duration-500"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`spark-${trend_direction}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${points} 30,22 2,22`} fill={`url(#spark-${trend_direction})`} />
      <polyline
        points={points}
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ strokeDasharray: 100, strokeDashoffset: 100, animation: "dash-flow 1s ease-out forwards" }}
      />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* TREND ICON                                                        */
/* ══════════════════════════════════════════════════════════════════ */
function TrendIcon({ direction }: { direction: string }) {
  if (direction === "up") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
    );
  }
  if (direction === "down") {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6 9 12.75l4.286-4.286a11.948 11.948 0 0 1 4.306 6.43l.776 2.898m0 0 3.182-5.511m-3.182 5.51-5.511-3.181" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* KPI ICON                                                          */
/* ══════════════════════════════════════════════════════════════════ */
function KPIIcon({ icon, index }: { icon: string; index: number }) {
  const colors = [
    { text: "text-[#22c55e]", bg: "bg-[#22c55e]/10" },
    { text: "text-[#3b82f6]", bg: "bg-[#3b82f6]/10" },
    { text: "text-[#8b5cf6]", bg: "bg-[#8b5cf6]/10" },
    { text: "text-[#f59e0b]", bg: "bg-[#f59e0b]/10" },
    { text: "text-[#ec4899]", bg: "bg-[#ec4899]/10" },
    { text: "text-[#06b6d4]", bg: "bg-[#06b6d4]/10" },
  ];
  const c = colors[index % colors.length];

  const iconPaths: Record<string, string> = {
    "eye": "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    "users": "M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z",
    "bar-chart": "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
    "chart-bar": "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z",
    "currency": "M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "clock": "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    "heart": "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z",
    "fire": "M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z",
    "star": "M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z",
    "globe": "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  };

  const path = iconPaths[icon] || iconPaths["bar-chart"];

  return (
    <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
      <svg className={`w-4 h-4 ${c.text}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={path} />
      </svg>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* KPI CARD                                                          */
/* ══════════════════════════════════════════════════════════════════ */
function KPICard({ kpi, index }: { kpi: KPI; index: number }) {
  const animatedValue = useAnimatedCounter(kpi.value, 900);
  const isUp = kpi.trend_direction === "up";
  const isDown = kpi.trend_direction === "down";

  const trendColors = isUp
    ? "text-[#22c55e] bg-[#22c55e]/8"
    : isDown
    ? "text-[var(--color-destructive)] bg-[var(--color-destructive)]/8"
    : "text-[var(--color-muted-foreground)] bg-[var(--color-muted)]/20";

  const accentGradients = [
    "from-[#22c55e]/20 to-[#22c55e]/0",
    "from-[#3b82f6]/20 to-[#3b82f6]/0",
    "from-[#8b5cf6]/20 to-[#8b5cf6]/0",
    "from-[#f59e0b]/20 to-[#f59e0b]/0",
    "from-[#ec4899]/20 to-[#ec4899]/0",
    "from-[#06b6d4]/20 to-[#06b6d4]/0",
  ];
  const accentGrad = accentGradients[index % accentGradients.length];

  const lineColors = ["#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899", "#06b6d4"];
  const lineColor = lineColors[index % lineColors.length];

  return (
    <div
      className="group glass-card glass-card-hover relative overflow-hidden"
      style={{ animation: `fade-in-up 0.5s ${index * 0.08}s both` }}
      role="article"
      aria-label={`${kpi.label}: ${kpi.value}`}
    >
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-[2px] opacity-50 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `linear-gradient(90deg, transparent, ${lineColor}60, transparent)` }}
      />

      {/* Hover glow */}
      <div className={`absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br ${accentGrad} opacity-0 group-hover:opacity-100 transition-all duration-700 blur-2xl pointer-events-none`} />

      {/* Sparkline background */}
      <div className="absolute bottom-2 right-3 pointer-events-none">
        <MiniSparkline trend_direction={kpi.trend_direction} />
      </div>

      {/* Content */}
      <div className="relative z-10 p-4">
        <div className="flex items-start justify-between mb-3">
          <KPIIcon icon={kpi.icon} index={index} />
          {kpi.trend && (
            <div className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${trendColors} transition-all duration-300 group-hover:scale-105`}>
              <TrendIcon direction={kpi.trend_direction} />
              {kpi.trend}
            </div>
          )}
        </div>

        <p className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-[0.1em] mb-1">
          {kpi.label}
        </p>

        <p
          className="text-[1.65rem] font-bold text-[var(--color-foreground)] kpi-value leading-none"
          style={{ animation: `counter-pop 0.5s ${0.15 + index * 0.08}s both` }}
        >
          {animatedValue}
        </p>

        {/* Hover progress bar */}
        <div className="mt-3 h-1 bg-[var(--color-surface-3)] rounded-full overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity duration-500">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: isUp ? "75%" : isDown ? "35%" : "50%",
              background: lineColor,
              animation: "width-expand 0.8s ease-out forwards",
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* MAIN EXPORT                                                       */
/* ══════════════════════════════════════════════════════════════════ */
export default function KPICards({ kpis }: { kpis: KPI[] }) {
  if (!kpis.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="region" aria-label="Key metrics">
      {kpis.map((kpi, i) => (
        <KPICard key={i} kpi={kpi} index={i} />
      ))}
    </div>
  );
}