// The kit's Layers (new house step 1.3): an ordered list, top first, where
// each row shows or hides its layer and moves up or down.
//
//   <Layers label="Layers of the inner world" layers={layers}
//     onReorder={(next) => saveOrder(next)} onToggle={(id, visible) => setVisible(id, visible)} />
//
// Moving: the ↑ / ↓ buttons, or Alt + ↑ / ↓ (Alt + Home / End for the top
// and bottom) from anywhere in the row. Focus stays on what moved, and a
// screen reader hears where it went ("Forest moved to 2 of 5").
// Showing and hiding: an eye button with ONE signal (kit gate item 6): a
// name that never changes ("Show Forest") and aria-pressed for the state,
// so a screen reader says "Show Forest, toggle button, pressed" while the
// layer shows and "not pressed" while it's hidden. The name never flips to
// "Hide…", which together with "pressed" would say two things at once. Hidden rows stay in the list,
// greyed with dashed edges and the word "Hidden". Layers only reports the
// new order or visibility; the host writes it through its one writer.

import React, { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { IconButton } from "@/house/kit/Button";
import { moveById, moveWords } from "@/house/kit/lists";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";

export default function Layers({ label, layers = [], getId = (l) => l.id, getName = (l) => l.name, onReorder, onToggle, renderLead }) {
  const [said, setSaid] = useState("");
  const listRef = useRef(null);
  const move = (layer, delta, focusWhich) => {
    const id = getId(layer);
    const next = moveById(layers, id, delta, getId);
    const to = next.findIndex((l) => getId(l) === id);
    if (next.every((l, i) => getId(l) === getId(layers[i]))) return;
    onReorder?.(next);
    setSaid(moveWords(getName(layer), to, next.length));
    // Keep focus on the same control of the row that moved (or on the other
    // arrow when this one just became unavailable at an end).
    requestAnimationFrame(() => {
      const row = listRef.current?.querySelector(`[data-layer="${CSS.escape(String(id))}"]`);
      const atTop = to === 0, atBottom = to === next.length - 1;
      let which = focusWhich;
      if (which === "up" && atTop) which = "down";
      if (which === "down" && atBottom) which = "up";
      (row?.querySelector(`[data-move="${which}"]`) || row?.querySelector("button"))?.focus();
    });
  };
  const onKey = (layer) => (e) => {
    if (!e.altKey) return;
    const which = e.target?.dataset?.move || "up";
    if (e.key === "ArrowUp") { e.preventDefault(); move(layer, -1, which); }
    else if (e.key === "ArrowDown") { e.preventDefault(); move(layer, 1, which); }
    else if (e.key === "Home") { e.preventDefault(); move(layer, "top", which); }
    else if (e.key === "End") { e.preventDefault(); move(layer, "bottom", which); }
  };
  return (
    <div className="hk-layers-wrap">
      <ol ref={listRef} className="hk-layers" aria-label={label}>
        {layers.map((layer, i) => {
          const id = getId(layer);
          const name = getName(layer);
          const visible = layer.visible !== false;
          return (
            <li key={id} className="hk-layer" data-layer={id} data-hidden={!visible || undefined} onKeyDown={onKey(layer)}>
              <IconButton icon={visible ? Eye : EyeOff} label={`Show ${name}`}
                aria-pressed={visible} onClick={() => onToggle?.(id, !visible)}
                disabledReason={layer.lockedReason || undefined} />
              {renderLead ? <span className="hk-layer-lead">{renderLead(layer)}</span> : null}
              <span className="hk-layer-name">
                <span>{name}</span>
                {!visible ? <span className="hk-layer-state">Hidden</span> : null}
              </span>
              {layer.lockedReason ? <HouseIcon icon={Lock} label={`${name}: ${layer.lockedReason}`} /> : null}
              <span className="hk-layer-moves">
                <IconButton icon={ArrowUp} data-move="up" label={`Move ${name} up`}
                  disabledReason={i === 0 ? "Already at the top" : undefined} onClick={() => move(layer, -1, "up")} />
                <IconButton icon={ArrowDown} data-move="down" label={`Move ${name} down`}
                  disabledReason={i === layers.length - 1 ? "Already at the bottom" : undefined} onClick={() => move(layer, 1, "down")} />
              </span>
            </li>
          );
        })}
      </ol>
      <p className="hk-hint">Alt + ↑ or ↓ moves the row you're on.</p>
      <div className="hk-sr" role="status" aria-live="polite">{said}</div>
    </div>
  );
}

export { Layers };
