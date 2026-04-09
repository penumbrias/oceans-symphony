import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cloud, HardDrive, Lock, Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import { setMode, setEncryptionEnabled, isEncryptionEnabled } from "@/lib/storageMode";
import { initLocalDb } from "@/lib/localDb";

// Shown on first run (mode === null)
function FirstRunSetup({ onComplete }) {
  const [step, setStep] = useState("choose"); // choose | local_password
  const [useEncryption, setUseEncryption] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChooseCloud = () => {
    setMode("cloud");
    onComplete();
  };

  const handleChooseLocal = () => {
    setStep("local_password");
  };

  const handleLocalConfirm = async () => {
    if (useEncryption && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (useEncryption && password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
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

  if (step === "choose") {
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground text-sm text-center">
          Choose how Symphony stores your data. You can change this later in Settings.
        </p>
        <div className="grid gap-3">
          <button
            onClick={handleChooseLocal}
            className="flex items-start gap-4 p-4 rounded-xl border-2 border-primary/40 bg-primary/5 hover:border-primary/80 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HardDrive className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Local Only</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                All data stays on this device. No account required. Optional high-security password encryption. Backup/export your data frequently - but<strong> use this method! much more secure!</strong>
              </p>
            </div>
          </button>
          <button
            onClick={handleChooseCloud}
            className="flex items-start gap-4 p-4 rounded-xl border-2 border-border/60 bg-muted/30 hover:border-border transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center flex-shrink-0 mt-0.5">
              <Cloud className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Cloud Sync</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Data synced to the cloud. Requires an account. Access from any device. Saves data on base44 servers - please do not use this!
              </p>
            </div>
          </button>
        </div>
      </div>
    );
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

// Shown on returning visits when db is encrypted (locked)
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
      <div className="flex justify-center mb-2">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Lock className="w-7 h-7 text-primary" />
        </div>
      </div>
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
  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            {mode === "unlock" ? <Lock className="w-6 h-6 text-primary" /> : <HardDrive className="w-6 h-6 text-primary" />}
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground">
            {mode === "unlock" ? "Unlock Symphony" : "Welcome to Symphony"}
          </h2>
        </div>
        {mode === "unlock"
          ? <UnlockScreen onUnlock={onComplete} />
          : <FirstRunSetup onComplete={onComplete} />
        }
      </div>
    </div>
  );
}