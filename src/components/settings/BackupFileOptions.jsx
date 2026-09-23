// Backup-file privacy controls — the ONE place these two knobs are edited,
// mounted inside Settings → Auto-backup and inside the first-run backup
// decision step so the two can't drift.
//
//   1. Lock backup files with a password. A backup in Downloads is a plain
//      JSON file even when storage encryption is on (the export path reads
//      the unlocked in-memory data). Locking seals the whole file. Users
//      with storage encryption reuse that password (nothing extra stored);
//      everyone else can set a separate one.
//   2. File name. The default names the app; a plain name doesn't. Restore
//      goes by file content, so any name imports.
//
// Both default to off/standard — nothing about existing files changes until
// the user opts in. The custom password lives in localStorage and is NOT
// mirrored or exported (see autoBackup.js).

import React, { useEffect, useState } from "react";
import { Lock, FileText, Eye, EyeOff, Check, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isEncryptionEnabled } from "@/lib/storageMode";
import { isNative } from "@/lib/platform";
import {
  BACKUP_ENCRYPTION,
  getBackupEncryptionMode,
  setBackupEncryptionMode,
  hasBackupCustomPassword,
  setBackupCustomPassword,
  getBackupName,
  setBackupName,
  sanitizeBackupName,
  DEFAULT_BACKUP_NAME,
  DISCREET_BACKUP_NAME,
} from "@/lib/autoBackup";

const NATIVE = isNative();

function OptionCard({ active, onClick, icon: Icon, title, body, children }) {
  return (
    <div
      className={`rounded-lg border transition-colors ${
        active ? "border-primary/60 bg-primary/5" : "border-border/40 hover:border-primary/30 hover:bg-muted/30"
      }`}
    >
      <button type="button" onClick={onClick} className="w-full text-left p-2.5 flex items-start gap-2">
        {Icon ? (
          <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
        ) : (
          <span className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 inline-block rounded-full border ${active ? "border-primary bg-primary" : "border-muted-foreground/50"}`} />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium ${active ? "text-primary" : "text-foreground"}`}>{title}</p>
          {body && <p className="text-[0.6875rem] text-muted-foreground mt-0.5 leading-relaxed">{body}</p>}
        </div>
      </button>
      {active && children && <div className="px-2.5 pb-2.5 pl-8">{children}</div>}
    </div>
  );
}

// `onChange` fires after any persisted change so a parent can refresh
// derived labels (e.g. the destination folder in Settings).
export default function BackupFileOptions({ onChange }) {
  const encryptedStorage = isEncryptionEnabled();
  const [encMode, setEncModeState] = useState(BACKUP_ENCRYPTION.OFF);
  const [hasCustomPw, setHasCustomPw] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [name, setNameState] = useState(DEFAULT_BACKUP_NAME);

  useEffect(() => {
    setEncModeState(getBackupEncryptionMode());
    setHasCustomPw(hasBackupCustomPassword());
    setNameState(getBackupName());
  }, []);

  const notify = () => { try { onChange?.(); } catch { /* parent-side */ } };

  const pickEnc = (mode) => {
    setEncModeState(mode);
    setBackupEncryptionMode(mode);
    if (mode !== BACKUP_ENCRYPTION.CUSTOM) { setHasCustomPw(false); setPw(""); setPw2(""); setPwError(""); }
    notify();
  };

  const savePw = () => {
    if (pw.length < 6) { setPwError("Use at least 6 characters."); return; }
    if (pw !== pw2) { setPwError("Passwords don't match."); return; }
    setBackupCustomPassword(pw);
    setHasCustomPw(true);
    setPw(""); setPw2(""); setPwError("");
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2500);
    notify();
  };

  const applyName = (raw) => {
    const clean = sanitizeBackupName(raw);
    setNameState(clean);
    setBackupName(clean);
    notify();
  };

  const today = new Date().toISOString().slice(0, 10);
  const discreet = name !== DEFAULT_BACKUP_NAME;
  // Storage encryption was turned off after "use my storage password" was
  // picked (or the setting arrived via a restored backup): the choice can't
  // be honoured, and backups fail loudly until a different option is picked.
  const storageModeOrphaned = encMode === BACKUP_ENCRYPTION.STORAGE && !encryptedStorage;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Lock backup files
        </label>
        {encryptedStorage && encMode === BACKUP_ENCRYPTION.OFF && (
          <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 leading-relaxed">
            Your app data is password-locked, but backup files are not — anyone who opens the file can read it.
          </p>
        )}
        {storageModeOrphaned && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-[0.6875rem] text-foreground leading-relaxed">
              Set to use your storage password, but storage encryption is off on this device. Backups won't run until you pick an option below.
            </p>
          </div>
        )}
        <div className="grid gap-1.5">
          <OptionCard
            active={encMode === BACKUP_ENCRYPTION.OFF}
            onClick={() => pickEnc(BACKUP_ENCRYPTION.OFF)}
            title="Don't lock"
            body="Plain file. Anyone who finds it can open it."
          />
          {encryptedStorage ? (
            <OptionCard
              active={encMode === BACKUP_ENCRYPTION.STORAGE}
              onClick={() => pickEnc(BACKUP_ENCRYPTION.STORAGE)}
              icon={Lock}
              title="Lock with my storage password"
              body="The password you unlock the app with. Nothing extra is stored."
            />
          ) : (
            <OptionCard
              active={encMode === BACKUP_ENCRYPTION.CUSTOM}
              onClick={() => pickEnc(BACKUP_ENCRYPTION.CUSTOM)}
              icon={Lock}
              title="Lock with a backup password"
              body="A separate password, asked for when the file is restored."
            >
              <div className="space-y-1.5">
                {hasCustomPw && !pwSaved && (
                  <p className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Password set. Enter a new one below to change it.
                  </p>
                )}
                {pwSaved && (
                  <p className="text-[0.6875rem] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved.
                  </p>
                )}
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={pw}
                    onChange={(e) => { setPw(e.target.value); setPwError(""); }}
                    placeholder={hasCustomPw ? "New backup password" : "Backup password"}
                    className="h-8 text-xs pr-9"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <Input
                  type={showPw ? "text" : "password"}
                  value={pw2}
                  onChange={(e) => { setPw2(e.target.value); setPwError(""); }}
                  onKeyDown={(e) => { if (e.key === "Enter") savePw(); }}
                  placeholder="Confirm"
                  className="h-8 text-xs"
                  autoComplete="new-password"
                />
                {pwError && <p className="text-[0.6875rem] text-destructive">{pwError}</p>}
                <Button type="button" size="sm" variant="outline" onClick={savePw} disabled={!pw || !pw2} className="h-7 text-xs">
                  {hasCustomPw ? "Change password" : "Set password"}
                </Button>
                <p className="text-[0.6875rem] text-amber-600 dark:text-amber-400 leading-relaxed">
                  If you forget this password the backup can't be opened — write it down somewhere safe.
                </p>
              </div>
            </OptionCard>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> File name
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => applyName(DEFAULT_BACKUP_NAME)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!discreet ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
            Standard
          </button>
          <button type="button" onClick={() => applyName(DISCREET_BACKUP_NAME)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${name === DISCREET_BACKUP_NAME ? "border-primary/60 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:bg-muted/40"}`}>
            Plain
          </button>
        </div>
        <Input
          value={name}
          onChange={(e) => setNameState(e.target.value)}
          onBlur={(e) => applyName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") applyName(e.currentTarget.value); }}
          aria-label="Backup file name"
          className="h-8 text-xs"
          maxLength={40}
        />
        <p className="text-[0.6875rem] text-muted-foreground">
          Files will be named <span className="text-foreground">{sanitizeBackupName(name)}-{today}.json</span>
          {NATIVE && (discreet
            ? " and saved to Downloads → Backups instead of a folder named after the app."
            : " in Downloads → Oceans Symphony.")}
        </p>
      </div>
    </div>
  );
}
