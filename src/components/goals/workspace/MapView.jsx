// Map view: the page and its sections as a mind map, left to right, with
// links between pages drawn as dashed lines. Pages linked from outside the
// map sit in a column on the right. Tap a box to open it.
import React, { useMemo } from "react";
import { childPages, connectionsOf, MAX_PAGE_DEPTH } from "@/lib/goalTree";
import { useWorkspace } from "./WorkspaceContext";

const NODE_W = 170;
const NODE_H = 40;
const COL_GAP = 60;
const ROW_GAP = 14;
const MAX_MAP_DEPTH = Math.min(6, MAX_PAGE_DEPTH);

const clip = (s, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function MapView({ page }) {
  const { index, goals, steps, open } = useWorkspace();

  const layout = useMemo(() => {
    const nodes = [];
    const edges = [];
    const seen = new Set();
    let row = 0;
    // Leaves take a row each; a parent sits in the middle of its children.
    const place = (p, depth) => {
      seen.add(p.id);
      const kids = depth < MAX_MAP_DEPTH ? childPages(index, p.id).filter((c) => !seen.has(c.id)) : [];
      let y;
      if (kids.length === 0) { y = row; row += 1; }
      else {
        const ys = kids.map((k) => { const n = place(k, depth + 1); edges.push({ from: p.id, to: k.id, kind: "tree" }); return n.y; });
        y = (ys[0] + ys[ys.length - 1]) / 2;
      }
      const node = { id: p.id, page: p, depth, y };
      nodes.push(node);
      return node;
    };
    place(page, 0);
    const maxDepth = nodes.reduce((m, n) => Math.max(m, n.depth), 0);
    // Links from any page on the map.
    const inMap = new Set(nodes.map((n) => n.id));
    const outside = [];
    const linkEdges = [];
    for (const n of [...nodes]) {
      for (const c of connectionsOf(n.id, goals, steps).outgoing) {
        if (!inMap.has(c.page.id)) {
          inMap.add(c.page.id);
          outside.push({ id: c.page.id, page: c.page, depth: maxDepth + 1, y: outside.length, outside: true });
        }
        linkEdges.push({ from: n.id, to: c.page.id, kind: "link", label: c.label });
      }
    }
    const all = [...nodes, ...outside];
    const rows = Math.max(row, outside.length, 1);
    const pos = new Map(all.map((n) => [n.id, {
      x: 10 + n.depth * (NODE_W + COL_GAP),
      y: 10 + n.y * (NODE_H + ROW_GAP),
    }]));
    const width = 20 + (maxDepth + (outside.length ? 2 : 1)) * (NODE_W + COL_GAP) - COL_GAP;
    const height = 20 + rows * (NODE_H + ROW_GAP) - ROW_GAP;
    return { all, edges: [...edges, ...linkEdges], pos, width, height };
  }, [page, index, goals, steps]);

  const { all, edges, pos, width, height } = layout;

  return (
    <div className="overflow-auto overscroll-contain rounded-xl border border-border/50 bg-muted/10 max-h-[70vh]">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Map of ${page.title || "this page"}`}>
        {edges.map((e, i) => {
          const a = pos.get(e.from); const b = pos.get(e.to);
          if (!a || !b) return null;
          const forward = b.x > a.x;
          const x1 = forward ? a.x + NODE_W : a.x + NODE_W / 2;
          const y1 = forward ? a.y + NODE_H / 2 : a.y + NODE_H;
          const x2 = forward ? b.x : b.x + NODE_W / 2;
          const y2 = forward ? b.y + NODE_H / 2 : b.y;
          const mx = (x1 + x2) / 2;
          const d = forward ? `M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}` : `M${x1} ${y1} C${x1 + 40} ${(y1 + y2) / 2} ${x2 + 40} ${(y1 + y2) / 2} ${x2} ${y2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" className={e.kind === "link" ? "stroke-primary" : "stroke-border"}
                strokeWidth={e.kind === "link" ? 1.5 : 2} strokeDasharray={e.kind === "link" ? "5 4" : undefined} />
              {e.kind === "link" && e.label && (
                <text x={mx} y={(y1 + y2) / 2 - 4} textAnchor="middle" className="fill-primary" fontSize="11">{clip(e.label, 18)}</text>
              )}
            </g>
          );
        })}
        {all.map((n) => {
          const p = pos.get(n.id);
          const done = n.page.status === "done";
          return (
            <g key={n.id} role="button" tabIndex={0} aria-label={`Open ${n.page.title || "page"}`} style={{ cursor: "pointer" }}
              onClick={() => open(n.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") open(n.id); }}>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={10}
                className={n.depth === 0 ? "fill-primary/15 stroke-primary" : n.outside ? "fill-background stroke-primary/50" : "fill-background stroke-border"}
                strokeWidth={1.5} strokeDasharray={n.outside ? "4 3" : undefined} />
              <text x={p.x + 12} y={p.y + NODE_H / 2 + 4} fontSize="13"
                className={done ? "fill-muted-foreground" : "fill-foreground"} textDecoration={done ? "line-through" : undefined}>
                {clip(`${n.page.icon ? `${n.page.icon} ` : ""}${n.page.title || "Untitled"}`)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
