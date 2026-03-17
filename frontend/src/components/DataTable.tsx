"use client";
import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  data: Record<string, unknown>[];
  visible: boolean;
  onToggle: () => void;
}

const PAGE_SIZE = 20;

export default function DataTable({ data, visible, onToggle }: Props) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);

  const columns = useMemo(() => (data.length ? Object.keys(data[0]) : []), [data]);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const total = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (col: string) => {
    if (sortKey === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(col);
      setSortAsc(true);
    }
    setPage(0);
  };

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-[#22c55e] dark:hover:text-[#4ade80] transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M13.125 12h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125M20.625 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5M12 14.625v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 14.625c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125"
          />
        </svg>
        {visible ? "Hide" : "Show"} raw data ({data.length.toLocaleString()} rows)
      </button>

      <AnimatePresence>
        {visible && data.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-lg border border-white/20 dark:border-[#2a2a3a]/50 overflow-hidden"
          >
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/80 dark:bg-[#111118]/80 backdrop-blur-sm sticky top-0 z-10">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col}
                        onClick={() => toggleSort(col)}
                        className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400 cursor-pointer hover:bg-slate-100 dark:hover:bg-[#1a1a25] select-none whitespace-nowrap"
                      >
                        {col} {sortKey === col ? (sortAsc ? "↑" : "↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row, ri) => (
                    <tr
                      key={ri}
                      className="border-t border-white/20 dark:border-[#2a2a3a]/50 hover:bg-slate-50/80 dark:hover:bg-[#16161f]/80 transition-colors"
                    >
                      {columns.map((col) => (
                        <td
                          key={col}
                          className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap font-mono"
                        >
                          {row[col] != null ? String(row[col]) : "-"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > 1 && (
              <div className="flex items-center justify-between px-4 py-2 bg-slate-50/80 dark:bg-[#111118]/80 backdrop-blur-sm border-t border-white/20 dark:border-[#2a2a3a]/50">
                <span className="text-[10px] text-slate-500">
                  Page {page + 1} of {total}
                </span>
                <div className="flex gap-1">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(page - 1)}
                    className="px-2 py-1 text-[10px] rounded bg-slate-200 dark:bg-[#22222e] text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-[#2a2a3a] transition-colors"
                  >
                    Prev
                  </button>
                  <button
                    disabled={page >= total - 1}
                    onClick={() => setPage(page + 1)}
                    className="px-2 py-1 text-[10px] rounded bg-slate-200 dark:bg-[#22222e] text-slate-600 dark:text-slate-300 disabled:opacity-30 hover:bg-slate-300 dark:hover:bg-[#2a2a3a] transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}