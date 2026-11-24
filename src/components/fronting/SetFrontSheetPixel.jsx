// The set-front sheet in the pixel look — the "Set front" phone board
// (SetFrontPhone): one panel titled "Who's in front" with Cancel / Save in
// its title bar, Alters · By group · New presence tabs, the people in front
// now as sunken rows (level chip + remove box), everyone else as tick rows,
// and the trigger / unsure / journal options pinned at the bottom.
//
// Markup only. Every piece of state and every handler belongs to
// SetFrontSheet, which still saves through src/lib/setFront.js — this file
// never writes a session. Rendered only while the pixel look is on.
import React from "react";
import { formatDistanceToNow } from "date-fns";
import { Search, User, List, Grid3x3 } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import AlterLabelToggle from "@/components/shared/AlterLabelToggle";
import AlterTreeSelect from "@/components/shared/AlterTreeSelect";
import SearchableSelect from "@/components/shared/SearchableSelect";
import AlterSortToggle from "@/components/shared/AlterSortToggle";
import PresencePicker from "@/components/presences/PresencePicker";
import { SetFrontGridCard } from "@/components/fronting/SetFrontModal";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { frontLevelLabel } from "@/lib/frontLevels";
import { an } from "@/lib/articles";
import "@/styles/pixel/sheets.css";

// The alter's mark: their picture, else their colour square.
function Mark({ alter }) {
  const resolved = useResolvedAvatarUrl(alter.avatar_url);
  return (
    <span className="psh-av" style={{ backgroundColor: alter.color || "var(--px-tab)" }}>
      {resolved ? <img src={resolved} alt="" /> : !alter.color ? <User className="w-4 h-4" /> : null}
    </span>
  );
}

function NowRow({ alter, entry, levelCfg, terms, formatAlter, onTogglePrimary, onLevel, onRemove, holdProps }) {
  const since = entry.startTime
    ? `${terms.fronting} ${formatDistanceToNow(new Date(entry.startTime), { addSuffix: false })}`
    : "new";
  return (
    <div {...(holdProps || {})} className="psh-ins psh-row psh-now">
      <Mark alter={alter} />
      <span className="psh-who">
        <span className="psh-name">{formatAlter(alter)}{alter.pronouns && <span className="psh-mut psh-pro"> {alter.pronouns}</span>}</span>
        <span className="psh-mut psh-small">{since}</span>
      </span>
      {levelCfg.enabled ? (
        <SearchableSelect
          className="psh-sel"
          value={entry.level}
          onChange={(v) => { if (v) onLevel(alter.id, v); }}
          options={levelCfg.levels.map((l) => ({ id: l.id, label: frontLevelLabel(l, terms) }))}
          placeholder={`${terms.Front} level`}
          searchPlaceholder="Search levels..."
          zIndex={70}
        />
      ) : (
        <button type="button" className={`psh-chip${entry.isPrimary ? " sel" : ""}`}
          aria-pressed={entry.isPrimary}
          aria-label={entry.isPrimary ? `${formatAlter(alter)} is primary — tap to make co-${terms.front} only` : `Make ${formatAlter(alter)} primary`}
          onClick={() => onTogglePrimary(alter.id)}>
          {entry.isPrimary ? "Primary" : `Co-${terms.fronting}`}
        </button>
      )}
      <button type="button" className="psh-tick y" onClick={() => onRemove(alter.id)}
        aria-label={`Remove ${formatAlter(alter)} from the ${terms.front}`}>x</button>
    </div>
  );
}

function RestRow({ alter, formatAlter, onAdd, holdProps }) {
  return (
    <button type="button" {...(holdProps || {})} onClick={() => onAdd(alter.id)}
      className="psh-line psh-row psh-rest" aria-label={`Add ${formatAlter(alter)}`}>
      <Mark alter={alter} />
      <span className="psh-who psh-who-inline">
        <span className="psh-name">{formatAlter(alter)}</span>
        {alter.pronouns && <span className="psh-mut psh-pro"> {alter.pronouns}</span>}
      </span>
      <span className="psh-tick" aria-hidden="true" />
    </button>
  );
}

export default function SetFrontSheetPixel(p) {
  const {
    terms, formatAlter, levelCfg, sorter,
    tab, setTab, viewMode, setViewMode, search, setSearch,
    draft, altersById, isUnsure, setIsUnsure, primaryId,
    addList, activeAlters, groups, draftIds,
    onClose, onSave, saving,
    togglePrimary, setLevel, removeAlter, guardedAdd, guardedToggleFromView, setMany,
    getAddHoldProps, draftLevelOf, levelName, treeGroupRail,
    railNodes,
    journalSwitch, setJournalSwitch, triggeredSwitch, setTriggeredSwitch,
    triggerCategory, setTriggerCategory, triggerLabel, setTriggerLabel, allTriggerCategories,
  } = p;

  const pxTab = tab === "presence" ? "presence" : viewMode === "tree" ? "group" : "alters";
  const pickTab = (id) => {
    if (id === "presence") { setTab("presence"); return; }
    setTab("fronters");
    if (id === "group") setViewMode("tree");
    else if (viewMode === "tree") setViewMode("list");
  };
  const tabs = [["alters", terms.Alters], ["group", "By group"], ["presence", "New presence"]];

  return (
    <div className="psh-pn psh-sf">
      <div className="psh-ttl psh-ttl-lg">
        <DialogTitle asChild><span className="psh-ttl-name">Who's in {terms.front}</span></DialogTitle>
        <span className="psh-ttl-acts">
          <button type="button" className="psh-btn" onClick={onClose}>Cancel</button>
          {tab !== "presence" && (
            <button type="button" className="psh-btn on" onClick={onSave} disabled={saving}>
              {saving ? "Saving…" : isUnsure ? `Clear ${terms.front}` : "Save"}
            </button>
          )}
        </span>
      </div>

      <div className="psh-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={pxTab === id}
            className={`psh-tab${pxTab === id ? " sel" : ""}`} onClick={() => pickTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="psh-body">
        {tab === "presence" ? (
          <PresencePicker onClose={onClose} />
        ) : (
          <>
            {viewMode !== "tree" && (
              <div className="psh-searchrow">
                <label className="psh-ins psh-search">
                  <Search className="w-4 h-4 psh-mut" aria-hidden="true" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..." aria-label={`Search ${terms.alters}`} />
                </label>
                <AlterSortToggle sorter={sorter} data-tour="setfront-sort" className="psh-iconbtn" />
                <button type="button" className="psh-iconbtn"
                  aria-label={viewMode === "grid" ? "List view" : "Grid view"}
                  onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
                  {viewMode === "grid" ? <List className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
                </button>
              </div>
            )}

            <div className="psh-sub">
              <span>In {terms.front} now {isUnsure ? "" : <span className="psh-count">{draft.length}</span>}</span>
              <AlterLabelToggle size="xs" />
            </div>
            {isUnsure ? (
              <div className="psh-ins psh-note">Unsure — saving will clear the {terms.front}.</div>
            ) : draft.length === 0 ? (
              <div className="psh-note psh-mut">No one selected yet — tap {an(terms.alter)} below to add them.</div>
            ) : (
              <div className="psh-list">
                {draft.map((entry) => {
                  const alter = altersById[entry.alterId];
                  if (!alter) return null;
                  return (
                    <NowRow key={entry.alterId} alter={alter} entry={entry}
                      levelCfg={levelCfg} terms={terms} formatAlter={formatAlter}
                      onTogglePrimary={togglePrimary} onLevel={setLevel} onRemove={removeAlter}
                      holdProps={getAddHoldProps(entry.alterId, entry.level)} />
                  );
                })}
              </div>
            )}
            {!isUnsure && draft.length > 0 && !primaryId && !levelCfg.enabled && (
              <div className="psh-note psh-mut psh-small">
                No primary set — tap a chip to mark who leads, or leave everyone co-{terms.fronting}.
              </div>
            )}

            <div className="psh-sub">{viewMode === "tree" ? `${terms.Alters} by group` : "Everyone else"}</div>
            {viewMode === "tree" ? (
              <AlterTreeSelect
                alters={activeAlters}
                groups={groups}
                isSelected={(id) => draftIds.has(id)}
                onToggle={(a) => guardedToggleFromView(a.id)}
                onSetMany={setMany}
                maxHeight="none"
                rowProps={(a) => getAddHoldProps(a.id, draftLevelOf(a.id))}
                rowBadge={(a) => (draftIds.has(a.id) && levelCfg.levels.length > 1 ? levelName(draftLevelOf(a.id)) : null)}
                groupRail={treeGroupRail}
              />
            ) : viewMode === "grid" ? (
              <div className="psh-grid">
                {addList.map((a) => (
                  <SetFrontGridCard key={a.id} alter={a} selected={false} isPrimary={false}
                    onToggle={() => guardedAdd(a.id)} holdProps={getAddHoldProps(a.id, null)} />
                ))}
                {addList.length === 0 && <p className="psh-note psh-mut">Everyone's already selected.</p>}
              </div>
            ) : (
              <div className="psh-list psh-list-flat">
                {addList.map((a) => (
                  <RestRow key={a.id} alter={a} formatAlter={formatAlter} onAdd={guardedAdd}
                    holdProps={getAddHoldProps(a.id, null)} />
                ))}
                {addList.length === 0 && <p className="psh-note psh-mut">Everyone's already selected.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {railNodes}

      {tab !== "presence" && (
        <div className="psh-foot">
          <div className="psh-row psh-trig">
            <button type="button" className="psh-tickrow" data-tour="setfront-triggered"
              aria-pressed={triggeredSwitch} disabled={isUnsure}
              onClick={() => setTriggeredSwitch(!triggeredSwitch)}>
              <span className={`psh-tick${triggeredSwitch && !isUnsure ? " y" : ""}`} aria-hidden="true">{triggeredSwitch && !isUnsure ? "x" : ""}</span>
              <span className="psh-mut">Trigger</span>
            </button>
            <SearchableSelect
              className="psh-sel psh-sel-grow"
              value={triggerCategory}
              onChange={(v) => { setTriggerCategory(v || ""); if (v) setTriggeredSwitch(true); }}
              options={allTriggerCategories.map((c) => ({ id: c.id, label: `${c.emoji} ${c.label}` }))}
              placeholder="Trigger category..."
              searchPlaceholder="Search triggers..."
              zIndex={70}
              disabled={isUnsure}
            />
            <button type="button" className={`psh-chip${isUnsure ? " sel" : ""}`}
              aria-pressed={isUnsure} onClick={() => setIsUnsure(!isUnsure)}>
              Unsure
            </button>
          </div>
          <input className="psh-ins psh-field" value={triggerLabel} disabled={isUnsure}
            onChange={(e) => { setTriggerLabel(e.target.value); if (e.target.value) setTriggeredSwitch(true); }}
            placeholder="Details (optional)" aria-label="Trigger details" />
          <button type="button" className="psh-tickrow" data-tour="setfront-journal"
            aria-pressed={journalSwitch} disabled={isUnsure}
            onClick={() => setJournalSwitch(!journalSwitch)}>
            <span className={`psh-tick${journalSwitch && !isUnsure ? " y" : ""}`} aria-hidden="true">{journalSwitch && !isUnsure ? "x" : ""}</span>
            <span>Write {an(terms.switch)} {terms.switch} journal after saving</span>
          </button>
        </div>
      )}
    </div>
  );
}
