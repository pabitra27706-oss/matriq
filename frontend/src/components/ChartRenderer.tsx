"use client";
import React, { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine, Brush,
} from "recharts";
import type { ChartConfig } from "@/types";
import { useTheme } from "./ThemeProvider";

/* ══════════════════════════════════════════════════════════════════ */
/* COLOR PALETTE                                                     */
/* ══════════════════════════════════════════════════════════════════ */
const COLORS = [
  "#22c55e", "#3b82f6", "#8b5cf6", "#f59e0b",
  "#ef4444", "#06b6d4", "#ec4899", "#14b8a6",
  "#f97316", "#6366f1", "#84cc16", "#a855f7",
];

/* ══════════════════════════════════════════════════════════════════ */
/* THEME TOKENS                                                      */
/* ══════════════════════════════════════════════════════════════════ */
function getChartTheme(isDark: boolean) {
  return {
    grid: isDark ? "#1e1e2a" : "#e2e8f0",
    gridOpacity: isDark ? 0.6 : 0.8,
    axisColor: isDark ? "#94949e" : "#64748b",
    tooltipBg: isDark ? "rgba(12,14,22,0.95)" : "rgba(255,255,255,0.97)",
    tooltipBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    tooltipShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
    tooltipText: isDark ? "#f0f0f5" : "#0f172a",
    tooltipMuted: isDark ? "#94949e" : "#64748b",
    brushFill: isDark ? "#0a0a10" : "#f8fafc",
    brushStroke: "#22c55e",
    refLine: "#ef4444",
    cursorFill: isDark ? "rgba(34,197,94,0.04)" : "rgba(34,197,94,0.06)",
    pieSeparator: isDark ? "#050508" : "#ffffff",
    labelColor: isDark ? "#94949e" : "#64748b",
  };
}

/* ══════════════════════════════════════════════════════════════════ */
/* FORMATTERS                                                        */
/* ══════════════════════════════════════════════════════════════════ */
function fmt(v: unknown): string {
  if (typeof v !== "number") return String(v ?? "");
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toFixed(2);
}

function fmtFull(v: unknown): string {
  if (typeof v !== "number") return String(v ?? "");
  if (Number.isInteger(v)) return v.toLocaleString();
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ══════════════════════════════════════════════════════════════════ */
/* CUSTOM TOOLTIP                                                    */
/* ══════════════════════════════════════════════════════════════════ */
/* eslint-disable @typescript-eslint/no-explicit-any */
function CustomTooltip({ active, payload, label, theme }: any) {
  if (!active || !payload?.length) return null;
  const t = theme || getChartTheme(true);

  const total = payload.reduce((sum: number, p: any) => {
    return sum + (typeof p.value === "number" ? p.value : 0);
  }, 0);

  return (
    <div
      className="rounded-xl px-4 py-3 text-xs max-w-xs border"
      style={{
        background: t.tooltipBg,
        borderColor: t.tooltipBorder,
        boxShadow: t.tooltipShadow,
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 pb-2" style={{ borderBottom: `1px solid ${t.tooltipBorder}` }}>
        <svg className="w-3 h-3" style={{ color: t.tooltipMuted }} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
        </svg>
        <p className="font-semibold" style={{ color: t.tooltipText }}>{label}</p>
      </div>

      {/* Values */}
      <div className="space-y-1.5">
        {payload.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
              <span style={{ color: t.tooltipMuted }} className="truncate max-w-[120px]">{p.name}</span>
            </div>
            <span className="font-mono font-semibold tabular-nums" style={{ color: t.tooltipText }}>
              {fmtFull(p.value)}
            </span>
          </div>
        ))}
      </div>

      {/* Total if multiple series */}
      {payload.length > 1 && (
        <div className="mt-2 pt-2 flex items-center justify-between" style={{ borderTop: `1px solid ${t.tooltipBorder}` }}>
          <span className="font-medium" style={{ color: t.tooltipMuted }}>Total</span>
          <span className="font-mono font-bold tabular-nums" style={{ color: t.tooltipText }}>{fmtFull(total)}</span>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* CUSTOM LEGEND                                                     */
/* ══════════════════════════════════════════════════════════════════ */
function CustomLegend({ payload }: any) {
  if (!payload?.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 px-4">
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 group/legend cursor-default">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0 transition-transform group-hover/legend:scale-125" style={{ background: entry.color }} />
          <span className="text-[10px] text-[var(--color-muted-foreground)] group-hover/legend:text-[var(--color-foreground)] transition-colors font-medium">
            {entry.value?.replace(/_/g, " ")}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* PIVOT DATA                                                        */
/* ══════════════════════════════════════════════════════════════════ */
function pivotData(data: Record<string, any>[], xField: string, groupField: string, valueFields: string[]) {
  const map: Record<string, Record<string, any>> = {};
  const groups = new Set<string>();
  data.forEach((row) => {
    const x = String(row[xField] ?? "");
    const g = String(row[groupField] ?? "");
    groups.add(g);
    if (!map[x]) map[x] = { [xField]: x };
    valueFields.forEach((vf) => { map[x][g + "_" + vf] = row[vf]; });
  });
  const seriesKeys: string[] = [];
  groups.forEach((g) => valueFields.forEach((vf) => seriesKeys.push(g + "_" + vf)));
  return { pivoted: Object.values(map), seriesKeys };
}

/* ══════════════════════════════════════════════════════════════════ */
/* PIE LABEL                                                         */
/* ══════════════════════════════════════════════════════════════════ */
function renderPieLabel({ cx, cy, midAngle, outerRadius, name, percent }: any) {
  const RADIAN = Math.PI / 180;
  const radius = outerRadius + 25;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.03) return null;
  return (
    <text x={x} y={y} fill="var(--color-muted-foreground)" textAnchor={x > cx ? "start" : "end"} dominantBaseline="central" fontSize={10} fontWeight={500}>
      {name} ({(percent * 100).toFixed(0)}%)
    </text>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ══════════════════════════════════════════════════════════════════ */
/* EMPTY STATE                                                       */
/* ══════════════════════════════════════════════════════════════════ */
function EmptyChart() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3">
      <svg className="w-10 h-10 text-[var(--color-muted)]/20" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
      <p className="text-sm text-[var(--color-muted)]">No data to display</p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* MAIN COMPONENT                                                    */
/* ══════════════════════════════════════════════════════════════════ */
interface Props {
  data: Record<string, unknown>[];
  config: ChartConfig;
  darkMode: boolean;
  overrideChartType?: string;
  onDrillDown?: (xValue: string, xField: string) => void;
}

export default function ChartRenderer({ data, config, darkMode, overrideChartType, onDrillDown }: Props) {
  const { isDark } = useTheme();
  const actualDark = isDark || darkMode;
  const chartType = overrideChartType || config.chart_type;
  const theme = getChartTheme(actualDark);
  const axis = { fontSize: 11, fill: theme.axisColor, fontFamily: "Inter, system-ui, sans-serif" };
  const colors = config.colors?.length > 0 ? config.colors : COLORS;
  const showBrush = data.length > 15;
  const height = 400;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { displayData, seriesKeys } = useMemo(() => {
    const d = data as Record<string, any>[];
    if (config.group_by && d.length > 0 && config.group_by in d[0]) {
      const { pivoted, seriesKeys } = pivotData(d, config.x_axis, config.group_by, config.y_axis);
      return { displayData: pivoted, seriesKeys };
    }
    return { displayData: d, seriesKeys: config.y_axis };
  }, [data, config]);

  if (!displayData.length) return <EmptyChart />;

  const refLines = (config.annotations ?? []).map((a, i) => (
    <ReferenceLine key={"ann" + i} y={typeof a.value === "number" ? a.value : undefined} x={typeof a.value === "string" ? a.value : undefined} stroke={a.color || theme.refLine} strokeDasharray="4 4" strokeWidth={2} label={{ value: a.label || "", fill: theme.axisColor, fontSize: 10, position: "insideTopRight" }} />
  ));

  const commonGrid = { strokeDasharray: "3 3", stroke: theme.grid, strokeOpacity: theme.gridOpacity };
  const xAxisBase = { dataKey: config.x_axis, tick: axis, tickLine: { stroke: theme.grid, strokeWidth: 0.5 }, axisLine: { stroke: theme.grid, strokeWidth: 0.5 } };
  const yAxisBase = { tick: axis, tickFormatter: fmt, tickLine: false, axisLine: false, width: 60 };
  const brushBase = showBrush ? { dataKey: config.x_axis, height: 28, stroke: theme.brushStroke, fill: theme.brushFill, tickFormatter: () => "" } : null;

  const handleBarClick = (entry: any) => {
    if (onDrillDown && entry) {
      const val = entry[config.x_axis] ?? entry.name ?? entry.payload?.[config.x_axis];
      if (val != null) onDrillDown(String(val), config.x_axis);
    }
  };

  const tooltipProps = { content: <CustomTooltip theme={theme} /> };

  /* ── BAR ── */
  if (["bar", "grouped_bar", "stacked_bar"].includes(chartType)) {
    const stackId = chartType === "stacked_bar" ? "stack" : undefined;
    const needsAngle = displayData.length > 6;
    return (
      <div className="animate-[fade-in-up_0.5s]">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={displayData} margin={{ top: 20, right: 30, left: 10, bottom: needsAngle ? 70 : 40 }}>
            <defs>
              {seriesKeys.map((key, i) => (
                <linearGradient key={`bg-${key}`} id={`bar-g-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0.7} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...commonGrid} />
            <XAxis {...xAxisBase} angle={needsAngle ? -40 : 0} textAnchor={needsAngle ? "end" : "middle"} height={needsAngle ? 70 : 40} interval={displayData.length > 20 ? Math.floor(displayData.length / 15) : 0} />
            <YAxis {...yAxisBase} />
            <Tooltip {...tooltipProps} cursor={{ fill: theme.cursorFill }} />
            <Legend content={<CustomLegend />} />
            {refLines}
            {seriesKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={`url(#bar-g-${i})`} radius={[4, 4, 0, 0]} stackId={stackId} name={key.replace(/_/g, " ")} cursor={onDrillDown ? "pointer" : undefined} onClick={handleBarClick} animationDuration={800} animationEasing="ease-out" maxBarSize={60} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── LINE ── */
  if (chartType === "line") {
    const needsAngle = displayData.length > 8;
    return (
      <div className="animate-[fade-in-up_0.5s]">
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={displayData} margin={{ top: 20, right: 30, left: 10, bottom: needsAngle ? 70 : 40 }}>
            <defs>
              {seriesKeys.map((_, i) => (
                <filter key={`glow-${i}`} id={`lg-${i}`}><feGaussianBlur stdDeviation="2" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
              ))}
            </defs>
            <CartesianGrid {...commonGrid} />
            <XAxis {...xAxisBase} angle={needsAngle ? -40 : 0} textAnchor={needsAngle ? "end" : "middle"} height={needsAngle ? 70 : 40} />
            <YAxis {...yAxisBase} />
            <Tooltip {...tooltipProps} />
            <Legend content={<CustomLegend />} />
            {refLines}
            {config.y_label?.toLowerCase().includes("sentiment") && <ReferenceLine y={0} stroke={theme.refLine} strokeDasharray="6 3" strokeOpacity={0.5} />}
            {seriesKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2.5} dot={{ r: 3, fill: colors[i % colors.length], strokeWidth: 0 }} activeDot={{ r: 6, stroke: colors[i % colors.length], strokeWidth: 2, fill: theme.tooltipBg, filter: `url(#lg-${i})` }} name={key.replace(/_/g, " ")} animationDuration={1200} animationEasing="ease-out" />
            ))}
            {brushBase && <Brush {...brushBase} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── AREA ── */
  if (chartType === "area") {
    return (
      <div className="animate-[fade-in-up_0.5s]">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={displayData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
            <defs>
              {seriesKeys.map((key, i) => (
                <linearGradient key={`af-${key}`} id={`af-${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={0.2} />
                  <stop offset="50%" stopColor={colors[i % colors.length]} stopOpacity={0.05} />
                  <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid {...commonGrid} />
            <XAxis {...xAxisBase} />
            <YAxis {...yAxisBase} />
            <Tooltip {...tooltipProps} />
            <Legend content={<CustomLegend />} />
            {refLines}
            {seriesKeys.map((key, i) => (
              <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} fill={`url(#af-${i})`} strokeWidth={2} name={key.replace(/_/g, " ")} animationDuration={1000} animationEasing="ease-out" />
            ))}
            {brushBase && <Brush {...brushBase} />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── PIE / DONUT ── */
  if (["pie", "donut"].includes(chartType)) {
    const valKey = config.y_axis[0] || Object.keys(displayData[0]).find((k) => k !== config.x_axis) || "";
    const isDonut = chartType === "donut";
    const total = displayData.reduce((sum: number, row: any) => sum + (typeof row[valKey] === "number" ? row[valKey] : 0), 0);
    return (
      <div className="animate-[fade-in-up_0.5s]">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <defs>
              {displayData.map((_: any, i: number) => (
                <linearGradient key={`pg-${i}`} id={`pg-${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={colors[i % colors.length]} stopOpacity={1} />
                  <stop offset="100%" stopColor={colors[i % colors.length]} stopOpacity={0.75} />
                </linearGradient>
              ))}
            </defs>
            <Pie data={displayData} dataKey={valKey} nameKey={config.x_axis} cx="50%" cy="50%" outerRadius={150} innerRadius={isDonut ? 80 : 0} paddingAngle={displayData.length > 1 ? 2 : 0} label={renderPieLabel} labelLine={{ stroke: theme.labelColor, strokeWidth: 0.5, strokeDasharray: "3 3" }} animationDuration={1000} animationEasing="ease-out">
              {displayData.map((_: any, i: number) => <Cell key={i} fill={`url(#pg-${i})`} stroke={theme.pieSeparator} strokeWidth={2} />)}
            </Pie>
            {isDonut && <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill="var(--color-foreground)" fontSize={22} fontWeight={700} fontFamily="JetBrains Mono, monospace">{fmt(total)}</text>}
            {isDonut && <text x="50%" y="56%" textAnchor="middle" dominantBaseline="middle" fill="var(--color-muted-foreground)" fontSize={10} fontWeight={500}>Total</text>}
            <Tooltip {...tooltipProps} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  /* ── SCATTER ── */
  if (chartType === "scatter") {
    return (
      <div className="animate-[fade-in-up_0.5s]">
        <ResponsiveContainer width="100%" height={height}>
          <ScatterChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
            <CartesianGrid {...commonGrid} />
            <XAxis dataKey={config.x_axis} tick={axis} name={config.x_label || config.x_axis} tickLine={{ stroke: theme.grid }} axisLine={{ stroke: theme.grid }} />
            <YAxis dataKey={config.y_axis[0]} tick={axis} tickFormatter={fmt} name={config.y_label || config.y_axis[0]} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipProps} cursor={{ strokeDasharray: "3 3", stroke: "rgba(34,197,94,0.2)" }} />
            <Scatter data={displayData} fill={colors[0]} fillOpacity={0.7} animationDuration={800} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  /* ── FALLBACK ── */
  return (
    <div className="animate-[fade-in-up_0.5s]">
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={displayData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
          <CartesianGrid {...commonGrid} />
          <XAxis {...xAxisBase} />
          <YAxis {...yAxisBase} />
          <Tooltip {...tooltipProps} cursor={{ fill: theme.cursorFill }} />
          <Legend content={<CustomLegend />} />
          {seriesKeys.map((key, i) => <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} animationDuration={800} maxBarSize={60} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}