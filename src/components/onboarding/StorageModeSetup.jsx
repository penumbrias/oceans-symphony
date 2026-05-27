import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { Label } from "@/components/ui/label";
import { Cloud, HardDrive, Lock, Eye, EyeOff, ShieldCheck, Loader2, ChevronDown, Upload } from "lucide-react";
import { setMode, setEncryptionEnabled } from "@/lib/storageMode";
import { initLocalDb, loadDbDump, peekStoredData } from "@/lib/localDb";
import TwaToNativeMigrationModal, { shouldShowTwaToNativeMigration } from "@/components/onboarding/TwaToNativeMigrationModal";
import {
  parseImportText,
  decryptRawEncrypted,
  FORMAT_STANDARD,
  FORMAT_RAW_PLAIN,
  FORMAT_RAW_ENCRYPTED,
} from "@/lib/backupFormat";

function FirstRunSetup({ onComplete }) {
  const [step, setStep] = useState("choose");
  const [useEncryption, setUseEncryption] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [pendingEncryptedImport, setPendingEncryptedImport] = useState(null);
  const [importPassword, setImportPassword] = useState("");
  const [importStatus, setImportStatus] = useState(null); // {type, text}
  const fileInputRef = useRef(null);

  // TWA-to-native migration modal: native users who just got auto-
  // updated from the old TWA build see this as the first screen on
  // their fresh-looking install. Their data lives in Chrome's
  // storage at oceans-symphony.app and isn't reachable from the
  // native sandbox — modal walks them through grabbing a backup
  // there and importing it here. "Import backup file" delegates to
  // the same fileInputRef the "Import a backup file" button below
  // uses, so they land in the same well-tested code path. Dismiss
  // sets a localStorage flag so it only fires once per install.
  const [showMigration, setShowMigration] = useState(() => shouldShowTwaToNativeMigration());

  const handleChooseCloud = () => { setMode("cloud"); onComplete(); };
  const handleChooseLocal = () => { setStep("local_password"); };

  // Brand-new install path: let the user pull in data from a backup file
  // BEFORE they decide whether to set up encryption fresh. Reuses the
  // existing import logic from src/lib/backupFormat.js so all three file
  // shapes (standard backup, raw plain, raw encrypted) work — same as
  // the Settings → Import flow.
  //
  // After a successful import we treat the user as a returning user and
  // complete setup without offering encryption (their old data may
  // already be encrypted and re-deriving keys here would be confusing).
  // They can flip encryption on or off later from Settings.
  const applyDumpAndComplete = async ({ data, localImages, localSettings }) => {
    if (localImages) {
      try {
        const { restoreLocalImages } = await import("@/lib/localImageStorage");
        await restoreLocalImages(localImages);
      } catch (e) {
        console.warn("[Setup import] failed to restore local images:", e);
      }
    }
    if (localSettings) {
      for (const [k, v] of Object.entries(localSettings)) {
        try { localStorage.setItem(k, v); } catch { /* localStorage full / disabled */ }
      }
    }
    setMode("local");
    setEncryptionEnabled(false);
    await initLocalDb(null);
    await loadDbDump(data);
    onComplete();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    setImportStatus(null);
    setError("");
    try {
      // Refuse to import on top of existing data — same defence as
      // handleLocalConfirm below.
      const peek = await peekStoredData();
      if (peek.exists) {
        setError("Existing data was found on this device. Reload — you should be prompted to unlock or recover before importing.");
        return;
      }
      const text = await file.text();
      const parsed = parseImportText(text);
      if (parsed.format === FORMAT_STANDARD) {
        await applyDumpAndComplete({
          data: parsed.data,
          localImages: parsed.localImages,
          localSettings: parsed.localSettings,
        });
      } else if (parsed.format === FORMAT_RAW_PLAIN) {
        await applyDumpAndComplete({ data: parsed.data });
      } else if (parsed.format === FORMAT_RAW_ENCRYPTED) {
        setPendingEncryptedImport(parsed);
      }
    } catch (e) {
      setImportStatus({ type: "error", text: `Import failed: ${e.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleDecryptAndImport = async () => {
    if (!pendingEncryptedImport || !importPassword) return;
    setImporting(true);
    setImportStatus(null);
    try {
      const data = await decryptRawEncrypted(pendingEncryptedImport, importPassword);
      setPendingEncryptedImport(null);
      setImportPassword("");
      await applyDumpAndComplete({ data });
    } catch (e) {
      setImportStatus({ type: "error", text: `Decrypt failed: ${e.message}` });
    } finally {
      setImporting(false);
    }
  };

  const handleLocalConfirm = async () => {
    if (useEncryption && password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (useEncryption && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      // Last-ditch safety: if existing data is on disk, refuse to set up
      // a fresh DB on top of it. App.jsx already routes returning users
      // to unlock/recovery before reaching this screen, but a stale tab
      // or a race could land here — treat that as an emergency rather
      // than silently overwriting the user's data.
      const peek = await peekStoredData();
      if (peek.exists) {
        setError(
          "Existing data was found on this device. To protect it from being overwritten, the app cannot run setup again. Please reload — you should be prompted to unlock or recover your data."
        );
        setLoading(false);
        return;
      }
      setMode("local");
      if (useEncryption) {
        setEncryptionEnabled(true);
        await initLocalDb(password);
      } else {
        setEncryptionEnabled(false);
        await initLocalDb(null);
      }
      onComplete();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-start local setup for APK (skip mode selection)
  if (step === "choose") {
    handleChooseLocal();
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Native-only TWA-to-native migration prompt. Rendered as the
          first UI on the onboarding screen so users coming from a
          Play Store auto-update see it BEFORE the storage-mode picker.
          onImport delegates to the existing fileInputRef so the
          import flow reuses the well-tested first-run importer
          below. */}
      <TwaToNativeMigrationModal
        open={showMigration}
        onClose={() => setShowMigration(false)}
        onImport={() => {
          setShowMigration(false);
          // Defer one tick so the modal unmounts before we open the
          // native file picker — otherwise some Android WebView
          // versions race the activity-stack transitions and
          // suppress the picker dialog.
          setTimeout(() => fileInputRef.current?.click(), 50);
        }}
      />
      <div className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
        <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">Optional:</span> Protect your data with a password. You'll need to enter it each time you open the app.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setUseEncryption(!useEncryption)}
          className={`w-10 h-6 rounded-full transition-colors flex items-center ${useEncryption ? 'bg-primary' : 'bg-muted'}`}
        >
          <span className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform mx-0.5 ${useEncryption ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
        <Label className="cursor-pointer" onClick={() => setUseEncryption(!useEncryption)}>
          Enable password encryption
        </Label>
      </div>
      {useEncryption && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="relative">
              <Input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="Enter a strong password..."
                className="pr-10"
              />
              <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Confirm Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError(""); }}
              placeholder="Confirm password..."
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">⚠️ If you forget your password, your data cannot be recovered. There is no reset option.</p>
        </div>
      )}
      <div className="pt-2">
        <Button onClick={handleLocalConfirm} disabled={loading || importing} className="w-full bg-primary hover:bg-primary/90">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HardDrive className="w-4 h-4 mr-2" />}
          {useEncryption ? "Set Up Encrypted Local" : "Use Local Storage"}
        </Button>
      </div>

      <div className="border-t border-border/40 pt-4 mt-2 space-y-2">
        <p className="text-xs text-muted-foreground">
          Moved from another device, or installing the native app after using
          the web version? Import an existing backup instead of starting empty.
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json,.txt"
          onChange={handleImportFile}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={loading || importing}
          className="w-full justify-start"
        >
          {importing
            ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            : <Upload className="w-4 h-4 mr-2" />}
          Import a backup file
        </Button>
        {importStatus && (
          <p className={`text-xs ${importStatus.type === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
            {importStatus.text}
          </p>
        )}
      </div>

      {pendingEncryptedImport && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-5 shadow-2xl space-y-4">
            <h3 className="font-semibold text-lg">Encrypted backup</h3>
            <p className="text-sm text-muted-foreground">
              This backup is encrypted. Enter the password it was created with
              to decrypt and load it. Once imported, the data will be loaded
              as plain — you can flip encryption back on later from Settings.
            </p>
            <Input
              type="password"
              value={importPassword}
              onChange={e => setImportPassword(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && importPassword) handleDecryptAndImport(); }}
              placeholder="Password used to encrypt the backup"
              autoFocus
            />
            {importStatus && importStatus.type === "error" && (
              <p className="text-xs text-destructive">{importStatus.text}</p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setPendingEncryptedImport(null); setImportPassword(""); setImportStatus(null); }}
                disabled={importing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDecryptAndImport}
                disabled={importing || !importPassword}
              >
                {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Decrypt &amp; Import
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnlockScreen({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUnlock = async () => {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      await initLocalDb(password);
      onUnlock();
    } catch {
      setError("Incorrect password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground text-center">
        Your Symphony data is encrypted. Enter your password to unlock.
      </p>
      <div className="relative">
        <Input
          type={showPass ? "text" : "password"}
          value={password}
          onChange={e => { setPassword(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && handleUnlock()}
          placeholder="Your encryption password..."
          className="pr-10"
          autoFocus
        />
        <button onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <Button onClick={handleUnlock} disabled={loading || !password} className="w-full bg-primary hover:bg-primary/90">
        {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
        Unlock
      </Button>
    </div>
  );
}

export default function StorageModeSetup({ mode, onComplete }) {
  const [noticeOpen, setNoticeOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3">
            {mode === "unlock"
              ? <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
              : <img
                  src="/logo.png"
                  className="w-12 h-12 object-contain"
                  alt="Oceans Symphony"
                />
            }
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground text-center">
            {mode === "unlock" ? "Unlock Symphony" : "Welcome to Oceans Symphony"}
          </h2>
          {mode !== "unlock" && (
            <p className="text-sm text-muted-foreground text-center mt-1">
              Choose how Symphony stores your data. You can change this later in Settings.
            </p>
          )}
        </div>

        {/* GitHub link — first run only */}
        {mode !== "unlock" && (
          <p className="text-sm text-center mb-4">
            <strong className="text-foreground">
              Looking for the latest version?{" "}
              <span
                onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
                className="text-primary underline hover:text-primary/80 transition-colors cursor-pointer"
              >
                Check releases on GitHub
              </span>.
            </strong>
          </p>
        )}

        {/* Collapsible privacy notice — first run only */}
        {mode !== "unlock" && (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <button
              onClick={() => setNoticeOpen(p => !p)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-amber-500/10 transition-colors"
            >
              <span className="text-base">🔐</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">Privacy &amp; Data Notice</p>
                <p className="text-xs text-muted-foreground font-medium">!! Please read !!</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${noticeOpen ? "rotate-180" : ""}`} />
            </button>
            {noticeOpen && (
              <div className="px-4 pb-4 space-y-3 text-sm text-muted-foreground border-t border-amber-500/20 pt-3">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">📦 What's stored, and where</p>
                  <p>Everything you log lives in this browser's <strong className="text-foreground">IndexedDB</strong> on this device: {`${'alters, fronting sessions, journals, emotion / symptom check-ins, activities, plans, to-dos, diary cards, reminders, lineage events, locations, status notes, grounding techniques, custom fields, theme / navigation settings, and so on'}`}. A handful of small per-browser preferences also live in <strong className="text-foreground">localStorage</strong> (theme + last-opened list ids, daily-task firing markers, push notification IDs, the friends-server identity, and grocery lists you've explicitly marked "available when locked"). Both stores stay on this device — neither gets uploaded anywhere.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🔒 What encryption protects (and what it doesn't)</p>
                  <p>Turning on password encryption applies <strong className="text-foreground">AES-256-GCM</strong> to the IndexedDB blob, with a key derived from your password via <strong className="text-foreground">PBKDF2 (250k iterations)</strong>. Your password never leaves this device; the encryption salt is embedded inside the encrypted payload so a localStorage wipe alone can't make the data permanently undecryptable. <strong className="text-foreground">localStorage entries are not encrypted</strong> — they're intentionally lightweight settings + the unlocked grocery lists you opted into. <strong className="text-foreground">If you lose your password, the encrypted data cannot be recovered.</strong></p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🚫 What's never stored</p>
                  <p>No analytics, no crash telemetry, no usage tracking, no advertising IDs. There's no Oceans Symphony account and no server-side copy of your data — even crashes stay on your device unless you choose to email a log.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">👥 Friends Mode (opt-in)</p>
                  <p>Friends mode is the only feature that sends anything off-device, and it is <strong className="text-foreground">off until you set it up</strong>. When enabled, only what you explicitly choose to share is transmitted to the friends relay: your system name, your display name, and your current front status — at the granularity you pick (full names, count only, or hidden), with per-friend overrides. <strong className="text-foreground">Journals, emotions, symptoms, plans, locations, and chat are never sent.</strong></p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🌐 Optional third-party imports</p>
                  <p>PluralKit and Simply Plural connectors are also opt-in and one-way: you provide their tokens, the app fetches your data from their servers and stores it locally. No data flows back to them from Symphony.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">💾 Backups</p>
                  <p>Use Settings → Backup &amp; Export to save your data as a JSON file. Backups include the IndexedDB entities; they intentionally exclude device-bound state (friends identity, push registrations, grocery lists flagged "available when locked"). Keep backups safe — local data is tied to this device and will be lost if you clear app data without a backup.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🤖 Transparency</p>
                  <p>Oceans Symphony is <strong className="text-foreground">vibe-coded</strong> — built with AI assistance. It is a work in progress, shared in good faith. We do our best but cannot guarantee it is bug-free.</p>
                </div>
                <p className="text-amber-600 dark:text-amber-400 font-medium pt-1">
                  🌊 Free and open source, shared by a DID system to fill a void in the community.{" "}
                  Contact: pesturedrawing@gmail.com ·{" "}
                  <span
                    onClick={() => openExternalUrl("https://github.com/penumbrias/oceans-symphony/releases")}
                    className="text-primary underline cursor-pointer"
                  >
                    Latest releases on GitHub →
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Main content */}
        {mode === "unlock"
          ? <UnlockScreen onUnlock={onComplete} />
          : <FirstRunSetup onComplete={onComplete} />
        }
      </div>
    </div>
  );
}