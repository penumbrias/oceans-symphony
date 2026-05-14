import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Bug, ExternalLink, Mail } from "lucide-react";
import { APP_VERSION } from "@/lib/appVersion";

const REPO = "penumbrias/oceans-symphony";
const FALLBACK_EMAIL = "pesturedrawing@gmail.com";

// In-app bug reporter. Submits land in GitHub Issues (one place, easy
// to label / triage / link to commits) and we auto-fill the metadata
// chunk so users don't have to copy-paste version, URL, or UA. A
// mailto: fallback covers users without a GitHub account.
//
// No PAT, no server function. The Submit button opens GitHub's
// canonical /issues/new URL with the form pre-filled — the user
// signs in there and clicks Submit. Reports are always attributed to
// the user's own GitHub account, never to a shared bot, and we don't
// have to handle any tokens.
export default function BugReportModal({ open, onClose }) {
  const [summary, setSummary] = useState("");
  const [whatHappened, setWhatHappened] = useState("");
  const [expected, setExpected] = useState("");
  const [steps, setSteps] = useState("");

  const reset = () => {
    setSummary("");
    setWhatHappened("");
    setExpected("");
    setSteps("");
  };

  const buildBody = () => {
    const lines = [];
    if (whatHappened.trim()) {
      lines.push("### What happened");
      lines.push(whatHappened.trim());
      lines.push("");
    }
    if (expected.trim()) {
      lines.push("### What I expected");
      lines.push(expected.trim());
      lines.push("");
    }
    if (steps.trim()) {
      lines.push("### Steps to reproduce");
      lines.push(steps.trim());
      lines.push("");
    }
    lines.push("---");
    lines.push("");
    lines.push("**Environment** (auto-filled)");
    lines.push(`- App version: \`${APP_VERSION}\``);
    if (typeof window !== "undefined") {
      lines.push(`- URL: \`${window.location.pathname}${window.location.search}\``);
      lines.push(`- User agent: \`${navigator.userAgent}\``);
      lines.push(`- Display: ${window.innerWidth}×${window.innerHeight}`);
    }
    return lines.join("\n");
  };

  const ghUrl = (() => {
    const title = encodeURIComponent(summary.trim() || "Bug report");
    const body = encodeURIComponent(buildBody());
    return `https://github.com/${REPO}/issues/new?title=${title}&body=${body}&labels=bug`;
  })();

  const mailUrl = (() => {
    const subj = encodeURIComponent(`Oceans Symphony bug — ${summary.trim() || "(no summary)"}`);
    const body = encodeURIComponent(buildBody());
    return `mailto:${FALLBACK_EMAIL}?subject=${subj}&body=${body}`;
  })();

  const handleClose = () => {
    reset();
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      {/*
        Constrain the dialog and let its body scroll so the Open-on-
        GitHub / Cancel buttons at the bottom never get clipped off the
        screen on shorter phones (where the form is taller than the
        dialog's max-height).
      */}
      <DialogContent className="max-w-lg flex flex-col max-h-[90vh] sm:max-h-[85vh]">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-amber-500" />
            Report a bug
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto overscroll-contain flex-1 -mx-1 px-1">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Fill in what you can — even a one-line summary is useful. When you submit, your phone's browser opens a GitHub issue pre-filled with everything you typed, plus the current app version and browser info. You'll need a GitHub account to post it (free to sign up), or you can email it instead.
          </p>

          <div className="space-y-1">
            <Label htmlFor="bug-summary" className="text-xs">Summary <span className="text-muted-foreground/60">(short title)</span></Label>
            <Input
              id="bug-summary"
              placeholder="e.g. Friend's front shows empty when Kane is fronting"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={120}
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bug-what" className="text-xs">What happened?</Label>
            <Textarea
              id="bug-what"
              placeholder="Describe the actual behaviour you saw."
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              rows={3}
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bug-expected" className="text-xs">What did you expect?</Label>
            <Textarea
              id="bug-expected"
              placeholder="What did you think should have happened instead?"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="bug-steps" className="text-xs">Steps to reproduce <span className="text-muted-foreground/60">(optional)</span></Label>
            <Textarea
              id="bug-steps"
              placeholder={"1. ...\n2. ...\n3. ..."}
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              rows={3}
              className="text-sm font-mono"
            />
          </div>

          <p className="text-[11px] text-muted-foreground italic">
            Your app version, URL, and browser info are appended automatically so we don't have to ask.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button variant="ghost" onClick={handleClose} className="sm:order-1">Cancel</Button>
            <a
              href={mailUrl}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-border/60 text-sm hover:bg-muted/50 transition-colors"
            >
              <Mail className="w-3.5 h-3.5" /> Email instead
            </a>
            <a
              href={ghUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open on GitHub <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
