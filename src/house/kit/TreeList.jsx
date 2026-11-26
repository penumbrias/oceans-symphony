// The kit's list and tree (new house step 1.3): the left panel's job.
//
//   <ListView label="Plans" items={plans} value={selectedId} onSelect={open}
//     renderRow={(p) => <RowText title={p.activity_name} subtitle={when(p)} />} />
//
//   <TreeView label={`Groups and sub${t.system}s`} nodes={groups}
//     getParentId={(g) => g.parent || null} value={id} onSelect={open}
//     renderRow={(g) => <RowText title={g.name} />} />
//
// Keyboard: ↑ ↓ move, Home / End jump, Enter or Space chooses, a letter
// jumps to the next row starting with it; in a tree → opens or goes to the
// first child, ← folds or goes to the parent. One row is in the Tab order
// (the chosen one, else the first); Tab leaves the list.
//
// Big lists: up to 200 rows are drawn whole; above that 100 at a time, with
// "Previous" / "Next" and "101–200 of 1,000" under the list (lists.js).
// Paged, not windowed, so rows keep their natural height and long names
// wrap at 200% text instead of being cut. Moving past the last row of a page
// turns the page.
//
// Trees are cycle-guarded and depth-clamped (flattenTree): a record that is
// its own parent, sits in a loop or lost its parent shows as a top-level
// row, so one bad record never hides the rest or hangs the page.
//
// Rows hold words and pictures only: a row is one choice (role="option" /
// "treeitem"), so it never holds its own buttons. Row actions go in the
// Info panel or the ⋯ menu.

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button } from "@/house/kit/Button";
import { flattenTree, pageSlice, pageOf, rangeWords, PAGE_SIZE, PAGE_LIMIT } from "@/house/kit/lists";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

const textOf = (el) => (el?.textContent || "").trim().toLowerCase();

function useRovingList({ rows, getKey, value, onSelect, page, setPage, total, pagedInfo, onKeyExtra }) {
  const listRef = useRef(null);
  const [active, setActive] = useState(null);
  const pendingFocus = useRef(null);
  const keys = rows.map(getKey);
  const activeKey = keys.includes(active) ? active : keys.includes(value) ? value : keys[0];
  const focusKey = (k) => {
    setActive(k);
    pendingFocus.current = k;
  };
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const el = listRef.current?.querySelector(`[data-row-key="${CSS.escape(String(pendingFocus.current))}"]`);
    if (el) { el.focus(); pendingFocus.current = null; }
  });
  const onKeyDown = (e) => {
    const i = keys.indexOf(activeKey);
    const go = (j) => { e.preventDefault(); focusKey(keys[Math.max(0, Math.min(keys.length - 1, j))]); };
    if (e.key === "ArrowDown") {
      if (i === keys.length - 1 && pagedInfo.paged && pagedInfo.page < pagedInfo.pages - 1) {
        e.preventDefault(); setPage(page + 1); pendingFocus.current = "__first"; return;
      }
      go(i + 1);
    } else if (e.key === "ArrowUp") {
      if (i === 0 && pagedInfo.paged && pagedInfo.page > 0) {
        e.preventDefault(); setPage(page - 1); pendingFocus.current = "__last"; return;
      }
      go(i - 1);
    } else if (e.key === "Home") go(0);
    else if (e.key === "End") go(keys.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const r = rows[i];
      if (r) onSelect?.(keys[i], r);
    } else if (onKeyExtra?.(e, i, focusKey)) {
      /* handled */
    } else if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase();
      const els = [...(listRef.current?.querySelectorAll("[data-row-key]") || [])];
      for (let n = 1; n <= els.length; n++) {
        const j = (i + n) % els.length;
        if (textOf(els[j]).startsWith(k)) { go(j); break; }
      }
    }
  };
  // After a page turn, land on the first or last row of the new page.
  useEffect(() => {
    if (pendingFocus.current === "__first" && keys.length) focusKey(keys[0]);
    else if (pendingFocus.current === "__last" && keys.length) focusKey(keys[keys.length - 1]);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  return { listRef, activeKey, setActive, onKeyDown, total };
}

function Pager({ info, total, onPage, label }) {
  if (!info.paged) return null;
  return (
    <div className="hk-pager" role="group" aria-label={`${label}: pages`}>
      <Button rank="secondary" icon={ChevronLeft} onClick={() => onPage(info.page - 1)}
        disabledReason={info.page === 0 ? "This is the first page" : undefined}>Previous</Button>
      <span className="hk-pager-words" aria-live="polite">{rangeWords(info, total)}</span>
      <Button rank="secondary" icon={ChevronRight} onClick={() => onPage(info.page + 1)}
        disabledReason={info.page >= info.pages - 1 ? "This is the last page" : undefined}>Next</Button>
    </div>
  );
}

// A row's words: a title that wraps, and an optional second line.
export function RowText({ title, subtitle, meta }) {
  return (
    <span className="hk-rowtext">
      <span className="hk-rowtext-title">{title}</span>
      {subtitle ? <span className="hk-rowtext-sub">{subtitle}</span> : null}
      {meta ? <span className="hk-rowtext-meta">{meta}</span> : null}
    </span>
  );
}

export function ListView({ label, items = [], getId = (x) => x.id, value, onSelect, renderRow, pageSize = PAGE_SIZE, pageLimit = PAGE_LIMIT, leading }) {
  const [page, setPage] = useState(() => (value != null ? pageOf(Math.max(0, items.findIndex((x) => getId(x) === value)), pageSize) : 0));
  const info = pageSlice(items, page, { size: pageSize, limit: pageLimit });
  const r = useRovingList({ rows: info.rows, getKey: getId, value, onSelect, page: info.page, setPage, total: items.length, pagedInfo: info });
  return (
    <div className="hk-list-wrap">
      <div ref={r.listRef} role="listbox" aria-label={label} className="hk-list" onKeyDown={r.onKeyDown}>
        {info.rows.map((item, i) => {
          const k = getId(item);
          const selected = k === value;
          return (
            <div
              key={k}
              role="option"
              data-row-key={k}
              data-highlight-id={k}
              aria-selected={selected}
              aria-posinset={info.start + i + 1}
              aria-setsize={items.length}
              tabIndex={k === r.activeKey ? 0 : -1}
              className="hk-listrow"
              onClick={() => { r.setActive(k); onSelect?.(k, item); }}
              onFocus={() => r.setActive(k)}
            >
              {leading ? <span className="hk-listrow-lead">{leading(item)}</span> : null}
              <span className="hk-listrow-body">{renderRow ? renderRow(item, { selected }) : String(k)}</span>
            </div>
          );
        })}
      </div>
      <Pager info={info} total={items.length} onPage={setPage} label={label} />
    </div>
  );
}

export function TreeView({ label, nodes = [], getId = (x) => x.id, getParentId, value, onSelect, renderRow, defaultExpanded = "all", expanded: expandedProp, onExpandedChange, sort, pageSize = PAGE_SIZE, pageLimit = PAGE_LIMIT }) {
  const allIds = useMemo(() => new Set(nodes.map(getId)), [nodes, getId]);
  const [expState, setExpState] = useState(() => (defaultExpanded === "all" ? null : new Set(defaultExpanded === "none" ? [] : defaultExpanded)));
  const expanded = expandedProp !== undefined ? expandedProp : expState;
  const setExpanded = (next) => { if (expandedProp === undefined) setExpState(next); onExpandedChange?.(next); };
  const rows = useMemo(() => flattenTree(nodes, { getId, getParentId, expanded, sort }), [nodes, getId, getParentId, expanded, sort]);
  const toggle = (id, open) => {
    const cur = expanded == null ? new Set(allIds) : new Set(expanded);
    if (open) cur.add(id); else cur.delete(id);
    setExpanded(cur);
  };
  const [page, setPage] = useState(0);
  const info = pageSlice(rows, page, { size: pageSize, limit: pageLimit });
  const uid = useId();
  const r = useRovingList({
    rows: info.rows, getKey: (row) => row.id, value, page: info.page, setPage, total: rows.length, pagedInfo: info,
    onSelect: (id, row) => onSelect?.(id, row.node),
    onKeyExtra: (e, i, focusKey) => {
      const row = info.rows[i];
      if (!row) return false;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (row.hasChildren && !row.expanded) toggle(row.id, true);
        else if (row.hasChildren) focusKey(info.rows[i + 1]?.id ?? row.id);
        return true;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (row.hasChildren && row.expanded) toggle(row.id, false);
        else if (row.parentId != null) focusKey(row.parentId);
        return true;
      }
      return false;
    },
  });
  return (
    <div className="hk-list-wrap">
      <div ref={r.listRef} role="tree" aria-label={label} className="hk-list" onKeyDown={r.onKeyDown}>
        {info.rows.map((row) => {
          const selected = row.id === value;
          return (
            <div
              key={row.id}
              id={`${uid}-${row.id}`}
              role="treeitem"
              data-row-key={row.id}
              data-highlight-id={row.id}
              aria-level={row.level}
              aria-setsize={row.setSize}
              aria-posinset={row.posInSet}
              aria-expanded={row.expanded}
              aria-selected={selected}
              tabIndex={row.id === r.activeKey ? 0 : -1}
              className="hk-listrow hk-treerow"
              style={{ "--hk-depth": row.depth }}
              onClick={() => { r.setActive(row.id); onSelect?.(row.id, row.node); }}
              onFocus={() => r.setActive(row.id)}
            >
              <span className="hk-tree-indent" aria-hidden="true" />
              {row.hasChildren ? (
                // A pointer target for folding; the keyboard uses ← and →.
                // The row's full height and a whole target wide (kit gate item 5).
                <span className="hk-tree-toggle" aria-hidden="true" data-fold=""
                  onClick={(e) => { e.stopPropagation(); toggle(row.id, !row.expanded); }}>
                  <HouseIcon icon={row.expanded ? ChevronDown : ChevronRight} />
                </span>
              ) : <span className="hk-tree-toggle" aria-hidden="true" />}
              <span className="hk-listrow-body">{renderRow ? renderRow(row.node, { selected, level: row.level }) : String(row.id)}</span>
            </div>
          );
        })}
      </div>
      <Pager info={info} total={rows.length} onPage={setPage} label={label} />
    </div>
  );
}

export default ListView;
