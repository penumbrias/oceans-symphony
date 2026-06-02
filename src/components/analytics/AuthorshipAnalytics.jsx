import React, { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { startOfDay, endOfDay } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";

// Cross-content authorship analytics. Answers "which parts have been
// authoring things, and what kind of things". Pulls from two sources so
// the picture is complete:
//   1. MentionLog rows with log_type "authored" — written by saveAuthoredLog
//      for chat messages, bulletins, and bulletin comments/replies. A
//      co-authored chat message logs one "authored" row per speaker, so
//      each contributor is credited.
//   2. JournalEntry.author_alter_id — journals don't write authored logs,
//      so they're counted directly here (no overlap with MentionLog).
const SOURCES = [
  { key: "chat", label: "Chat", color: "#3b82f6" },
  { key: "bulletin", label: "Bulletins", color: "#8b5cf6" },
  { key: "comment", label: "Comments", color: "#ec4899" },
  { key: "reply", label: "Replies", color: "#f59e0b" },
  { key: "journal", label: "Journals", color: "#14b8a6" },
];

export default function AuthorshipAnalytics({ mentionLogs = [], journals = [], alters = [], from, to }) {
  const terms = useTerms();
  const formatAlter = useAlterLabel();

  const fromMs = startOfDay(from).getTime();
  const toMs = endOfDay(to).getTime();

  const altersById = useMemo(() => {
    const map = {};
    alters.forEach((a) => { map[a.id] = a; });
    return map;
  }, [alters]);

  // Flatten every authorship event into { alterId, type } within range.
  const events = useMemo(() => {
    const out = [];
    mentionLogs.forEach((l) => {
      if (l.log_type !== "authored" || !l.author_alter_id) return;
      const t = new Date(l.source_date).getTime();
      if (isNaN(t) || t < fromMs || t > toMs) return;
      const type = SOURCES.some((s) => s.key === l.source_type) ? l.source_type : "chat";
      out.push({ alterId: l.author_alter_id, type });
    });
    journals.forEach((j) => {
      if (!j.author_alter_id) return;
      const t = new Date(j.created_date || j.timestamp).getTime();
      if (isNaN(t) || t < fromMs || t > toMs) return;
      out.push({ alterId: j.author_alter_id, type: "journal" });
    });
    return out;
  }, [mentionLogs, journals, fromMs, toMs]);

  const { perAlter, sourcePie, totalAuthored, contributors, topAuthor } = useMemo(() => {
    const byAlter = {};
    const bySource = {};
    events.forEach((e) => {
      if (!byAlter[e.alterId]) byAlter[e.alterId] = { total: 0, sources: {} };
      byAlter[e.alterId].total += 1;
      byAlter[e.alterId].sources[e.type] = (byAlter[e.alterId].sources[e.type] || 0) + 1;
      bySource[e.type] = (bySource[e.type] || 0) + 1;
    });

    const rows = Object.entries(byAlter)
      .map(([id, d]) => {
        const a = altersById[id];
        const row = { name: a ? (formatAlter ? formatAlter(a) : (a.alias || a.name)) : "Unknown", total: d.total };
        SOURCES.forEach((s) => { row[s.key] = d.sources[s.key] || 0; });
        return row;
      })
      .sort((x, y) => y.total - x.total);

    const pie = SOURCES
      .map((s) => ({ name: s.label, value: bySource[s.key] || 0, color: s.color }))
      .filter((d) => d.value > 0);

    return {
      perAlter: rows.slice(0, 12),
      sourcePie: pie,
      totalAuthored: events.length,
      contributors: rows.length,
      topAuthor: rows[0]?.name || "—",
    };
  }, [events, altersById, formatAlter]);

  // Which source segments actually have data — so the stacked bar only
  // draws (and legends) the relevant types.
  const activeSources = SOURCES.filter((s) => perAlter.some((r) => r[s.key] > 0));

  if (totalAuthored === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-muted-foreground text-sm">
          No authored content in this date range. Once {terms.alters} post in chat, the bulletin board, comments, or journals, it shows up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Things authored</p>
          <p className="text-lg font-semibold">{totalAuthored}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Top author</p>
          <p className="text-sm font-semibold truncate">{topAuthor}</p>
        </div>
        <div className="bg-card border border-border/50 rounded-lg p-3">
          <p className="text-xs text-muted-foreground mb-1">Contributors</p>
          <p className="text-lg font-semibold">{contributors}</p>
        </div>
      </div>

      {/* Per-alter authored, broken down by content type */}
      <div className="bg-card border border-border/50 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Authored by {terms.alter}</h3>
        <ResponsiveContainer width="100%" height={Math.max(220, perAlter.length * 34)}>
          <BarChart data={perAlter} layout="vertical" margin={{ left: 8, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-muted)" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="var(--color-text-secondary)" allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={88} stroke="var(--color-text-secondary)" />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {activeSources.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="a"
                fill={s.color}
                radius={i === activeSources.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Breakdown by content type */}
      {sourcePie.length > 0 && (
        <div className="bg-card border border-border/50 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">By content type</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sourcePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {sourcePie.map((d, i) => (
                  <Cell key={`cell-${i}`} fill={d.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-muted)", borderRadius: "0.5rem" }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="text-[0.6875rem] text-muted-foreground leading-snug px-1">
        Counts chat messages, bulletins, comments, replies, and journal entries.
        Authorship follows your <span className="font-medium">-signpost</span> tags and speaker selection, so a co-authored
        message credits each {terms.alter}.
      </p>
    </div>
  );
}
