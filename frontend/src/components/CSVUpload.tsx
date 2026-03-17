"use client";
import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { uploadCSV, uploadPreview } from "@/services/api";
import type { UploadPreview } from "@/types";

const MAX_SIZE = 100 * 1024 * 1024; // ← CHANGED FROM 50 TO 100

interface Props {
  onUploadDone: (tableName: string, suggestedQuestions?: string[]) => void;
}

export default function CSVUpload({ onUploadDone }: Props) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<UploadPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setFile(null);
    setError("");
    setDone(false);
    setProgress(0);
    setLoadingPreview(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setError("");
    setPreview(null);

    // ── UPDATED: Accept .csv .tsv .txt ──
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    const allowedExts = ["csv", "tsv", "txt"];
    if (!allowedExts.includes(ext)) {
      setError("Only .csv, .tsv, and .txt files are allowed.");
      return;
    }

    if (f.size > MAX_SIZE) {
      setError(`File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Maximum 100MB.`);
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

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError("");
    setProgress(0);

    const tName = file.name
      .replace(/\.(csv|tsv|txt)$/i, "")
      .replace(/[^\w]/g, "_");

    try {
      const r = await uploadCSV(file, tName, (p: number) => setProgress(p));
      if (r.success) {
        setDone(true);
        setTimeout(() => {
          onUploadDone(r.table_name, r.suggested_questions);
          setOpen(false);
          reset();
        }, 1200);
      } else {
        setError(r.error || "Upload failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const fmtSize = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-white/20 dark:border-[#2a2a3a]/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a1a25]/80 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
        Upload CSV
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white/90 dark:bg-[#1a1a25]/90 backdrop-blur-md rounded-xl p-6 w-full max-w-lg shadow-xl border border-white/20 dark:border-[#2a2a3a]/50 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Upload dataset
          </h3>
          <button
            onClick={() => { setOpen(false); reset(); }}
            className="p-1 hover:bg-slate-100 dark:hover:bg-[#22222e] rounded text-slate-400 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!preview && !loadingPreview && !done && (
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-white/20 dark:border-[#2a2a3a]/50 rounded-lg p-10 text-center cursor-pointer hover:border-[#22c55e]/50 dark:hover:border-[#22c55e]/70 transition-colors group"
          >
            <svg
              className="w-10 h-10 mx-auto mb-3 text-slate-300 dark:text-slate-600 group-hover:text-[#22c55e]/50 transition-colors"
              fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm text-slate-500 dark:text-slate-400">Click to select a file</p>
            <p className="text-[10px] text-slate-400 mt-1">CSV, TSV, or TXT — Max 100 MB</p>
          </div>
        )}

        {loadingPreview && (
          <div className="flex flex-col items-center py-10">
            <div className="w-8 h-8 border-[3px] border-transparent border-t-[#22c55e] rounded-full animate-spin mb-3"></div>
            <p className="text-xs text-slate-500">Loading preview...</p>
          </div>
        )}

        {preview && !done && (
          <div className="space-y-4">
            <div className="bg-slate-50/80 dark:bg-[#111118]/80 backdrop-blur-sm rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{preview.file_name}</p>
                <span className="text-[10px] text-slate-400">{fmtSize(preview.file_size)}</span>
              </div>
              <div className="flex gap-4 text-[10px] text-slate-500">
                <span>{preview.row_count.toLocaleString()} rows</span>
                <span>{preview.columns.length} columns</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Columns detected:</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.columns.map((col, i) => (
                  <span key={i} className="px-2 py-1 text-[10px] rounded bg-slate-100 dark:bg-[#22222e] text-slate-600 dark:text-slate-400">
                    {col.name} <span className="text-slate-400 dark:text-slate-500">({col.type})</span>
                  </span>
                ))}
              </div>
            </div>

            {preview.sample_rows.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Preview (first 5 rows)</p>
                <div className="overflow-x-auto rounded-md border border-white/20 dark:border-[#2a2a3a]/50">
                  <table className="w-full text-[10px]">
                    <thead className="bg-slate-50/80 dark:bg-[#111118]/80 backdrop-blur-sm">
                      <tr>
                        {preview.columns.map((col, i) => (
                          <th key={i} className="px-2 py-1.5 text-left font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {col.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample_rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-white/20 dark:border-[#2a2a3a]/50">
                          {preview.columns.map((col, ci) => (
                            <td key={ci} className="px-2 py-1 text-slate-700 dark:text-slate-300 whitespace-nowrap font-mono max-w-[150px] truncate">
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
              <div>
                <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                  <span>{progress < 100 ? "Uploading..." : "Processing..."}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-[#22222e] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#22c55e] to-[#16a34a] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={reset}
                disabled={uploading}
                className="flex-1 px-4 py-2 text-xs font-medium rounded-lg border border-white/20 dark:border-[#2a2a3a]/50 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#22222e]/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 px-4 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#15803d] text-white transition-all duration-300 disabled:opacity-50 shadow-md hover:shadow-lg hover:shadow-[#22c55e]/30"
              >
                {uploading ? "Uploading..." : "Confirm upload"}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className="text-center py-6">
            <svg className="w-10 h-10 mx-auto mb-3 text-[#22c55e]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm font-medium text-[#22c55e] dark:text-[#4ade80]">Upload complete</p>
          </div>
        )}

        {error && (
          <p className="mt-3 text-xs text-rose-600 bg-rose-50/80 dark:bg-rose-950/30 backdrop-blur-sm rounded-lg p-3">
            {error}
          </p>
        )}

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={handleSelect}
        />
      </motion.div>
    </motion.div>
  );
}