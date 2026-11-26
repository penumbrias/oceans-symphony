// The phone's attention line (new house step 2.2, building code §5): one
// line above the bottom bar, one item at a time, "+N" for the rest. It sits
// in the flow, so the page gets shorter instead of being covered. It grows
// to two lines rather than cut a message off.
//
//   <AttentionLine item={item} rest={2} onNext={…} />
//
// item: { title, detail, icon (Lucide component or a short emoji),
//         tone ("warn" for a failed save), onOpen (tap the words),
//         actions: [{ label, onClick, primary, busy }],
//         menu: [{ id, label, onSelect }]  (behind ⋯, named for the item),
//         dismiss: { label, onClick },
//         ticking: the detail is a clock; shown, never announced per tick }
//
// Handlers are read from `item` when pressed, never captured at render:
// a publisher refreshes them in place (houseZones `sig`) without a re-render.
//
// The region is a polite live region that is always in the page, so a new
// item is announced even when the line was empty before.

import React from "react";
import { X } from "lucide-react";
import HouseIcon from "@/house/tokens/HouseIcon";
import { Button, IconButton } from "@/house/kit/Button";
import Menu from "@/house/kit/Menu";
import "@/house/kit/frame/phoneKit.css";

export default function AttentionLine({ item, rest = 0, onNext, label = "Needs your attention" }) {
  return (
    <div className="hk-attn" role="status" aria-live="polite" aria-label={label} data-empty={item ? undefined : ""} data-tone={item?.tone || undefined}>
      {item ? (
        <div className="hk-attn-item" key={item.id}>
          {item.icon ? (
            <span className="hk-attn-icon" aria-hidden="true">
              {typeof item.icon === "string" ? item.icon : <HouseIcon icon={item.icon} size="frame" />}
            </span>
          ) : null}
          <span className="hk-attn-words">
            {item.onOpen ? (
              <button type="button" className="hk-attn-title hk-attn-open" onClick={() => item.onOpen?.()}>{item.title}</button>
            ) : <span className="hk-attn-title">{item.title}</span>}
            {item.detail ? <span className="hk-attn-detail" aria-live={item.ticking ? "off" : undefined}>{item.detail}</span> : null}
          </span>
          <span className="hk-attn-tools">
            {(item.actions || []).map((a, i) => (
              <Button key={a.label} rank={a.primary ? "primary" : "secondary"} busy={a.busy} busyLabel={a.busyLabel} onClick={(e) => item.actions?.[i]?.onClick?.(e)}>{a.label}</Button>
            ))}
            {item.menu?.length ? (
              <Menu label={`More for ${item.title}`}
                items={item.menu.map((m) => ({ ...m, onSelect: (...args) => item.menu?.find((x) => x.id === m.id)?.onSelect?.(...args) }))} />
            ) : null}
            {rest > 0 ? (
              <Button rank="quiet" className="hk-attn-more" aria-label={`${rest} more waiting. Show the next`} onClick={onNext}>{`+${rest}`}</Button>
            ) : null}
            {item.dismiss ? <IconButton icon={X} label={item.dismiss.label} onClick={() => item.dismiss?.onClick?.()} /> : null}
          </span>
        </div>
      ) : null}
    </div>
  );
}
