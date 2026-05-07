import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, HardDrive, Lock, Eye, EyeOff, ShieldCheck, Loader2, ChevronDown } from "lucide-react";
import { setMode, setEncryptionEnabled } from "@/lib/storageMode";
import { initLocalDb } from "@/lib/localDb";

function FirstRunSetup({ onComplete }) {
  const [step, setStep] = useState("choose");
  const [useEncryption, setUseEncryption] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChooseCloud = () => { setMode("cloud"); onComplete(); };
  const handleChooseLocal = () => { setStep("local_password"); };

  const handleLocalConfirm = async () => {
    if (useEncryption && password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (useEncryption && password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
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
      <div className="flex gap-2 pt-2">
        <Button variant="outline" onClick={() => setStep("choose")} className="flex-1">Back</Button>
        <Button onClick={handleLocalConfirm} disabled={loading} className="flex-1 bg-primary hover:bg-primary/90">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <HardDrive className="w-4 h-4 mr-2" />}
          {useEncryption ? "Set Up Encrypted Local" : "Use Local Storage"}
        </Button>
      </div>
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
                onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
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
                  <p className="font-medium text-foreground">🔒 Local Storage</p>
                  <p>All data is stored on your device with <strong className="text-foreground">AES-256-GCM encryption</strong>. Your password never leaves your device. <strong>If you lose your encryption password, data cannot be retrieved.</strong></p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">💾 Backups</p>
                  <p>Use Settings → Backup &amp; Export to save your data as a JSON file. Keep backups safe — local data is tied to this device and will be lost if you clear app data without a backup.</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">🤖 Transparency</p>
                  <p>Oceans Symphony is <strong className="text-foreground">vibe-coded</strong> — built with AI assistance. It is a work in progress, shared in good faith. We do our best but cannot guarantee it is bug-free.</p>
                </div>
                <p className="text-amber-600 dark:text-amber-400 font-medium pt-1">
                  🌊 Free and open source, shared by a DID system to fill a void in the community.{" "}
                  Contact: pesturedrawing@gmail.com ·{" "}
                  <span
                    onClick={() => window.open("https://github.com/penumbrias/oceans-symphony/releases", "_blank")}
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