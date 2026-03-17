"use client";
import React, { useState, useMemo } from "react";
import type { Conversation } from "@/types";

/* ══════════════════════════════════════════════════════════════════ */
/* TYPES                                                             */
/* ══════════════════════════════════════════════════════════════════ */
interface ConvGroup {
  label: string;
  items: Conversation[];
}

/* ══════════════════════════════════════════════════════════════════ */
/* DATE GROUPING                                                     */
/* ══════════════════════════════════════════════════════════════════ */
function groupByDate(convs: Conversation[]): {
  pinned: Conversation[];
  groups: ConvGroup[];
  archived: Conversation[];
} {
  const now = new Date();
  const todayS = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayS = new Date(todayS.getTime() - 86400000);
  const weekS = new Date(todayS.getTime() - 7 * 86400000);
  const monthS = new Date(todayS.getTime() - 30 * 86400000);

  const pinned = convs.filter((c) => c.isPinned && !c.isArchived);
  const archived = convs.filter((c) => c.isArchived);
  const active = convs
    .filter((c) => !c.isPinned && !c.isArchived)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

  const buckets: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    "Previous 7 days": [],
    "Previous 30 days": [],
    Older: [],
  };

  active.forEach((c) => {
    const d = new Date(c.updatedAt);
    if (d >= todayS) buckets["Today"].push(c);
    else if (d >= yesterdayS) buckets["Yesterday"].push(c);
    else if (d >= weekS) buckets["Previous 7 days"].push(c);
    else if (d >= monthS) buckets["Previous 30 days"].push(c);
    else buckets["Older"].push(c);
  });

  const groups: ConvGroup[] = [];
  for (const [label, items] of Object.entries(buckets)) {
    if (items.length > 0) groups.push({ label, items });
  }

  return { pinned, groups, archived };
}

/* ══════════════════════════════════════════════════════════════════ */
/* TIME AGO                                                          */
/* ══════════════════════════════════════════════════════════════════ */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

/* ══════════════════════════════════════════════════════════════════ */
/* INLINE ACTION BUTTON                                              */
/* ══════════════════════════════════════════════════════════════════ */
function ActionBtn({
  onClick,
  ariaLabel,
  variant = "default",
  children,
}: {
  onClick: (e: React.MouseEvent) => void;
  ariaLabel: string;
  variant?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick(e);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className={`p-1 rounded-md transition-all duration-150 flex-shrink-0 ${
        variant === "danger"
          ? "text-[var(--color-muted)]/60 hover:text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/8"
          : "text-[var(--color-muted)]/60 hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-4)]"
      }`}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* CONVERSATION ITEM                                                 */
/* ══════════════════════════════════════════════════════════════════ */
function ConvItem({
  conv,
  isActive,
  onSelect,
  onPin,
  onArchive,
  onDelete,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const msgCount = conv.messages.filter((m) => m.role === "user").length;
  const lastUserMsg =
    conv.messages.filter((m) => m.role === "user").pop()?.query || "";
  const ago = useMemo(() => timeAgo(conv.updatedAt), [conv.updatedAt]);

  return (
    <div className="relative group">
      {/* Main clickable row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={`w-full text-left px-3 py-3 rounded-xl transition-all duration-200 flex items-start gap-2.5 cursor-pointer select-none ${
          isActive
            ? "bg-[#22c55e]/8 border border-[#22c55e]/20 shadow-sm"
            : "hover:bg-[var(--color-surface-3)]/60 border border-transparent"
        }`}
        aria-selected={isActive}
        aria-label={`Conversation: ${conv.title}`}
      >
        {/* Icon / Pin indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {conv.isPinned ? (
            <svg
              className="w-4 h-4 text-[#22c55e]"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z" />
            </svg>
          ) : (
            <div
              className={`w-5 h-5 rounded-md flex items-center justify-center ${
                isActive
                  ? "bg-[#22c55e]/15 text-[#22c55e]"
                  : "bg-[var(--color-surface-3)] text-[var(--color-muted)]"
              } transition-colors`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Text content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p
              className={`text-xs font-semibold truncate flex-1 ${
                isActive
                  ? "text-[#22c55e]"
                  : "text-[var(--color-foreground)]"
              }`}
            >
              {conv.title}
            </p>
            <span className="text-[9px] text-[var(--color-muted)] font-mono flex-shrink-0 tabular-nums">
              {ago}
            </span>
          </div>
          {lastUserMsg && (
            <p className="text-[10px] text-[var(--color-muted)] mt-0.5 truncate">
              {lastUserMsg}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] text-[var(--color-muted)]/60">
              {msgCount} msg{msgCount !== 1 ? "s" : ""}
            </span>
            {conv.isPinned && (
              <span className="badge badge-green text-[8px] py-0">pinned</span>
            )}
            {conv.isArchived && (
              <span className="badge badge-amber text-[8px] py-0">archived</span>
            )}
          </div>
        </div>

        {/* ── INLINE ACTION BUTTONS (visible on hover) ── */}
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {/* Pin / Unpin */}
          <ActionBtn
            onClick={() => onPin(conv.id)}
            ariaLabel={conv.isPinned ? "Unpin" : "Pin"}
          >
            <svg
              className="w-3.5 h-3.5"
              fill={conv.isPinned ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
              />
            </svg>
          </ActionBtn>

          {/* Archive / Unarchive */}
          <ActionBtn
            onClick={() => onArchive(conv.id)}
            ariaLabel={conv.isArchived ? "Unarchive" : "Archive"}
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
              />
            </svg>
          </ActionBtn>

          {/* Delete */}
          <ActionBtn
            onClick={() => {
              if (confirm("Delete this conversation?")) onDelete(conv.id);
            }}
            ariaLabel="Delete"
            variant="danger"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/* MAIN COMPONENT                                                    */
/* ══════════════════════════════════════════════════════════════════ */
interface Props {
  conversations: Conversation[];
  activeConvId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function QueryHistory({
  conversations,
  activeConvId,
  onSelect,
  onNewChat,
  onPin,
  onArchive,
  onDelete,
  onClose,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Filter empty conversations
  const visibleConvs = useMemo(
    () =>
      conversations.filter(
        (c) => c.messages.length > 0 || c.id === activeConvId
      ),
    [conversations, activeConvId]
  );

  // Group
  const allGrouped = useMemo(
    () => groupByDate(visibleConvs),
    [visibleConvs]
  );

  // Search filter
  const { pinned, groups, archived } = useMemo(() => {
    if (!searchQuery.trim()) return allGrouped;
    const q = searchQuery.toLowerCase();
    const filterList = (list: Conversation[]) =>
      list.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.messages.some((m) => m.query.toLowerCase().includes(q))
      );
    return {
      pinned: filterList(allGrouped.pinned),
      groups: allGrouped.groups
        .map((g) => ({ ...g, items: filterList(g.items) }))
        .filter((g) => g.items.length > 0),
      archived: filterList(allGrouped.archived),
    };
  }, [searchQuery, allGrouped]);

  const totalCount = visibleConvs.filter((c) => !c.isArchived).length;

  const renderSection = (label: string, items: Conversation[]) => (
    <div key={label} className="mb-3">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <p className="text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-[0.12em]">
          {label}
        </p>
        <span className="text-[9px] text-[var(--color-muted)]/50 font-mono">
          {items.length}
        </span>
        <div className="flex-1 h-px bg-[var(--color-border)]/30" />
      </div>
      <div className="space-y-0.5">
        {items.map((c, i) => (
          <div
            key={c.id}
            style={{ animation: `fade-in 0.2s ${i * 0.03}s both` }}
          >
            <ConvItem
              conv={c}
              isActive={c.id === activeConvId}
              onSelect={() => onSelect(c.id)}
              onPin={onPin}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="p-3 space-y-2 border-b border-[var(--color-border)]">
        {/* Brand */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="MATRIQ"
              className="w-6 h-6 rounded-md object-contain"
            />
            <span className="text-xs font-bold gradient-text-brand">
              MATRIQ
            </span>
          </div>
          {totalCount > 0 && (
            <span className="badge badge-gray">{totalCount}</span>
          )}
        </div>

        {/* New Chat */}
        <button
          type="button"
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] hover:bg-[#22c55e]/5 hover:border-[#22c55e]/25 hover:text-[#22c55e] transition-all duration-200 active:scale-[0.98]"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New chat
        </button>

        {/* Search */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-muted)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full pl-9 pr-8 py-2 text-xs bg-[var(--color-surface-2)] border border-[var(--color-border)] rounded-lg text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]/50 focus:outline-none focus:border-[#22c55e]/25 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--color-surface-3)] text-[var(--color-muted)] transition-colors"
              aria-label="Clear search"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {visibleConvs.length === 0 ? (
          <div className="text-center py-20 px-4">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-[var(--color-muted)]/20"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={0.8}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
              />
            </svg>
            <p className="text-xs text-[var(--color-muted)]">
              No conversations yet
            </p>
            <p className="text-[10px] text-[var(--color-muted)]/50 mt-1">
              Start by asking a question
            </p>
          </div>
        ) : (
          <>
            {pinned.length > 0 && renderSection("Pinned", pinned)}
            {groups.map((g) => renderSection(g.label, g.items))}

            {searchQuery &&
              pinned.length === 0 &&
              groups.length === 0 && (
                <div className="text-center py-12 px-4">
                  <svg
                    className="w-8 h-8 mx-auto mb-2 text-[var(--color-muted)]/20"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                    />
                  </svg>
                  <p className="text-xs text-[var(--color-muted)]">
                    No results for &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}

            {archived.length > 0 && (
              <div className="mt-3 pt-2 border-t border-[var(--color-border)]/50">
                <button
                  type="button"
                  onClick={() => setShowArchived(!showArchived)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-semibold text-[var(--color-muted)] uppercase tracking-[0.12em] hover:text-[var(--color-muted-foreground)] transition-colors rounded-lg hover:bg-[var(--color-surface-3)]/50"
                >
                  <svg
                    className={`w-3 h-3 transition-transform duration-200 ${
                      showArchived ? "rotate-90" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                  <svg
                    className="w-3.5 h-3.5 opacity-50"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z"
                    />
                  </svg>
                  Archived ({archived.length})
                </button>
                {showArchived && (
                  <div className="space-y-0.5 mt-1 animate-[fade-in-up_0.2s]">
                    {archived.map((c) => (
                      <ConvItem
                        key={c.id}
                        conv={c}
                        isActive={c.id === activeConvId}
                        onSelect={() => onSelect(c.id)}
                        onPin={onPin}
                        onArchive={onArchive}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mobile close ── */}
      <div className="p-2 border-t border-[var(--color-border)] lg:hidden">
        <button
          type="button"
          onClick={onClose}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-[var(--color-muted-foreground)] hover:bg-[var(--color-surface-3)] transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
          Close sidebar
        </button>
      </div>
    </div>
  );
}