"use client";
import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TableInfo } from "@/types";

interface Props {
  tables: TableInfo[];
  activeTable: string;
  onSwitch: (name: string) => void;
  onDelete: (name: string) => void;
}

export default function DatasetSwitcher({ tables, activeTable, onSwitch, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activeInfo = tables.find((t) => t.name === activeTable);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/20 dark:border-[#2a2a3a]/50 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1a1a25]/80 transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" />
        </svg>
        <span className="max-w-[120px] truncate">{activeTable}</span>
        {activeInfo && <span className="text-[10px] text-slate-400">({activeInfo.row_count.toLocaleString()})</span>}
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-1 w-72 bg-white/90 dark:bg-[#1a1a25]/90 backdrop-blur-md border border-white/20 dark:border-[#2a2a3a]/50 rounded-lg shadow-xl z-50 overflow-hidden"
          >
            <div className="p-2 border-b border-white/20 dark:border-[#2a2a3a]/50">
              <p className="text-[10px] font-medium text-slate-400 px-2">Available datasets</p>
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {tables.map((t) => {
                const isActive = t.name === activeTable;
                const isProtected = t.name === "youtube_data";

                return (
                  <div
                    key={t.name}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#22c55e]/20 dark:bg-[#22c55e]/30 border border-[#22c55e]/50 dark:border-[#22c55e]/70"
                        : "hover:bg-slate-50 dark:hover:bg-[#22222e]/80"
                    }`}
                    onClick={() => {
                      onSwitch(t.name);
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isActive ? (
                        <svg className="w-4 h-4 text-[#22c55e] flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        </svg>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-300 dark:border-[#2a2a3a] flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p
                          className={`text-xs font-medium truncate ${
                            isActive
                              ? "text-[#16a34a] dark:text-[#22c55e]"
                              : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {t.name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {t.row_count.toLocaleString()} rows · {t.column_count} cols
                        </p>
                      </div>
                    </div>

                    {!isProtected && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Delete "${t.name}"?`)) onDelete(t.name);
                        }}
                        className="p-1 rounded hover:bg-rose-100 dark:hover:bg-rose-900/30 text-slate-400 hover:text-rose-500 flex-shrink-0 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}