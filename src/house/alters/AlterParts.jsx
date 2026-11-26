// The Alters room's parts (boards 03-Alters and 12-AlterProfilePhone): the
// square picture, a card, a list row, the groups tree, the Info panel and
// the week bars. Display only: every action is handed in by the room, and
// the room acts only through the write paths (setFront.js via
// toggleFrontFor, groupMembership.js, the settings writer).

import React, { useCallback, useRef } from "react";
import { ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { format, isToday } from "date-fns";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel } from "@/house/kit/Panel";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { alterPictureStyle } from "@/lib/imageFraming";
import { isValidHexColor } from "@/lib/colorUtils";
import { alterRoles } from "@/lib/alterRoles";
import { anonymizeBlurNames, anonymizeBlurAvatars } from "@/hooks/useAnonymizeMode";
import { hoursWords } from "@/house/alters/altersModel";

export const colourOf = (alter) => (isValidHexColor(alter?.color) ? alter.color : "var(--house-title)");

// ── Press and hold (the old page's action menu gesture) ─────────────────
// Holding a card or row for half a second opens its menu; a right-click
// does too. The click that ends a hold is swallowed so it doesn't also act.
export function useHold(onHold, ms = 500) {
  const timer = useRef(null);
  const held = useRef(false);
  const start = useRef(null);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  const onPointerDown = useCallback((e) => {
    if (e.button && e.button !== 0) return;
    held.current = false;
    start.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => { held.current = true; onHold?.(); }, ms);
  }, [onHold, ms]);
  const onPointerMove = useCallback((e) => {
    if (!start.current) return;
    if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear();
  }, []);
  const onEnd = useCallback(() => { clear(); start.current = null; }, []);
  const onContextMenu = useCallback((e) => { e.preventDefault(); clear(); held.current = true; onHold?.(); }, [onHold]);
  const swallow = useCallback((e) => {
    if (held.current) { held.current = false; e.preventDefault(); e.stopPropagation(); return true; }
    return false;
  }, []);
  return { bind: { onPointerDown, onPointerMove, onPointerUp: onEnd, onPointerLeave: onEnd, onPointerCancel: onEnd, onContextMenu }, swallow };
}

// ── The square picture (the alter's colour behind their picture) ────────
export function SquareAvatar({ alter, size = "md", blur = false }) {
  const rotating = useRotatingImageUrl({ alterId: alter?.id, role: "avatar", mode: alter?.avatar_rotation_mode, fallbackUrl: alter?.avatar_url, alter });
  const url = useResolvedAvatarUrl(alter ? rotating : null);
  return (
    <span className={`hal-av hal-av--${size}${blur ? " hal-blur" : ""}`} style={{ background: colourOf(alter) }} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} style={alterPictureStyle(alter, rotating)} /> : null}
    </span>
  );
}

export function RoleChips({ alter, extra = null, max = 3 }) {
  const roles = alterRoles(alter).slice(0, max);
  if (!roles.length && !extra) return null;
  return (
    <span className="hal-chips">
      {roles.map((r, i) => <span key={`${r}-${i}`} className="hal-chip">{r}</span>)}
      {extra}
    </span>
  );
}

// ── A card on the floor (board 03) ──────────────────────────────────────
export function AlterCardTile({ alter, line, selected, picked, anonymize, subsystems = [], onActivate, onHold, onOpenSub }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const label = formatAlter(alter) || "Unnamed";
  const { bind, swallow } = useHold(onHold);
  const roles = alterRoles(alter);
  const spoken = [label, alter.pronouns, roles.join(", "), line.words].filter(Boolean).join(", ");
  return (
    <div className="hal-card-wrap" data-highlight-id={alter.id}>
      <Button rank="quiet" className="hal-card" data-selected={selected || undefined} data-picked={picked || undefined}
        aria-pressed={selected || picked} aria-label={spoken}
        onClick={(e) => { if (swallow(e)) return; onActivate?.(e); }} {...bind}>
        <SquareAvatar alter={alter} size="lg" blur={anonymizeBlurAvatars(anonymize)} />
        <span className={`hal-card-name${anonymizeBlurNames(anonymize) ? " hal-blur" : ""}`}>{alter.emoji ? `${alter.emoji} ` : ""}{label}</span>
        {alter.pronouns ? <span className="hal-card-sub">{alter.pronouns}</span> : null}
        {roles.length ? <span className="hal-chip">{roles[0]}</span> : null}
        {line.words ? <span className={line.on ? "hal-front-on" : "hal-card-foot"}>{line.words}</span> : null}
      </Button>
      {subsystems.length ? (
        <span className="hal-card-subs">
          {subsystems.map((g) => (
            <Button key={g.id} rank="quiet" className="hal-sublink" onClick={() => onOpenSub?.(g)}>
              {`${g.name || `Sub${t.system}`} ›`}
            </Button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

// ── A row in the list view ──────────────────────────────────────────────
export function AlterListRow({ alter, line, selected, picked, anonymize, onActivate, onHold, onFront }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const label = formatAlter(alter) || "Unnamed";
  const { bind, swallow } = useHold(onHold);
  const roles = alterRoles(alter);
  return (
    <li className="hal-row" data-selected={selected || undefined} data-picked={picked || undefined} data-highlight-id={alter.id}>
      <Button rank="quiet" className="hal-row-main" aria-pressed={selected || picked}
        onClick={(e) => { if (swallow(e)) return; onActivate?.(e); }} {...bind}>
        <SquareAvatar alter={alter} size="sm" blur={anonymizeBlurAvatars(anonymize)} />
        <span className="hal-row-text">
          <span className={`hal-row-name${anonymizeBlurNames(anonymize) ? " hal-blur" : ""}`}>{alter.emoji ? `${alter.emoji} ` : ""}{label}</span>
          <span className="hal-row-sub">{[alter.pronouns, roles.join(", ")].filter(Boolean).join("  ·  ")}</span>
        </span>
        {line.words ? <span className={line.on ? "hal-front-on" : "hal-card-foot"}>{line.words}</span> : null}
      </Button>
      <Button rank="secondary" className="hal-row-front" onClick={() => onFront?.(alter)}>
        {line.on ? `Remove from ${t.front}` : `Add to ${t.front}`}
      </Button>
    </li>
  );
}

// ── The groups tree (board 03's left panel) ─────────────────────────────
export function GroupsTree({ rows, everyoneCount, ungroupedCount, pickedId, hideGrouped, anonymize, countOf, onPick, onPickNoGroup, onFold, onOpen }) {
  const t = useTerms();
  const blur = anonymizeBlurNames(anonymize);
  const none = !pickedId && !hideGrouped;
  return (
    <ul className="hal-tree" aria-label="Groups">
      <li className="hal-tree-row" data-selected={none || undefined}>
        <span className="hal-tree-arrow" aria-hidden="true" />
        <Button rank="quiet" className="hal-tree-pick" aria-pressed={none} onClick={() => onPick(null)}>
          <span className="hal-sq" style={{ background: "var(--house-text)" }} aria-hidden="true" />
          <span className="hal-tree-name">Everyone</span>
          <span className="hal-count">{everyoneCount}</span>
        </Button>
      </li>
      {rows.map(({ g, hasKids, open }) => {
        const sel = pickedId === g.id;
        return (
          <li key={g.id} className="hal-tree-row" data-selected={sel || undefined} style={{ paddingLeft: `${Math.min(g._depth, 8)}rem` }}>
            {hasKids
              ? <IconButton icon={open ? ChevronDown : ChevronRight} label={`${open ? "Fold" : "Unfold"} ${g.name || "group"}`} aria-expanded={open} className="hal-tree-arrow" onClick={() => onFold(g.id)} />
              : <span className="hal-tree-arrow" aria-hidden="true" />}
            <Button rank="quiet" className="hal-tree-pick" aria-pressed={sel} title="Show its members; press again for everyone" onClick={() => onPick(g)}
              onDoubleClick={() => onOpen(g)}>
              <span className="hal-sq" style={{ background: isValidHexColor(g.color) ? g.color : "var(--house-title)" }} aria-hidden="true" />
              <span className={`hal-tree-name${blur ? " hal-blur" : ""}`}>{g.name || "Unnamed group"}{g.owner_alter_id ? ` (sub${t.system})` : ""}</span>
              <span className="hal-count">{countOf(g)}</span>
            </Button>
            <IconButton icon={ArrowRight} label={`Open ${g.name || "group"}`} className="hal-tree-open" onClick={() => onOpen(g)} />
          </li>
        );
      })}
      {rows.length ? (
        <li className="hal-tree-row" data-selected={hideGrouped || undefined}>
          <span className="hal-tree-arrow" aria-hidden="true" />
          <Button rank="quiet" className="hal-tree-pick" aria-pressed={hideGrouped} onClick={onPickNoGroup}>
            <span className="hal-sq" style={{ background: "var(--house-bevel-raised, var(--house-muted))" }} aria-hidden="true" />
            <span className="hal-tree-name">No group</span>
            <span className="hal-count">{ungroupedCount}</span>
          </Button>
        </li>
      ) : null}
    </ul>
  );
}

// ── The week as seven bars (board 03's "Fronting this week") ────────────
export function WeekBars({ week, colour, label }) {
  const max = Math.max(1, ...week.map((d) => d.hours));
  return (
    <div className="hal-week">
      <div className="hal-week-bars" role="img" aria-label={`${label}: ${week.map((d) => `${d.name} ${hoursWords(d.hours)}`).join(", ")}`}>
        {week.map((d) => (
          <span key={d.start} title={`${d.name}: ${hoursWords(d.hours)}`}
            style={{ height: `${Math.max(d.hours > 0 ? 10 : 3, Math.round((d.hours / max) * 100))}%`, background: colour }} />
        ))}
      </div>
      <div className="hal-week-days" aria-hidden="true">{week.map((d) => <span key={d.start}>{d.name.slice(0, 2)}</span>)}</div>
    </div>
  );
}

// ── Board 12's week (Mon to Sun): one lane a day ──────────────────
export function WeekLanes({ week, colour, label }) {
  return (
    <div className="hal-lanes" role="img" aria-label={`${label}: ${week.map((d) => `${d.name} ${hoursWords(d.hours)}`).join(", ")}`}>
      {week.map((d) => (
        <div key={d.start} className="hal-lane">
          <span className="hal-lane-day">{d.name}</span>
          <span className="hal-lane-track">
            {d.bars.map((b, i) => (
              <span key={i} style={{ left: `${b.from * 100}%`, width: `${Math.max(0.8, (b.to - b.from) * 100)}%`, background: colour }} />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── The Info panel (board 03's right column) ────────────────────────────
export function AlterInfoPanel({ alter, facts, week, front, anonymize, onOpen, onEdit, onFront, onMessage, onMenu }) {
  const t = useTerms();
  const formatAlter = useAlterLabel();
  const label = formatAlter(alter) || "Unnamed";
  const blur = anonymizeBlurNames(anonymize);
  const total = week.reduce((n, d) => n + d.hours, 0);
  return (
    <Panel className="hal-info" headingLevel={2} title={<span className={blur ? "hal-blur" : undefined}>{`Info: ${label}`}</span>}
      tools={<Button rank="quiet" onClick={onEdit}>Edit</Button>}>
      <div className="hal-info-body" data-tour="alters-info-panel">
        <div className="hal-info-head">
          <SquareAvatar alter={alter} size="xl" blur={anonymizeBlurAvatars(anonymize)} />
          <span className="hal-info-who">
            <span className={`hal-info-name${blur ? " hal-blur" : ""}`}>{alter.emoji ? `${alter.emoji} ` : ""}{label}</span>
            <span className="hal-muted">{[alter.pronouns, alter.alias && alter.alias !== label ? `aka ${alter.alias}` : null].filter(Boolean).join("  ·  ")}</span>
          </span>
        </div>
        <RoleChips alter={alter} max={6} />
        {facts.length ? (
          <dl className="hal-facts">
            {facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        ) : null}
        <div className="hal-info-week-ttl"><span className="house-label">{`${t.Fronting} this week`}</span><span className="hal-muted">{hoursWords(total)}</span></div>
        <WeekBars week={week} colour={colourOf(alter)} label={`${t.Fronting} this week`} />
        <div className="hal-actions">
          <Button rank="primary" onClick={onOpen}>Open profile</Button>
          <Button rank="secondary" onClick={onFront}>{front ? `Remove from ${t.front}` : `Add to ${t.front}`}</Button>
          <Button rank="secondary" onClick={onMessage}>Message</Button>
          <Button rank="quiet" onClick={onMenu}>More…</Button>
        </div>
      </div>
    </Panel>
  );
}

/** The facts under the name (board 03): age, groups, first appeared, in front since, feels lately. */
export function infoFacts(alter, { groups = [], session = null, feels = [], terms = {} }) {
  const since = session?.start_time ? new Date(session.start_time) : null;
  return [
    alter.age ? ["Age", String(alter.age)] : null,
    groups.length ? ["Groups", groups.map((g) => g.name).filter(Boolean).join(", ")] : null,
    alter.origin_year ? ["First appeared", String(alter.origin_year)] : null,
    since && !Number.isNaN(since.getTime()) ? [`${terms.Fronting || "Fronting"} since`, `${format(since, "h:mm a")}${isToday(since) ? " today" : `, ${format(since, "MMM d")}`}`] : null,
    feels.length ? ["Feels lately", feels.join(", ")] : null,
  ].filter(Boolean);
}
