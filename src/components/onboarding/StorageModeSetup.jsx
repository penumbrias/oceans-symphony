import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { openExternalUrl } from "@/lib/openExternalUrl";
import { Cloud, Lock, Eye, EyeOff, ShieldCheck, Loader2, ChevronDown, Upload } from "lucide-react";
import { setMode, setEncryptionEnabled } from "@/lib/storageMode";
import { initLocalDb, loadDbDump, peekStoredData } from "@/lib/localDb";
import { isNative } from "@/lib/platform";
import TwaToNativeMigrationModal, { shouldShowTwaToNativeMigration } from "@/components/onboarding/TwaToNativeMigrationModal";
import ImportAltersModal from "@/components/alters/ImportAltersModal";
import DataRescuePanel from "@/components/settings/DataRescuePanel";
import { scanForOrphanedData } from "@/lib/dataRecovery";
import { externalKindFromJson } from "@/components/settings/DataBackupRestore";
import SimplyPluralFileImport from "@/components/settings/SimplyPluralFileImport";
import OpenPluralConnect from "@/components/settings/OpenPluralConnect";
import OctoconConnect from "@/components/settings/OctoconConnect";
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
  // "Import from another app" path: set up an empty local DB first
  // (so the connectors have somewhere to write), then open the same
  // SP / PK / OpenPlural import modal the Alters page uses. Closing
  // the modal completes onboarding and lands the user in the app with
  // their imported data already in place.
  const [showImportModal, setShowImportModal] = useState(false);
  const [showRescue, setShowRescue] = useState(false);
  const [showLocalInfo, setShowLocalInfo] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [externalImport, setExternalImport] = useState(null); // { file, type }
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
  const applyDumpAndComplete = async ({ data, localImages, localFonts, localSettings }) => {
    if (localImages) {
      try {
        const { restoreLocalImages } = await import("@/lib/localImageStorage");
        await restoreLocalImages(localImages);
      } catch (e) {
        console.warn("[Setup import] failed to restore local images:", e);
      }
    }
    if (localFonts) {
      try {
        const { restoreLocalFonts } = await import("@/lib/localFontStorage");
        await restoreLocalFonts(localFonts);
      } catch (e) {
        console.warn("[Setup import] failed to restore local fonts:", e);
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

  const handleImportFile = async (file) => {
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

      // Read the bytes ONCE and detect binary formats by MAGIC (filename/MIME
      // are unreliable via Android content:// pickers) — same as the Settings
      // importer.
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const head = bytes.subarray(0, 10);
      const hasMagic = (sig) => sig.every((b, i) => head[i] === b);
      const lowerName = (file.name || "").toLowerCase();

      // Ampersand .ampar — binary msgpack. Set up an (unencrypted) local DB,
      // load the first system into it, and create any additional systems from
      // the archive. (Encryption can be turned on later in Settings — matches
      // applyDumpAndComplete, which also imports unencrypted.)
      if (lowerName.endsWith(".ampar") || hasMagic([0x41, 0x4d, 0x50, 0x41, 0x52])) {
        const { parseAmpar, ampersandToSystemDumps } = await import("@/lib/ampersand");
        const sysDumps = ampersandToSystemDumps(parseAmpar(buf));
        if (!sysDumps.length) throw new Error("no systems found in the archive");
        setMode("local");
        setEncryptionEnabled(false);
        await initLocalDb(null);
        await loadDbDump(sysDumps[0].data);
        if (sysDumps.length > 1) {
          const { createSystemWithData } = await import("@/lib/systems");
          for (let i = 1; i < sysDumps.length; i++) {
            await createSystemWithData(sysDumps[i].name, sysDumps[i].data);
          }
          window.location.reload();
          return;
        }
        onComplete();
        return;
      }

      // OpenPlural .zip — binary; hand to the connector after storage setup.
      if (lowerName.endsWith(".zip") || hasMagic([0x50, 0x4b, 0x03, 0x04])) {
        setImporting(false);
        if (await setupLocalStorage()) setExternalImport({ file, type: "openplural" });
        return;
      }

      // Text formats. Detect another app's export (Simply Plural / Octocon /
      // PluralSpace .json) BEFORE the Symphony parse.
      const text = new TextDecoder("utf-8").decode(bytes);
      let probe = null;
      try { probe = JSON.parse(text); } catch {}
      const externalKind = externalKindFromJson(probe);
      if (externalKind) {
        setImporting(false);
        if (await setupLocalStorage()) setExternalImport({ file, type: externalKind });
        return;
      }
      const parsed = parseImportText(text);
      if (parsed.format === FORMAT_STANDARD) {
        await applyDumpAndComplete({
          data: parsed.data,
          localImages: parsed.localImages,
          localFonts: parsed.localFonts,
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

  // Native (Capacitor) file pick — reads via the content resolver so Google
  // Drive cloud files stream their real bytes (a WebView <input> gets a 0-byte
  // placeholder). Mirrors DataBackupRestore.handleNativeImportPick.
  const handleNativeImportPick = async () => {
    try {
      const { FilePicker } = await import("@capawesome/capacitor-file-picker");
      const res = await FilePicker.pickFiles({ readData: true });
      const picked = res?.files?.[0];
      if (!picked) return;
      const b64ToBytes = (b64) => {
        const bin = atob(b64);
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
      };
      let bytes = null;
      if (picked.data) {
        bytes = b64ToBytes(picked.data);
      } else if (picked.path) {
        const { Filesystem } = await import("@capacitor/filesystem");
        const r = await Filesystem.readFile({ path: picked.path });
        bytes = typeof r.data === "string" ? b64ToBytes(r.data) : new Uint8Array(await r.data.arrayBuffer());
      }
      if (!bytes) throw new Error("couldn't read the file's contents");
      await handleImportFile(new File([bytes], picked.name || "import", { type: picked.mimeType || "application/octet-stream" }));
    } catch (err) {
      const msg = err?.message || String(err);
      if (/cancel/i.test(msg)) return;
      setImportStatus({ type: "error", text: `Import failed: ${msg}` });
    }
  };

  // Open the right file picker for the platform (native content picker on
  // device so Drive cloud files hydrate; the hidden <input> on web).
  const openImportPicker = () => {
    if (isNative()) { handleNativeImportPick(); } else { fileInputRef.current?.click(); }
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

  // Shared setup for both "Start fresh" and "Import from another app":
  // validate the (optional) password, refuse to overwrite existing data,
  // then create the local DB honouring the encryption toggle. Returns
  // true on success so callers can decide what to do next (complete vs
  // open the import modal). Manages the `loading` flag and `error`.
  const setupLocalStorage = async () => {
    if (useEncryption && password !== confirmPassword) { setError("Passwords do not match."); return false; }
    if (useEncryption && password.length < 6) { setError("Password must be at least 6 characters."); return false; }
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
        return false;
      }
      // peek only inspects the ACTIVE key. If that slot is empty (storage
      // eviction, or a drifted registry pointer) but a real data blob still
      // exists under another key OR in localStorage, reseeding here would
      // strand it. App.jsx's boot path already routes such users to recovery,
      // but a stale tab or a race could land here — so re-check the WHOLE
      // storage scope and refuse rather than overwrite a recoverable copy.
      let orphans = [];
      try { orphans = await scanForOrphanedData(); } catch { orphans = []; }
      if (orphans.length > 0) {
        setError(
          "Other data was found on this device. To protect it from being overwritten, setup can't continue. Please reload — you should be offered to recover it."
        );
        return false;
      }
      setMode("local");
      if (useEncryption) {
        setEncryptionEnabled(true);
        await initLocalDb(password);
      } else {
        setEncryptionEnabled(false);
        await initLocalDb(null);
      }
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleLocalConfirm = async () => {
    if (await setupLocalStorage()) onComplete();
  };

  // Set up local storage (empty), then open the SP / PK / OpenPlural
  // import modal so the user can pull their data in straight from
  // onboarding. onComplete fires when they close the modal.
  const handleStartAndImport = async () => {
    if (await setupLocalStorage()) setShowImportModal(true);
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
          // file picker — otherwise some Android WebView versions race
          // the activity-stack transitions and suppress the dialog.
          setTimeout(() => openImportPicker(), 50);
        }}
      />
      <div className="rounded-xl bg-primary/5 border border-primary/20">
        <button
          type="button"
          onClick={() => setShowLocalInfo((v) => !v)}
          aria-expanded={showLocalInfo}
          className="w-full flex items-center gap-3 p-3 text-left"
        >
          <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold text-foreground flex-1">No account or sign-in needed</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${showLocalInfo ? "rotate-180" : ""}`} />
        </button>
        {showLocalInfo && (
          <p className="text-sm text-muted-foreground leading-relaxed px-3 pb-3 pl-11">
            Data is saved locally on your device. Optional at-rest password encryption available in settings. Export a backup in the settings menu to transfer data between devices.
          </p>
        )}
      </div>
      <div className="pt-2">
        <Button onClick={handleLocalConfirm} disabled={loading || importing} className="w-full bg-primary hover:bg-primary/90">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : (
            /* The same sun-over-waves mark used as the push-notification glyph
               (android .../res/drawable/ic_stat_symphony.xml) — sun filled,
               two waves stroked. currentColor so it inherits the button text. */
            <svg className="w-4 h-4 mr-2 flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="7.5" r="3.2" fill="currentColor" />
              <path d="M3,15 q1.5,-2 3,0 t3,0 t3,0 t3,0 t3,0 t3,0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M3,19.5 q1.5,-2 3,0 t3,0 t3,0 t3,0 t3,0 t3,0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          )}
          Enter
        </Button>
        {error && <p className="text-xs text-destructive text-center mt-1.5">{error}</p>}
      </div>

      <div className="border-t border-border/40 pt-4 mt-2">
        <button
          type="button"
          onClick={() => setShowImport((v) => !v)}
          aria-expanded={showImport || !!externalImport}
          className="w-full flex items-center gap-2 py-1 text-sm font-medium text-foreground"
        >
          <span className="flex-1 text-left">Data import + find</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${(showImport || externalImport) ? "rotate-180" : ""}`} />
        </button>
        {(showImport || externalImport) && (
        <div className="space-y-2 pt-3">
        {/* Recovery-first: look for missing data here BEFORE re-importing over the
            top (which is destructive). Opens the same scan the boot path uses. */}
        <button
          type="button"
          onClick={() => setShowRescue(true)}
          className="w-full text-left text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-foreground hover:bg-amber-500/10"
        >
          <span className="font-medium">Scan for missing data</span>{" "}
          <span className="text-muted-foreground">Finds data from before an update — don't import over the top yet.</span>
        </button>
        <p className="text-xs font-medium text-foreground">Already have data elsewhere?</p>
        <input
          ref={fileInputRef}
          type="file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; handleImportFile(f); }}
          className="hidden"
        />
        {!externalImport ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={openImportPicker}
              disabled={loading || importing}
              className="w-full justify-start h-auto py-2.5 whitespace-normal"
            >
              {importing
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin flex-shrink-0" />
                : <Upload className="w-4 h-4 mr-2 flex-shrink-0" />}
              <span className="text-left min-w-0">
                <span className="block">Import from a file</span>
                <span className="block text-xs text-muted-foreground font-normal whitespace-normal break-words">
                  Symphony backup, Simply Plural, Octocon, PluralSpace (.json), OpenPlural (.zip) or Ampersand (.ampar) — auto-detected
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleStartAndImport}
              disabled={loading || importing}
              className="w-full justify-start"
            >
              {loading
                ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                : <Cloud className="w-4 h-4 mr-2" />}
              Import with API token (Simply Plural, PluralKit…)
            </Button>
            {importStatus && (
              <p className={`text-xs ${importStatus.type === "error" ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                {importStatus.text}
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Importing from{" "}
                {externalImport.type === "simplyplural" ? "Simply Plural"
                  : externalImport.type === "octocon" ? "Octocon"
                  : externalImport.type === "openplural" ? "OpenPlural"
                  : "an external app"}
                {" — "}
                <span className="text-foreground">{externalImport.file.name}</span>
              </p>
              <button
                type="button"
                onClick={() => setExternalImport(null)}
                className="text-xs text-primary underline whitespace-nowrap flex-shrink-0"
              >
                Use a different file
              </button>
            </div>
            {externalImport.type === "ask" ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  We can't tell if this is a Simply Plural or OpenPlural file. Which app is it from?
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setExternalImport(p => ({ ...p, type: "simplyplural" }))}
                  >
                    Simply Plural
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setExternalImport(p => ({ ...p, type: "openplural" }))}
                  >
                    OpenPlural / PluralSpace
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {externalImport.type === "simplyplural" && (
                  <SimplyPluralFileImport presetFile={externalImport.file} settings={null} onSettingsChange={() => {}} />
                )}
                {externalImport.type === "octocon" && (
                  <OctoconConnect presetFile={externalImport.file} settings={null} onSettingsChange={() => {}} />
                )}
                {externalImport.type === "openplural" && (
                  <OpenPluralConnect presetFile={externalImport.file} settings={null} onSettingsChange={() => {}} />
                )}
                <Button
                  type="button"
                  onClick={onComplete}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  Done — open the app
                </Button>
              </>
            )}
          </div>
        )}
        </div>
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

      {/* SP / PK / OpenPlural import, opened after "Import from another
          app" sets up the empty local DB. Closing it (after importing or
          not) completes onboarding and drops the user into the app. */}
      <ImportAltersModal
        open={showImportModal}
        onClose={() => { setShowImportModal(false); onComplete(); }}
        contentClassName="z-[130]"
      />

      {showRescue && <DataRescuePanel onClose={() => setShowRescue(false)} />}
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
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-[100] overflow-y-auto overscroll-contain">
      <div className="min-h-full flex items-start sm:items-center justify-center p-4 pb-24">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl my-auto">

        {/* Header — unlock is a simple lock prompt; first-run setup doubles as
            the welcome intro (the two used to be separate screens). */}
        {mode === "unlock" ? (
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-foreground text-center">
              Unlock Symphony
            </h2>
          </div>
        ) : (
          <div className="flex flex-col items-center mb-5">
            <img src="/logo.png" className="w-16 h-16 object-contain rounded-2xl mb-4" alt="Oceans Symphony" />
            <h2 className="font-display text-2xl font-semibold text-foreground text-center">
              Welcome to Oceans Symphony
            </h2>
            <p className="text-sm text-foreground/90 leading-relaxed text-center mt-3">
              A companion app for dissociative systems
            </p>
            <div className="mt-3 space-y-2.5 text-sm text-muted-foreground leading-relaxed text-center">
              <p>Designed by an AuDHD, DID system to fill a specific void and assist my needs.</p>
              <p>Beyond just tracking your system, OS provides structure, tools, and guidance to support your system and build bridges across dissociative and amnesiac barriers.</p>
              <p>Everything is designed with dissociative systems in mind.</p>
              <p>Utilize as many or as few of the features as you find helpful, explore at your own pace, and thank you for giving OS a try.</p>
            </div>
          </div>
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
                  <p>Everything you log lives in this app or browser's <strong className="text-foreground">IndexedDB</strong> on this device: {`${'alters, fronting sessions, journals, emotion / symptom check-ins, activities, plans, to-dos, diary cards, reminders, lineage events, locations, status notes, grounding techniques, custom fields, theme / navigation settings, and so on'}`}. A handful of small per-browser/install preferences also live in <strong className="text-foreground">localStorage</strong> (theme + last-opened list ids, daily-task firing markers, push notification IDs, the friends-server identity, and grocery lists you've explicitly marked "available when locked"). Both stores stay on this device — neither gets uploaded anywhere.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🔒 What encryption protects (and what it doesn't)</p>
                  <p>Turning on password encryption applies <strong className="text-foreground">AES-256-GCM</strong> to the IndexedDB blob, with a key derived from your password via <strong className="text-foreground">PBKDF2 (100k iterations)</strong>. Your password never leaves this device; the encryption salt is embedded inside the encrypted payload so a localStorage wipe alone can't make the data permanently undecryptable. <strong className="text-foreground">localStorage entries are not encrypted</strong> — they're intentionally lightweight settings + the unlocked grocery lists you opted into. <strong className="text-foreground">If you lose your password, the encrypted data cannot be recovered.</strong></p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🚫 What's never stored</p>
                  <p>No analytics, no crash telemetry, no usage tracking, no advertising IDs. There's no Oceans Symphony account and no server-side copy of your data — even crashes stay on your device unless you choose to email a log.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">👥 Friends Mode (opt-in)</p>
                  <p>Friends mode is the only feature that sends anything off-device, and it is <strong className="text-foreground">off until you set it up</strong>. When enabled, the only data that reaches the friends relay is the identity you set up (your chosen system + display name) and your current front — essentially just the <strong className="text-foreground">display name and colour of whoever's fronting</strong> — at the granularity you pick (full names, count only, or hidden), with per-friend overrides. <strong className="text-foreground">Everything else stays on this device and is never sent.</strong> Journals, emotions, symptoms, plans, locations, chat, and all your other logged data are private — and that list isn't exhaustive: nothing beyond the fronting display name and colour ever leaves.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🌐 Optional third-party imports</p>
                  <p>The PluralKit connector is opt-in and one-way: you provide a token, the app fetches your data from PluralKit's servers and stores it locally. Simply Plural, OpenPlural, Octocon and PluralSpace import from an export file — nothing leaves your device. No data flows back to any of them from Symphony.</p>
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
                    onClick={() => openExternalUrl("https://penumbrialecosystem.neocities.org/os")}
                    className="text-primary underline cursor-pointer"
                  >
                    Website
                  </span>{" "}
                  ·{" "}
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
    </div>
  );
}