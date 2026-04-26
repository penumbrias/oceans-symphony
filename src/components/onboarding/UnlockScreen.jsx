import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { initLocalDb } from "@/lib/localDb";

export default function UnlockScreen({ onUnlock }) {
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
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-2xl p-6 shadow-2xl space-y-5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <img src="/logo.svg" alt="Oceans Symphony" className="w-10 h-10" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-foreground">Unlock Symphony</h2>
          <p className="text-sm text-muted-foreground text-center">
            Your data is encrypted. Enter your password to continue.
          </p>
        </div>

        <div className="space-y-3">
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
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button
            onClick={handleUnlock}
            disabled={loading || !password}
            className="w-full bg-primary hover:bg-primary/90"
          >
            {loading
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Lock className="w-4 h-4 mr-2" />}
            Unlock
          </Button>
        </div>
      </div>
    </div>
  );
}
