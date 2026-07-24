// Inline "Enable password encryption" widget for the Setup checklist's
// Backups & encryption item (v0.85.2 — the item previously had no way
// to actually set up encryption; users had to leave the guide for
// Settings → Data & Privacy). Compact enable-only path — Change/Remove
// live in the full Settings surface.

import React, { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { enableEncryption, isEncryptionActive } from "@/lib/localDb";
import { toast } from "sonner";

export default function InlineEncryptionSetup() {
  const [encEnabled, setEncEnabled] = useState(() => isEncryptionActive());
  const [expanded, setExpanded] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Keep in sync if Settings → Data & Privacy is used in parallel.
    const check = () => setEncEnabled(isEncryptionActive());
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  const reset = () => {
    setNewPassword(""); setConfirmPassword(""); setError(""); setShowPass(false);
  };

  const handleEnable = async () => {
    setError("");
    if (newPassword !== confirmPassword) { setError("Passwords don't match."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    try {
      await enableEncryption(newPassword);
      setEncEnabled(true);
      setExpanded(false);
      reset();
      toast.success("Encryption enabled 🔒");
    } catch (e) {
      setError(e?.message || "Couldn't enable encryption.");
    } finally {
      setLoading(false);
    }
  };

  if (encEnabled) {
    return (
      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        <p className="text-xs flex-1">
          <span className="font-medium">Password encryption is on.</span>{" "}
          Change or remove it from <span className="text-muted-foreground">Settings → Data &amp; Privacy → Storage &amp; encryption</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Password encryption (optional)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Lock your on-device data behind a password. Anyone opening the app must enter it before
            the app can read anything. <span className="font-medium text-foreground">If you lose the
            password, the encrypted data cannot be recovered.</span>
          </p>
        </div>
      </div>
      {!expanded ? (
        <Button size="sm" variant="outline" onClick={() => setExpanded(true)} className="w-full gap-1.5">
          <Lock className="w-3.5 h-3.5" /> Enable password encryption
        </Button>
      ) : (
        <div className="space-y-2 pt-1">
          <Label className="text-xs">New password</Label>
          <div className="relative">
            <Input
              type={showPass ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="pr-9 h-8 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? "Hide password" : "Show password"}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="h-8 text-sm"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setExpanded(false); reset(); }} className="flex-1">
              Cancel
            </Button>
            <Button size="sm" onClick={handleEnable} disabled={loading} className="flex-1 gap-1">
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
              Enable
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
