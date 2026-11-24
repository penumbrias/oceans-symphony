// The kit's menu (new house step 1.2): a button that opens a list of
// actions. Keyboard and screen reader: the trigger says it has a menu and
// whether it's open; arrows, Home, End and the first letter move; Enter or
// Space acts; Escape or Tab close and focus returns to the trigger.
//
//   <Menu label="More for Walk" items={[
//     { id: "dup", label: "Duplicate", icon: Copy, onSelect: dup },
//     { id: "move", label: "Move…", disabledReason: "Nothing to move it to yet" },
//     { id: "del", label: "Delete Walk", icon: Trash2, danger: true, onSelect: askDelete },
//   ]} />
//
// Delete is always the last item, in the danger colour, with a trash icon,
// behind a line (building code §1). A disabled item stays in the list and
// says why. The trigger is an icon button (⋯) unless `children` gives words.

import React, { useEffect, useId, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button, IconButton } from "@/house/kit/Button";
import { KitPopover } from "@/house/kit/KitLayer";
import "@/house/kit/kit.css";

export default function Menu({ label, items = [], icon = MoreHorizontal, children, rank, openInline = false }) {
  const [open, setOpen] = useState(openInline);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const menuId = useId();
  // Danger items always go last, behind a separator.
  const ordered = [...items.filter((i) => !i.danger), ...items.filter((i) => i.danger)];
  const firstDanger = ordered.findIndex((i) => i.danger);

  const focusItem = (i) => {
    const els = popRef.current?.querySelectorAll('[role="menuitem"]');
    if (!els?.length) return;
    els[(i + els.length) % els.length]?.focus();
  };
  const current = () => {
    const els = [...(popRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    return els.indexOf(document.activeElement);
  };
  useEffect(() => { if (open && !openInline) requestAnimationFrame(() => focusItem(0)); }, [open, openInline]);
  const close = (refocus = true) => { setOpen(false); if (refocus) triggerRef.current?.focus(); };

  const onKey = (e) => {
    const i = current();
    if (e.key === "ArrowDown") { e.preventDefault(); focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); focusItem(ordered.length - 1); }
    else if (e.key === "Tab") { close(false); }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      const k = e.key.toLowerCase();
      const start = i + 1;
      for (let n = 0; n < ordered.length; n++) {
        const j = (start + n) % ordered.length;
        if (String(ordered[j].label).toLowerCase().startsWith(k)) { focusItem(j); break; }
      }
    }
  };

  const triggerProps = {
    ref: triggerRef,
    "aria-haspopup": "menu",
    "aria-expanded": open,
    "aria-controls": open ? menuId : undefined,
    onClick: () => setOpen((o) => !o),
    onKeyDown: (e) => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); } },
  };

  return (
    <>
      {children
        ? <Button rank={rank || "secondary"} {...triggerProps}>{children}</Button>
        : <IconButton icon={icon} label={label} rank={rank || "quiet"} {...triggerProps} />}
      <KitPopover open={open} inline={openInline} anchorRef={triggerRef} popRef={popRef} onClose={() => setOpen(false)} role="menu" label={label} id={menuId} onKeyDown={onKey}>
        {ordered.map((it, i) => {
          const off = !!it.disabledReason;
          return (
            <React.Fragment key={it.id || i}>
              {i === firstDanger && i > 0 ? <div role="separator" className="hk-menusep" /> : null}
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                aria-disabled={off || undefined}
                className={`hk-menuitem${it.danger ? " hk-menuitem--danger" : ""}`}
                onClick={() => {
                  if (off) return;
                  close();
                  it.onSelect?.();
                }}
              >
                {it.icon ? <HouseIcon icon={it.icon} /> : <span style={{ width: "var(--house-icon-control)" }} aria-hidden="true" />}
                <span className="hk-menuitem-text">
                  <span>{it.label}</span>
                  {off ? <span className="hk-hint">{it.disabledReason}</span> : null}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </KitPopover>
    </>
  );
}

export { Menu };
