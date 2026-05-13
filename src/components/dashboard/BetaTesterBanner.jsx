import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Megaphone, X, CheckCircle2 } from "lucide-react";

const DISMISS_KEY = "dismissed_beta_tester_banner_v1";
const TESTER_EMAIL = "pesturedrawing@gmail.com";

export default function BetaTesterBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "true"; }
    catch { return false; }
  });
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  if (dismissed) return null;

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "true"); } catch { /* ignore */ }
    setDismissed(true);
  };

  const handleSubmit = () => {
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    const subject = encodeURIComponent("Oceans Symphony — sign me up as a tester");
    const body = encodeURIComponent(
      `Hi! Please add me to the Oceans Symphony Play Store tester list.\n\nMy Google account: ${trimmed}\n\nThanks!`
    );
    window.location.href = `mailto:${TESTER_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <div className="relative rounded-xl border border-primary/30 bg-primary/5 p-4 mb-3 space-y-3">
      <button
        onClick={handleDismiss}
        aria-label="Dismiss tester banner"
        className="absolute top-2 right-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Megaphone className="w-4 h-4 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Help us launch on Google Play</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We need a few more testers to graduate from internal testing to the public store. If you have an Android device and want to help, drop your Google account email and we'll add you to the tester list.
          </p>
        </div>
      </div>
      {sent ? (
        <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400 text-xs pl-12">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Thanks! Your email app should have opened with a pre-filled message — just hit send.</span>
        </div>
      ) : (
        <div className="pl-12 flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="your-gmail@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            className="text-sm h-9 flex-1"
          />
          <Button onClick={handleSubmit} size="sm" disabled={!email.trim() || !email.includes("@")}>
            Sign me up
          </Button>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground pl-12">
        Or email <a href={`mailto:${TESTER_EMAIL}`} className="text-primary hover:underline">{TESTER_EMAIL}</a> directly. Your email is only used to add you as a tester.
      </p>
    </div>
  );
}
