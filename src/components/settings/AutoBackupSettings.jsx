import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Bell, Zap } from "lucide-react";
import { toast } from "sonner";
import { format as format_ } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { useBackupHealth } from "@/components/dashboard/BackupHealthNotice";
import {
  AUTO_BACKUP_INTERVALS,
  getAutoBackupInterval,
  setAutoBackupInterval,
  getAutoBackupLastAt,
  getAutoBackupMode,
  setAutoBackupMode,
  BACKUP_MODES,
  getBackupDestination,
  setBackupDestination,
  BACKUP_DESTINATIONS,
  BACKUP_FORMATS,
  getAutoBackupFormat,
  setAutoBackupFormat,
  runAutoBackupNow,
  describeBackupFolder,
} from "@/lib/autoBackup";
import { reconcileNativeBackupReminder } from "@/lib/nativeBackupScheduler";
import { isNative } from "@/lib/platform";
import PersistentStorageStatus from "./PersistentStorageStatus";
import BackupFileOptions from "./BackupFileOptions";
import BackupCopyOptions from "./BackupCopyOptions";
import { clockPattern } from "@/lib/timeFormat";

const NATIVE = isNative();

// Health verdict + the last few attempts, so a failing auto-backup is
// visible HERE too (not only as a home-screen card someone may snooze).
function BackupHealthLine() {
  const h = useBackupHealth();
  const [open, setOpen] = useState(false);
  const label = {
    ok: h.partial ? `Backups are on time, but the last one was partial — ${h.partialDetail}. Use Export in Data & privacy for a complete file.` : "Backups look healthy.",
    none: "No backup has ever completed.",
    stale: `Last successful backup was ${Math.floor(h.daysSince)} days ago — that's stale.`,
    failing: `The last ${h.consecutiveFails} attempts failed${h.lastFailDetail ? ` — ${h.lastFailDetail}` : ""}.`,
    off: "Automatic backups are off.",
  }[h.level] || "";
  const tone = h.level === "ok" && !h.partial ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className="text-[0.6875rem] mt-1">
      <button type="button" onClick={() => setOpen((v) => !v)} className={`${tone} underline-offset-2 hover:underline text-left`}>
        {label}{h.events?.length ? (open ? " ▴" : " ▾") : ""}
      </button>
      {open && h.events?.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {h.events.slice(0, 5).map((e, i) => (
            <li key={i}>
              {(() => { try { return format_(new Date(e.at), clockPattern("MMM d, h:mm a")); } catch { return e.at; } })()} · {e.kind} · {e.ok ? "ok" : "failed"}{e.detail ? ` · ${e.detail}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The panel reads top to bottom like a manual export, just on a timer:
// When → What (the Export formats) → Where (this device / ask, plus an
// off-device copy) → Lock & name → Back up now.
export default function AutoBackupSettings() {
  const terms = useTerms();
  const [interval, setIntervalState] = useState(0);
  const [mode, setModeState] = useState(BACKUP_MODES.OFF);
  const [format, setFormatState] = useState(BACKUP_FORMATS.JSON);
  const [destination, setDestinationState] = useState(BACKUP_DESTINATIONS.ASK);
  const [lastAt, setLastAt] = useState(null);
  const [running, setRunning] = useState(false);
  // Bumped by BackupFileOptions so the destination copy re-reads the folder.
  const [, setOptionsNonce] = useState(0);

  // Initial read of state from localStorage + browser.
  useEffect(() => {
    setIntervalState(getAutoBackupInterval());
    setModeState(getAutoBackupMode());
    setFormatState(getAutoBackupFormat());
    setDestinationState(getBackupDestination());
    setLastAt(getAutoBackupLastAt());
  }, []);

  const off = mode === BACKUP_MODES.OFF;

  const applyMode = (next) => {
    setModeState(next);
    setAutoBackupMode(next);
    if (NATIVE) reconcileNativeBackupReminder().catch(() => {});
  };

  // One row of chips: Off, or how often. Picking a frequency while off
  // turns automatic backups on.
  const pickWhen = (days) => {
    if (days === 0) { applyMode(BACKUP_MODES.OFF); return; }
    setIntervalState(days);
    setAutoBackupInterval(days);
    applyMode(off ? BACKUP_MODES.AUTO : mode);
  };

  const pickHow = (next) => {
    // Web can't deliver REMINDER mode (no scheduled OS notifications).
    if (next === BACKUP_MODES.REMINDER && !NATIVE) return;
    if (interval === 0) { setIntervalState(7); setAutoBackupInterval(7); }
    applyMode(next);
  };

  const pickFormat = (next) => {
    setFormatState(next);
    setAutoBackupFormat(next);
  };

  const handleDestinationChange = (next) => {
    if (![BACKUP_DESTINATIONS.DOCUMENTS, BACKUP_DESTINATIONS.ASK].includes(next)) return;
    setDestinationState(next);
    setBackupDestination(next);
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      await runAutoBackupNow();
      setLastAt(getAutoBackupLastAt());
    } catch (e) {
      toast.error(e?.message || "Backup failed");
    } finally {
      setRunning(false);
    }
  };

  const lastLabel = lastAt
    ? (() => { try { return format_(new Date(lastAt), clockPattern("MMM d, yyyy 'at' h:mm a")); } catch { return lastAt; } })()
    : "never";

  const formatHelp = {
    [BACKUP_FORMATS.JSON]: "One file you can open and read. If your pictures and files are too big for one file, it saves your data only.",
    [BACKUP_FORMATS.COMPACT]: "The same as .json, packed smaller. If your pictures and files are too big for one file, it saves your data only.",
    [BACKUP_FORMATS.ZIP]: "Your data plus every picture, song, video and file, all in one .zip. Takes longer, but nothing is left out. A copy kept off the device holds your data only.",
  }[format];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Download className="w-4 h-4 text-primary" /> Auto-backup
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Saves the same backup as Export, on a schedule, with every {terms.system} on this device in it.
        </p>
      </div>

      {/* WHEN */}
      <Row label="When">
        <Chips
          options={AUTO_BACKUP_INTERVALS.map((o) => ({ value: o.value, label: o.label }))}
          value={off ? 0 : interval}
          onPick={pickWhen}
        />
        {!off && (NATIVE ? (
          <Chips
            options={[
              { value: BACKUP_MODES.AUTO, label: "Back up by itself", icon: Zap },
              { value: BACKUP_MODES.REMINDER, label: "Remind me", icon: Bell },
            ]}
            value={mode}
            onPick={pickHow}
          />
        ) : null)}
        <p className="text-[0.6875rem] text-muted-foreground">
          {off
            ? "No scheduled backups. Back up now still works any time."
            : mode === BACKUP_MODES.REMINDER
              ? "A notification reminds you when a backup is due. Tap it and the backup runs."
              : NATIVE
                ? "Runs when you open the app and a backup is due."
                : "Runs when you open the app and a backup is due. Browsers can't run on a clock, so open the app at least that often."}
        </p>
      </Row>

      {/* WHAT */}
      <Row label="What">
        <Chips
          options={[
            { value: BACKUP_FORMATS.JSON, label: "Plain .json" },
            { value: BACKUP_FORMATS.COMPACT, label: "Compact (.txt)" },
            { value: BACKUP_FORMATS.ZIP, label: "Everything (.zip)" },
          ]}
          value={format}
          onPick={pickFormat}
        />
        <p className="text-[0.6875rem] text-muted-foreground">{formatHelp}</p>
      </Row>

      {/* WHERE */}
      <Row label="Where">
        {NATIVE ? (
          <>
            <Chips
              options={[
                { value: BACKUP_DESTINATIONS.DOCUMENTS, label: "This phone" },
                { value: BACKUP_DESTINATIONS.ASK, label: "Ask each time" },
              ]}
              value={destination}
              onPick={handleDestinationChange}
            />
            <p className="text-[0.6875rem] text-muted-foreground">
              {destination === BACKUP_DESTINATIONS.DOCUMENTS
                ? `Saved to ${describeBackupFolder()}, where it survives clearing the app or reinstalling it.`
                : "The share sheet opens so you choose where each backup goes."}
            </p>
          </>
        ) : (
          <p className="text-[0.6875rem] text-muted-foreground">
            A save prompt opens so you choose where each backup goes.
          </p>
        )}
        <div className="pt-1">
          <BackupCopyOptions onChange={() => setOptionsNonce((n) => n + 1)} />
        </div>
      </Row>

      {/* LOCK + NAME — apply to automatic backups and Back up now. */}
      <div className="border-t border-border/30 pt-3">
        <BackupFileOptions showCopy={false} onChange={() => setOptionsNonce((n) => n + 1)} />
      </div>

      {/* NOW */}
      <div className="border-t border-border/30 pt-3 space-y-1">
        <Button onClick={handleRunNow} disabled={running} variant="outline" size="sm" className="gap-1.5">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          {running ? "Backing up…" : "Back up now"}
        </Button>
        <p className="text-[0.6875rem] text-muted-foreground">
          Last backup: <span className="text-foreground">{lastLabel}</span>
        </p>
        <BackupHealthLine />
      </div>

      <div className="border-t border-border/30 pt-3">
        <PersistentStorageStatus />
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground block">{label}</label>
      {children}
    </div>
  );
}

function Chips({ options, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onPick(v)}
          aria-pressed={value === v}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1 ${
            value === v
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border/40 text-muted-foreground hover:bg-muted/40"
          }`}
        >
          {Icon && <Icon className="w-3 h-3" />}{label}
        </button>
      ))}
    </div>
  );
}

export function ModeCard({ active, onClick, icon: Icon, title, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-2.5 flex items-start gap-2 transition-colors ${
        active
          ? "border-primary/60 bg-primary/5"
          : "border-border/40 hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      {Icon ? (
        <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
      ) : (
        <span className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 inline-block rounded-full border ${active ? "border-primary bg-primary" : "border-muted-foreground/50"}`} />
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>{title}</p>
        <p className="text-[0.6875rem] text-muted-foreground mt-0.5 leading-relaxed">{body}</p>
      </div>
    </button>
  );
}
