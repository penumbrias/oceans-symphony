// The open-page tabs (building code §2): the pages I have open, as
// bookmarks. File tabs joined to the page below, the current one raised and
// the page's colour, each with its own ✕. Desktop and compact studio only.
// Extras go into a "N more" menu. Only the current page is alive; a tab is a
// place to go back to, not a running page (plan §2, Tide).
//
//   <OpenTabs tabs={[{ id, title, path }]} current={id} onSelect={tab => …}
//     onClose={tab => …} onNew={() => …} max={8} />
//
// Keyboard: each tab is a link-like button (Enter goes there), its ✕ is the
// next stop. The strip is a <nav> named "Open pages"; the current tab says
// so (aria-current="page").

import React from "react";
import { Plus, X } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { IconButton } from "@/house/kit/Button";
import Menu from "@/house/kit/Menu";
import "@/house/kit/frame/frameKit.css";

export default function OpenTabs({ tabs = [], current, onSelect, onClose, onNew, max = 8, label = "Open pages" }) {
  // The current tab always shows, even when it is past `max`.
  let shown = tabs.slice(0, max);
  const cur = tabs.find((t) => t.id === current);
  if (cur && !shown.includes(cur)) shown = [...shown.slice(0, max - 1), cur];
  const extra = tabs.filter((t) => !shown.includes(t));
  return (
    <nav className="hk-otabs" aria-label={label}>
      <ul className="hk-otabs-list">
        {shown.map((t) => {
          const on = t.id === current;
          return (
            <li key={t.id} className="hk-otab" data-current={on || undefined}>
              <button
                type="button"
                className="hk-otab-go"
                aria-current={on ? "page" : undefined}
                title={t.title}
                onClick={() => onSelect?.(t)}
                onAuxClick={(e) => { if (e.button === 1 && tabs.length > 1) { e.preventDefault(); onClose?.(t); } }}
              >
                {t.icon ? <HouseIcon icon={t.icon} /> : null}
                <span className="hk-otab-text">{t.title}</span>
              </button>
              {tabs.length > 1 ? (
                <button type="button" className="hk-otab-x" aria-label={`Close the ${t.title} tab`} title={`Close the ${t.title} tab`} onClick={() => onClose?.(t)}>
                  <HouseIcon icon={X} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {extra.length ? (
        <Menu label={`${extra.length} more open page${extra.length === 1 ? "" : "s"}`} rank="quiet"
          items={extra.map((t) => ({ id: t.id, label: t.title, icon: t.icon, onSelect: () => onSelect?.(t) }))}>
          {`${extra.length} more`}
        </Menu>
      ) : null}
      {onNew ? <IconButton icon={Plus} label="Open a new tab" onClick={onNew} /> : null}
    </nav>
  );
}

export { OpenTabs };
