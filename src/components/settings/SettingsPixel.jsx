// Settings in the pixel look (mockup "Settings, appearance, desktop", board
// 07). Only the layout is new: every row, page, search and backup action is
// the one Settings.jsx already owns, handed in as props.
//
//  computer  [ Settings side list ] [ the open page: title bar + body ] [ Preview ]
//  phone     [ the open page: title bar + body ]
//
// On a computer Display options opens inline as a page here (the mockup's
// centre panel, same UiEditSheet body the sheet shows), with a button that
// still opens it as the sheet. The Preview panel shows on the look pages.
import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search, X as XIcon, Heart, Repeat, PenLine, CalendarDays, Settings as Gear } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { useResolvedAvatarUrl } from "@/hooks/useResolvedAvatarUrl";
import { collectFronting } from "@/lib/friendFronters";
import { Group, LinkRow } from "@/components/shared/SettingRows";
import "@/styles/pixel/settings.css";

const UiEditSheet = React.lazy(() => import("@/components/v2/UiEditSheet"));

// The pages whose changes the Preview panel shows.
const LOOK_PAGES = new Set(["display", "accessibility"]);

// Display options inline (computer only). Same body as the sheet.
export function InlineDisplayOptions({ onOpenSheet }) {
  return (
    <div className="pxs-display">
      <React.Suspense fallback={<p className="pxs-muted py-4">Loading…</p>}>
        <UiEditSheet />
      </React.Suspense>
      <div className="pxs-display-foot">
        <button type="button" className="pxs-btn" onClick={onOpenSheet}>Open as a sheet</button>
      </div>
    </div>
  );
}

function PreviewFronter({ alter }) {
  const formatAlter = useAlterLabel();
  const url = useResolvedAvatarUrl(alter?.avatar_url || alter?.image_url);
  return (
    <span className="flex items-center gap-2 min-w-0">
      {url
        ? <img src={url} alt="" className="pxs-pv-swatch" />
        : <span className="pxs-pv-swatch" style={{ background: alter?.color || "var(--px-text-2)" }} />}
      <b className="truncate" style={alter?.color ? { color: alter.color } : undefined}>{formatAlter(alter)}</b>
    </span>
  );
}

// A live sample of the look: the parts drawn with the same classes the
// app uses, so every change in the page beside it shows here at once. It
// only shows; nothing in it can be pressed.
function LookPreview() {
  const terms = useTerms();
  const { data: activeFront = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list() });
  const fronters = useMemo(() => {
    const byId = new Map(alters.map((a) => [a.id, a]));
    return collectFronting(activeFront).map((f) => byId.get(f.alterId)).filter(Boolean).slice(0, 3);
  }, [activeFront, alters]);
  const since = useMemo(() => {
    const times = activeFront.map((s) => s.start_time).filter(Boolean).sort();
    return times[0] ? new Date(times[0]).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  }, [activeFront]);
  const textPct = (() => {
    try { return Math.round((parseFloat(getComputedStyle(document.documentElement).fontSize) / 16) * 100); } catch { return 100; }
  })();
  return (
    <aside className="pxs-panel pxs-preview" aria-label="Preview of the look">
      <div className="pxs-ttl"><span>Preview</span><span className="pxs-ttl-r">live</span></div>
      <div className="pxs-preview-body" aria-hidden="true">
        <div className="pxs-panel">
          <div className="pxs-ttl"><span>Who's {terms.fronting}</span><span className="pxs-ttl-r">...</span></div>
          <div className="pxs-pv-front">
            {fronters.length === 0 && <span className="pxs-muted">No one set</span>}
            {fronters.map((a) => <PreviewFronter key={a.id} alter={a} />)}
            {since && <span className="pxs-muted">since {since}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <span className="pxs-btn on">Check in</span>
          <span className="pxs-btn">Write</span>
        </div>
        <div className="pxs-pv-sunk">Text looks like this at {textPct}%.</div>
        <div className="pxs-pv-icons">
          {[Heart, Repeat, PenLine, CalendarDays, Gear].map((Icon, i) => (
            <span key={i} className="pxs-btn"><Icon /></span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SearchBox({ query, setQuery, tour }) {
  return (
    <div className="pxs-search" role="search" data-tour={tour}>
      <Search aria-hidden />
      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a setting" aria-label="Search settings" />
      {query && (
        <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><XIcon className="w-3.5 h-3.5" /></button>
      )}
    </div>
  );
}

export default function SettingsPixel({
  desk, groups, shownGroups, openPage, foundGroup, query, setQuery,
  onOpenRow, onHome, onBack, headerExtras, intro,
}) {
  const showPreview = desk && openPage && LOOK_PAGES.has(openPage.id);
  const sideGroups = query ? shownGroups : groups;
  return (
    <div className={`pxs-ws${showPreview ? " pxs-has-preview" : ""}`}>
      {desk && (
        <aside className="pxs-panel pxs-side" aria-label="Settings sections" data-tour="settings-side-panel">
          <div className="pxs-ttl"><span>Settings</span><span className="pxs-ttl-r">find</span></div>
          <div className="pxs-find"><SearchBox query={query} setQuery={setQuery} tour="settings-quick-nav" /></div>
          <nav className="pxs-tree">
            <button type="button" className={`pxs-tree-row${!openPage ? " sel" : ""}`} aria-current={!openPage ? "page" : undefined}
              onClick={onHome}>All settings</button>
            {sideGroups.length === 0 && <p className="pxs-muted px-2 py-2">Nothing matches "{query}".</p>}
            {sideGroups.map((g) => (
              <React.Fragment key={g.id}>
                <p className="pxs-tree-head">{g.label}</p>
                {g.pages.map((p) => {
                  const sel = openPage?.id === p.id;
                  return (
                    <button key={p.id} type="button" className={`pxs-tree-row${sel ? " sel" : ""}`} aria-current={sel ? "page" : undefined}
                      title={p.hint} onClick={() => onOpenRow(p)}>{p.label}</button>
                  );
                })}
              </React.Fragment>
            ))}
          </nav>
        </aside>
      )}

      <section className="pxs-panel min-w-0" data-tour="settings-content">
        {openPage && openPage.render ? (
          <>
            <div className="pxs-ttl pxs-ttl-big">
              <span className="pxs-ttl-l">
                <button type="button" className="pxs-ttl-btn" onClick={onBack} aria-label="Back to Settings">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <h1>{foundGroup?.label ? `${foundGroup.label}: ` : ""}{openPage.label}</h1>
              </span>
              <span className="pxs-ttl-r">{openPage.id === "display" ? "every change shows live" : openPage.hint}</span>
            </div>
            <div className="pxs-body">
              <div key={openPage.id} className="pxs-page">{openPage.render()}</div>
            </div>
          </>
        ) : (
          <>
            <div className="pxs-ttl pxs-ttl-big">
              <span className="pxs-ttl-l"><h1>Settings</h1></span>
              <span className="pxs-ttl-r">{headerExtras?.version}</span>
            </div>
            <div className="pxs-body">
              {intro}
              {!desk && <SearchBox query={query} setQuery={setQuery} tour="settings-quick-nav" />}
              <div className="pxs-home-list">
                {shownGroups.length === 0 && <p className="pxs-muted py-6 text-center">Nothing matches "{query}".</p>}
                {shownGroups.map((g, i) => (
                  <div key={g.id} id={`settings-group-${g.id}`} data-tour={g.tour} className="pxs-home-group scroll-mt-4">
                    <Group title={g.label} first={i === 0}>
                      {g.pages.map((p) => (
                        <LinkRow key={p.id} label={p.label} hint={p.hint} icon={p.icon} tour={p.tour} onClick={() => onOpenRow(p)} />
                      ))}
                    </Group>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {showPreview && <LookPreview />}
    </div>
  );
}
