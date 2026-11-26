// The house's Settings room: board 07-Settings on a computer and tablet,
// board 10-Inspector's shell for Display options, and board 08-Phone's
// language on a phone. House mode only: the frames draw it on /settings
// (houseSettingsRoom); the old page is gated off (HouseRoomGate) and stays
// exactly as it was with the new house off.
//
//   Studio  Settings on the left (Find, then every page under its group;
//           the open one marked), the open page in the middle under its
//           title bar ("Look: Display options" · "every change shows
//           live"), and on the look pages a live Preview on the right.
//           With no page open the middle is the overview: the version,
//           your data (export, import, back up now), the links, and
//           What's new.
//   Phone   The list (Find, the overview, each group a panel of rows);
//           a row drills into its page, with the square ‹ back button
//           and the page's name in the heading font. Back lands on the
//           same row.
//
// One catalogue, one address. The pages, their search words and their
// deep links are the old ones (src/components/settings/settingsPages.jsx,
// `/settings#<page>`, LEGACY_HASHES, and `?section=` read as a hash), so
// every link in the app lands in both houses. The pages' own contents are
// the existing settings components inside house panels (they keep their
// old styling until each is rebuilt); Display options is drawn in the
// house's inspector shell (board 10's file tabs and rows) around the same
// UiEditSheet body the sheet shows.
//
// The room writes nothing by itself. Every setting is saved by the page
// that shows it, through its existing writer (settingsWriter.js and the
// pages' own save paths); the overview's backup buttons are the old ones
// (runAutoBackupNow, DataBackupRestore, ImportDataSection).

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Upload, Database, Globe, ExternalLink, LayoutTemplate } from "lucide-react";
import { HouseScope } from "@/house/tokens/HouseRoot";
import { Button, IconButton } from "@/house/kit/Button";
import { Panel, PageTabs } from "@/house/kit/Panel";
import { TextField } from "@/house/kit/Field";
import { Row } from "@/house/kit/Content";
import { Sheet } from "@/house/kit/Sheet";
import { LoadingBlock } from "@/house/kit/States";
import { showToast } from "@/house/kit/Toast";
import { useRoomTools } from "@/house/frame/roomTools";
import { useSettingsRow } from "@/house/frame/useFrameData";
import { PixelBack, PixelHeart, PixelSwitch, PixelPen, PixelCalendar, PixelGear } from "@/house/tokens/PixelGlyphs";
import { base44 } from "@/api/base44Client";
import { useTerms } from "@/lib/useTerms";
import { useAlterLabel } from "@/lib/useAlterLabel";
import { collectFronting } from "@/lib/friendFronters";
import { runAutoBackupNow } from "@/lib/autoBackup";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { APP_VERSION, APP_RELEASE_STAGE } from "@/lib/appVersion";
import {
  buildSettingsGroups, filterSettingsGroups, LEGACY_HASHES, EXPORT_FORMAT_EXTRAS,
} from "@/components/settings/settingsPages";
import PageTutorialsControls from "@/components/settings/PageTutorialsControls";
import DesktopUpdateButton from "@/components/settings/DesktopUpdateButton";
import DataBackupRestore from "@/components/settings/DataBackupRestore";
import ImportDataSection from "@/components/settings/ImportDataSection";
import DataRescuePanel from "@/components/settings/DataRescuePanel";
import BugReportModal from "@/components/settings/BugReportModal";
import FeedbackSurveyModal from "@/components/feedback/FeedbackSurveyModal";
import {
  settingsTarget, findPage, hrefFor, rowOpensPage, pageHeading, pageAside, isLookPage,
  versionWords, countPages, findWords, rememberList, takeList,
} from "@/house/settings/settingsModel";
import "@/house/kit/kit.css";
import "@/house/kit/panels.css";
import "@/house/settings/settings.css";

const UiEditSheet = React.lazy(() => import("@/components/v2/UiEditSheet"));

const LINKS = [
  { id: "site", label: "Official website", icon: Globe, url: "https://penumbrialecosystem.neocities.org/os" },
  { id: "releases", label: "Releases on GitHub", icon: ExternalLink, url: "https://github.com/penumbrias/oceans-symphony/releases" },
  { id: "discord", label: "Discord support", icon: ExternalLink, url: "https://discord.gg/S5rFXjrfWG" },
  { id: "templates", label: "Template gallery", icon: LayoutTemplate, url: "https://www.notion.so/709a266d2e0f4da7a4aaa02e180ee1ad?v=e950ba087a1d42bea4ee0784dc8307b1" },
];

const scroller = () => (typeof document !== "undefined" ? document.getElementById("main-content") : null);

export default function HouseSettings({ size = "full", tokens }) {
  const phone = size === "phone";
  const navigate = useNavigate();
  const location = useLocation();
  const terms = useTerms();
  const qc = useQueryClient();
  const settings = useSettingsRow();

  const [query, setQuery] = useState("");
  const [backup, setBackup] = useState(null); // "export" | "import" | null
  const [backingUp, setBackingUp] = useState(false);
  const [rescue, setRescue] = useState(false);
  const [bug, setBug] = useState(false);
  const [survey, setSurvey] = useState(false);

  const groups = useMemo(() => {
    const base = buildSettingsGroups({
      terms, navigate, settings,
      refetch: () => qc.invalidateQueries({ queryKey: ["systemSettings"] }),
      queryClient: qc,
      openRescue: () => setRescue(true),
      openBugReport: () => setBug(true),
      openFeedbackSurvey: () => setSurvey(true),
      renderTour: () => <PageTutorialsControls />,
    });
    // Display options opens here as a page, in the house's inspector shell
    // (board 07's middle, board 10's tabs); the sheet is one button away.
    return base.map((g) => ({
      ...g,
      pages: g.pages.map((p) => (p.id === "display" && p.action && !p.render
        ? { ...p, render: () => <DisplayOptionsPage onOpenSheet={p.action} /> }
        : p)),
    }));
  }, [terms, navigate, settings, qc]);

  const target = settingsTarget({ hash: location.hash, search: location.search, legacy: LEGACY_HASHES });
  const found = target.kind === "page" ? findPage(groups, target.id) : null;
  const openPage = found && rowOpensPage(found.page) ? found.page : null;

  // A hash that names an action (Find my data, a bug report…) runs it and
  // stays on the list, as in the old house.
  useEffect(() => {
    if (found?.page && !rowOpensPage(found.page)) {
      found.page.action?.();
      navigate("/settings", { replace: true });
    }
  }, [found?.page?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // A group link (#appearance, #data…) scrolls the list to that group.
  const groupId = target.kind === "group" ? target.groupId : null;
  useEffect(() => {
    if (!groupId) return;
    requestAnimationFrame(() => document.getElementById(`hst-group-${groupId}`)?.scrollIntoView({ block: "start" }));
  }, [groupId]);

  // Phone: a page opens at its top; Back lands where the list was.
  useEffect(() => {
    if (!phone) return;
    const main = scroller();
    if (openPage) { main?.scrollTo?.({ top: 0 }); return; }
    const saved = takeList();
    if (saved) {
      if (saved.query) setQuery(saved.query);
      requestAnimationFrame(() => requestAnimationFrame(() => { const m = scroller(); if (m) m.scrollTop = saved.scroll || 0; }));
    }
  }, [openPage?.id, phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const openRow = (page) => {
    if (!rowOpensPage(page)) { page.action?.(); return; }
    if (phone) rememberList({ scroll: scroller()?.scrollTop || 0, query });
    navigate(hrefFor(page));
  };
  const goBack = () => {
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
    else navigate("/settings");
  };
  const backUpNow = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try { await runAutoBackupNow({ natureChoice: true }); }
    catch (e) { showToast({ tone: "failed", message: e?.message || "Backup failed" }); }
    finally { setBackingUp(false); }
  };

  // The phone's ⋯ carries the backup doors too (nothing floats over the list).
  const tools = useMemo(() => (phone ? {
    items: [
      { id: "export", label: "Export a backup", icon: Download, onSelect: () => setBackup("export") },
      { id: "import", label: "Import a backup…", icon: Upload, onSelect: () => setBackup("import") },
      { id: "backup-now", label: "Back up now", icon: Database, onSelect: backUpNow },
    ],
  } : null), [phone]); // eslint-disable-line react-hooks/exhaustive-deps
  useRoomTools(tools);

  const shown = filterSettingsGroups(groups, query);
  const total = countPages(groups);
  const shownCount = countPages(shown);
  const version = versionWords(APP_VERSION, APP_RELEASE_STAGE);

  const ctx = {
    phone, groups, shown, total, shownCount, query, setQuery, openRow, openPage, found, version,
    backingUp, backUpNow, setBackup, terms,
  };

  const sheets = (
    <>
      <Sheet open={backup === "export"} onClose={() => setBackup(null)} title="Export a backup" size={phone ? "full" : "half"} side={phone ? "bottom" : "right"}>
        <div className="hst-old"><DataBackupRestore section="export" exportExtras={EXPORT_FORMAT_EXTRAS} /></div>
      </Sheet>
      <Sheet open={backup === "import"} onClose={() => setBackup(null)} title="Import a backup" size={phone ? "full" : "half"} side={phone ? "bottom" : "right"} holdsTyping>
        <div className="hst-old">
          <ImportDataSection settings={settings}
            onChanged={() => { qc.invalidateQueries({ queryKey: ["systemSettings"] }); qc.invalidateQueries({ queryKey: ["alters"] }); }} />
        </div>
      </Sheet>
      <BugReportModal open={bug} onClose={() => setBug(false)} />
      <FeedbackSurveyModal open={survey} onClose={() => setSurvey(false)} />
      {rescue ? <DataRescuePanel onClose={() => setRescue(false)} /> : null}
    </>
  );

  if (phone) {
    return (
      <HouseScope tokens={tokens} className="hst hst--phone" data-house-size="phone" data-settings-room="">
        {openPage ? <PhonePage ctx={ctx} onBack={goBack} /> : <PhoneList ctx={ctx} />}
        {sheets}
      </HouseScope>
    );
  }

  const preview = size === "full" && openPage && isLookPage(openPage.id);
  return (
    <HouseScope tokens={tokens} className={`hst hst--studio${preview ? " hst--preview" : ""}`} data-house-size={size} data-settings-room="">
      <SideList ctx={ctx} />
      <Panel as="section" headingLevel={1} className="hst-main" bodyClassName="hst-main-body"
        title={openPage ? pageHeading(found.group, openPage) : "Settings"}
        tools={<span className="hst-aside">{openPage ? pageAside(openPage) : version}</span>}>
        <div data-tour="settings-content" className="hst-main-in">
          {openPage
            ? <div key={openPage.id} className="hst-old hst-page">{openPage.render()}</div>
            : <Overview ctx={ctx} />}
        </div>
      </Panel>
      {preview ? <LookPreview /> : null}
      {sheets}
    </HouseScope>
  );
}

// ── Find ───────────────────────────────────────────────────────────────
function FindField({ ctx }) {
  return (
    <div className="hst-find" role="search" data-tour="settings-quick-nav">
      <TextField label="Find a setting" value={ctx.query} onChange={ctx.setQuery} placeholder="Fonts, backup, reminders…"
        type="search" />
      <p className="hst-sr" aria-live="polite">{findWords(ctx.query, ctx.shownCount, ctx.total)}</p>
    </div>
  );
}

// ── The studio's left panel (board 07: Settings · find) ─────────────────
function SideList({ ctx }) {
  const groups = ctx.query ? ctx.shown : ctx.groups;
  const focusFind = () => document.querySelector(".hst-side .hst-find input")?.focus();
  return (
    <Panel as="aside" className="hst-side" bodyClassName="hst-side-body" title="Settings"
      tools={<Button rank="quiet" onClick={focusFind}>Find</Button>}>
      <div data-tour="settings-side-panel" className="hst-side-in">
        <FindField ctx={ctx} />
        <nav aria-label="Settings sections" className="hst-tree">
          <Row title="Overview" href="/settings" selected={!ctx.openPage} className="hst-row" />
          {groups.length === 0 ? <p className="hst-empty">{`Nothing matches "${ctx.query}".`}</p> : null}
          {groups.map((g) => (
            <div key={g.id} id={`hst-group-${g.id}`} className="hst-group" data-tour={g.tour}>
              <h2 className="hst-ghead">{g.label}</h2>
              {g.pages.map((p) => (
                <div key={p.id} data-tour={p.tour} className="hst-rowwrap">
                  <Row title={p.label} className="hst-row" selected={ctx.openPage?.id === p.id}
                    {...(rowOpensPage(p) ? { href: hrefFor(p) } : { onClick: () => ctx.openRow(p) })} />
                </div>
              ))}
            </div>
          ))}
        </nav>
        <p className="hst-foot">{ctx.version}</p>
      </div>
    </Panel>
  );
}

// ── The overview (no page open) ──────────────────────────────────────────
function Overview({ ctx }) {
  const { terms } = ctx;
  const whatsNew = findPage(ctx.groups, "whats-new");
  return (
    <div className="hst-over">
      <p className="hst-lead">{`Customize your ${terms.system} and keep your data safe. Every page is in the list${ctx.phone ? " below" : " on the left"}.`}</p>
      <section className="hst-block" aria-labelledby="hst-data-h" data-tour="settings-backup-actions">
        <h2 id="hst-data-h" className="hst-bhead">Your data</h2>
        <div className="hst-actions">
          <Button icon={Download} onClick={() => ctx.setBackup("export")}>Export a backup</Button>
          <Button icon={Upload} onClick={() => ctx.setBackup("import")}>Import a backup…</Button>
          <Button icon={Database} busy={ctx.backingUp} busyLabel="Backing up…" onClick={ctx.backUpNow}>Back up now</Button>
        </div>
      </section>
      <section className="hst-block" aria-labelledby="hst-ver-h">
        <h2 id="hst-ver-h" className="hst-bhead">This app</h2>
        <p className="hst-version"><span className="hst-chip">{ctx.version}</span></p>
        <div className="hst-old"><DesktopUpdateButton /></div>
        <div className="hst-actions">
          {LINKS.map((l) => <Button key={l.id} rank="quiet" icon={l.icon} onClick={() => openExternalUrl(l.url)}>{l.label}</Button>)}
        </div>
      </section>
      {!ctx.phone && whatsNew ? (
        <section className="hst-block" aria-labelledby="hst-new-h">
          <h2 id="hst-new-h" className="hst-bhead">What&apos;s new</h2>
          <div className="hst-old">{whatsNew.page.render()}</div>
        </section>
      ) : null}
    </div>
  );
}

// ── Phone: the list ────────────────────────────────────────────────────
function PhoneList({ ctx }) {
  return (
    <div className="hst-plist">
      <FindField ctx={ctx} />
      {!ctx.query ? <Panel title="Settings" tools={<span className="hst-aside">{ctx.version}</span>}><Overview ctx={ctx} /></Panel> : null}
      {ctx.shown.length === 0 ? <p className="hst-empty">{`Nothing matches "${ctx.query}".`}</p> : null}
      <div data-tour="settings-content" className="hst-pgroups">
        {ctx.shown.map((g) => (
          <div key={g.id} id={`hst-group-${g.id}`} data-tour={g.tour} className="hst-pgroup">
            <Panel title={g.label} bodyClassName="hst-pgroup-body">
              {g.pages.map((p) => (
                <div key={p.id} data-tour={p.tour} className="hst-rowwrap">
                  <Row title={p.label} subtitle={p.hint} className="hst-row hst-row--phone" onClick={() => ctx.openRow(p)}
                    meta={<span aria-hidden="true">›</span>} />
                </div>
              ))}
            </Panel>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Phone: a page (drill-in) ─────────────────────────────────────────────
function PhonePage({ ctx, onBack }) {
  const { openPage: page, found } = ctx;
  return (
    <div className="hst-ppage">
      <div className="hst-ptitle">
        <IconButton icon={PixelBack} rank="secondary" label="Back to Settings" onClick={onBack} />
        <div className="hst-ptitle-words">
          <span className="hst-pgroupname">{found.group.label}</span>
          <h1 className="hst-pname">{page.label}</h1>
        </div>
      </div>
      {page.hint && !isLookPage(page.id) ? <p className="hst-phint">{page.hint}</p> : null}
      <div data-tour="settings-content" className="hst-pbody">
        <div key={page.id} className="hst-old hst-page">{page.render()}</div>
      </div>
    </div>
  );
}

// ── Display options in the house's inspector shell (boards 07 and 10) ────
function DisplayOptionsPage({ onOpenSheet }) {
  return (
    <div className="hst-insp" data-tour="settings-display-inspector">
      <Suspense fallback={<LoadingBlock label="Loading Display options" />}>
        <UiEditSheet renderTabs={({ tabs, value, onChange }) => (
          <div className="hst-insp-tabs">
            <PageTabs label="Display options" idPrefix="inspector" value={value} onChange={onChange}
              tabs={tabs.map((t) => ({ id: t.id, label: t.label, dot: t.dot }))} />
          </div>
        )} />
      </Suspense>
      <div className="hst-insp-foot">
        <Button onClick={onOpenSheet}>Open as a sheet</Button>
      </div>
    </div>
  );
}

// ── Preview · live (board 07's right column) ────────────────────────────
// A sample of the look drawn with the house's own parts, so every change in
// the page beside it shows here at once. It only shows; nothing in it can
// be pressed.
function LookPreview() {
  const terms = useTerms();
  const formatAlter = useAlterLabel();
  const { data: activeFront = [] } = useQuery({ queryKey: ["activeFront"], queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }) });
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
    <Panel as="aside" className="hst-preview" title="Preview" tools={<span className="hst-aside">live</span>}>
      <div className="hst-pv" aria-hidden="true" data-tour="settings-preview">
        <div className="hst-pv-card">
          <div className="hst-pv-ttl"><span>{`Who's ${terms.fronting}`}</span><span>...</span></div>
          <div className="hst-pv-front">
            {fronters.length === 0 ? <span className="hst-muted">No one set</span> : null}
            {fronters.map((a) => (
              <span key={a.id} className="hst-pv-who">
                <span className="hst-pv-sw" style={{ background: a.color || "var(--house-muted)" }} />
                <b>{formatAlter(a)}</b>
              </span>
            ))}
            {since ? <span className="hst-muted">{`since ${since}`}</span> : null}
          </div>
        </div>
        <div className="hst-pv-btns">
          <span className="hst-pv-btn hst-pv-btn--on">Check in</span>
          <span className="hst-pv-btn">Write</span>
        </div>
        <div className="hst-pv-sunk">{`Text looks like this at ${textPct}%.`}</div>
        <div className="hst-pv-icons">
          {[PixelHeart, PixelSwitch, PixelPen, PixelCalendar, PixelGear].map((G, i) => (
            <span key={i} className="hst-pv-btn hst-pv-icon"><G className="hst-pv-glyph" /></span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
