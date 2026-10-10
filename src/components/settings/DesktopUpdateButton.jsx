import React, { useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  desktopUpdatesSupported, getDesktopUpdateStatus, checkForDesktopUpdate,
  onDesktopUpdateStatus, installDesktopUpdate,
} from "@/lib/desktopUpdates";

// Settings → "Check for updates" (desktop app only). Checks the app's
// GitHub releases, downloads a newer version, then saves everything and
// restarts into it. Renders nothing in the browser, on phones, and in
// desktop builds that can't replace themselves (.deb, dev runs).
export default function DesktopUpdateButton() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState({ state: "idle" });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    let alive = true;
    desktopUpdatesSupported().then((ok) => {
      if (!alive || !ok) return;
      setSupported(true);
      getDesktopUpdateStatus().then((s) => { if (alive && s) setStatus(s); });
    });
    const off = onDesktopUpdateStatus((s) => { if (alive && s) setStatus(s); });
    return () => { alive = false; off(); };
  }, []);

  // The download finished after a button press: install straight away.
  useEffect(() => {
    if (status.state !== "ready" || !status.autoInstall || installing) return;
    setInstalling(true);
    installDesktopUpdate().catch(() => setInstalling(false));
  }, [status, installing]);

  if (!supported) return null;

  const check = async () => {
    setStatus({ state: "checking" });
    try {
      const s = await checkForDesktopUpdate();
      if (s && s.state !== "checking") setStatus(s);
    } catch {
      setStatus({ state: "error", message: "Couldn't check for updates. Try again in a moment." });
    }
  };
  const install = async () => {
    setInstalling(true);
    try { await installDesktopUpdate(); } catch { setInstalling(false); }
  };

  const { state } = status;
  const busy = state === "checking" || state === "downloading" || installing;

  let label = "Check for updates";
  let Icon = RefreshCw;
  let onClick = check;
  if (installing) { label = "Restarting to update…"; Icon = Loader2; }
  else if (state === "checking") { label = "Checking…"; Icon = Loader2; }
  else if (state === "downloading") { label = `Downloading ${status.version || "update"}… ${status.percent || 0}%`; Icon = Loader2; }
  else if (state === "ready") { label = `Restart to install ${status.version || "the update"}`; Icon = Download; onClick = install; }

  return (
    <div className="space-y-1" data-tour="settings-desktop-update">
      <Button
        type="button"
        size="sm"
        variant={state === "ready" ? "default" : "outline"}
        onClick={onClick}
        disabled={busy}
        className="gap-1.5"
      >
        <Icon className={`w-3.5 h-3.5 ${Icon === Loader2 ? "animate-spin" : ""}`} /> {label}
      </Button>
      {state === "up-to-date" && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> You have the latest version.
        </p>
      )}
      {state === "error" && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" /> {status.message || "Couldn't check for updates."}
        </p>
      )}
      {state === "ready" && !installing && (
        <p className="text-xs text-muted-foreground">Everything is saved first. The app closes and reopens on the new version.</p>
      )}
    </div>
  );
}
