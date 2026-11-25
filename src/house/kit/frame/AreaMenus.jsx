// The frame's area menus (board 01-Main's header: Today · System · Plan & do
// · Write · Support · Look back · More), as the old pixel header does them
// (v0.382.3, PixelChrome AreaMenus):
//
// - the area's NAME opens its first page (Plan & do → Planner, Support →
//   Support & Learn); Ctrl/⌘ or middle click opens it in a new open-page tab;
// - the list opens from the small ▾ beside the name, while a mouse rests on
//   the area, or with ArrowDown on the name;
// - in the list each page shows its key (the mockup's "P", "R", "T", "M"):
//   the first letter of its name when no other page in the list shares it,
//   and pressing that key opens the page; each row has a "+" that opens it
//   in a new tab, and "Open in new tab…" turns every row into a new-tab pick;
// - rows without a path run their own action (the More area's tools).
//
//   <AreaMenus groups={navAreaGroups(terms)} currentPath={pathname}
//     onGo={(path) => navigate(path)} onNewTab={(path) => openInTab(path)} />

import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import "@/house/kit/frame/frameKit.css";

/** The key shown for each item: its first letter when unique in the list. */
export function menuKeys(items = []) {
  const count = new Map();
  const first = (it) => String(it.label || "").trim().charAt(0).toUpperCase();
  for (const it of items) { const k = first(it); if (/[A-Z0-9]/.test(k)) count.set(k, (count.get(k) || 0) + 1); }
  const out = {};
  for (const it of items) { const k = first(it); if (count.get(k) === 1) out[it.id] = k; }
  return out;
}

const isActive = (path, current) => !!path && (path === "/" ? current === "/" : current === path || current.startsWith(`${path}/`));

function AreaMenu({ group, open, onOpen, onClose, currentPath, onGo, onNewTab, active }) {
  const menuId = useId();
  const popRef = useRef(null);
  const nameRef = useRef(null);
  const areaRef = useRef(null);
  // The list hangs from the area in the window's own layer (fixed), so a
  // bar that clips its overflow (the header wave) never cuts it off.
  const [at, setAt] = useState(null);
  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const r = areaRef.current?.getBoundingClientRect();
      if (!r) return;
      const w = popRef.current?.offsetWidth || 0;
      setAt({ top: r.bottom, left: Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  const [newTabMode, setNewTabMode] = useState(false);
  const keys = useMemo(() => menuKeys(group.items), [group.items]);
  const first = group.items.find((it) => it.path);
  useEffect(() => { if (!open) setNewTabMode(false); }, [open]);

  const pick = (it, { newTab = false } = {}) => {
    onClose();
    if (!it.path) { it.onSelect?.(); return; }
    if (newTab || newTabMode) onNewTab(it.path); else onGo(it.path);
  };
  const focusItem = (i) => {
    const els = popRef.current?.querySelectorAll('[role="menuitem"]');
    if (els?.length) els[(i + els.length) % els.length]?.focus();
  };
  const onMenuKey = (e) => {
    const els = [...(popRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const i = els.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); nameRef.current?.focus(); }
    else if (e.key === "Tab") { onClose(); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toUpperCase();
      const hit = group.items.find((it) => keys[it.id] === k);
      if (hit) { e.preventDefault(); pick(hit); }
    }
  };

  return (
    <div ref={areaRef} className="hk-area" data-active={active || undefined} data-open={open || undefined}
      onMouseEnter={(e) => { if (e.nativeEvent?.pointerType !== "touch") onOpen(false); }}
      onMouseLeave={() => onClose(true)}>
      <button ref={nameRef} type="button" className="hk-area-name"
        title={first ? `Open ${first.label}` : undefined}
        aria-current={active ? "true" : undefined}
        onClick={(e) => {
          if (!first) { open ? onClose() : onOpen(true); return; }
          if (e.ctrlKey || e.metaKey) { onClose(); onNewTab(first.path); return; }
          onClose(); onGo(first.path);
        }}
        onAuxClick={(e) => { if (first && e.button === 1) { e.preventDefault(); onClose(); onNewTab(first.path); } }}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); onOpen(true); requestAnimationFrame(() => focusItem(0)); } }}>
        {group.label}
      </button>
      <button type="button" className="hk-area-caret" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={`${group.label} pages`}
        onClick={() => { if (open) onClose(); else { onOpen(true); requestAnimationFrame(() => focusItem(0)); } }}>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div ref={popRef} id={menuId} className="hk-area-menu" role="menu" aria-label={group.label} onKeyDown={onMenuKey}
          style={at ? { position: "fixed", top: at.top, left: at.left } : undefined}>
          {group.items.map((it) => (
            <div key={it.id} className="hk-area-row" data-current={isActive(it.path, currentPath) || undefined}>
              <button type="button" role="menuitem" tabIndex={-1} className="hk-area-item"
                onClick={(e) => pick(it, { newTab: e.ctrlKey || e.metaKey })}
                onAuxClick={(e) => { if (it.path && e.button === 1) { e.preventDefault(); pick(it, { newTab: true }); } }}>
                {it.icon ? <HouseIcon icon={it.icon} page={it.path ? it.id : undefined} size="inline" /> : null}
                <span className="hk-area-item-text">{it.label}</span>
                {keys[it.id] ? <kbd className="hk-area-key" aria-label={`key ${keys[it.id]}`}>{keys[it.id]}</kbd> : null}
              </button>
              {it.path ? (
                <button type="button" tabIndex={-1} className="hk-area-newtab" aria-label={`Open ${it.label} in a new tab`} title="Open in a new tab"
                  onClick={() => pick(it, { newTab: true })}>
                  <Plus aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {group.items.some((it) => it.path) ? (
            <>
              <div role="separator" className="hk-area-sep" />
              <button type="button" role="menuitemcheckbox" aria-checked={newTabMode} tabIndex={-1} className="hk-area-item hk-area-more"
                onClick={() => setNewTabMode((v) => !v)}>
                <span className="hk-area-item-text">{newTabMode ? "Pick a page to open in a new tab" : "Open in new tab…"}</span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function AreaMenus({ groups = [], currentPath = "/", onGo, onNewTab, label = "Main navigation" }) {
  const [openId, setOpenId] = useState(null);
  const [pinned, setPinned] = useState(false); // opened by a click/key: stays open when the mouse leaves
  const ref = useRef(null);
  useEffect(() => { setOpenId(null); }, [currentPath]);
  useEffect(() => {
    if (!openId) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpenId(null); };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [openId]);
  const activeArea = groups.find((g) => g.items.some((it) => isActive(it.path, currentPath)))?.id;
  return (
    <nav ref={ref} className="hk-areas" aria-label={label}>
      {groups.map((g) => (
        <AreaMenu key={g.id} group={g} open={openId === g.id} active={activeArea === g.id}
          currentPath={currentPath} onGo={onGo} onNewTab={onNewTab}
          onOpen={(byClick) => { setOpenId(g.id); setPinned(!!byClick); }}
          onClose={(fromHover) => { if (fromHover && pinned) return; setOpenId((cur) => (cur === g.id ? null : cur)); setPinned(false); }} />
      ))}
    </nav>
  );
}
