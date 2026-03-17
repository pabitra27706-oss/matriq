"use client";
import React from "react";
import { toPng } from "html-to-image";

interface Props {
  chartRef: React.RefObject<HTMLDivElement | null>;
  data: Record<string, unknown>[];
  title: string;
}

export default function ExportButtons({ chartRef, data, title }: Props) {
  const safeName = title.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 50);

  const exportPNG = async () => {
    if (!chartRef.current) return;
    try {
      const url = await toPng(chartRef.current, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
      });
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName + ".png";
      a.click();
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  };

  const exportCSV = () => {
    if (!data.length) return;
    const cols = Object.keys(data[0]);
    const header = cols.join(",");
    const rows = data.map((r) =>
      cols
        .map((c) => {
          const v = r[c];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = safeName + ".csv";
    a.click();
  };

  return (
    <div className="flex gap-1.5">
      <button
        onClick={exportPNG}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-[#22222e] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2a2a3a] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
          />
        </svg>
        PNG
      </button>
      <button
        onClick={exportCSV}
        className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium rounded-md bg-slate-100 dark:bg-[#22222e] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2a2a3a] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
        CSV
      </button>
    </div>
  );
}