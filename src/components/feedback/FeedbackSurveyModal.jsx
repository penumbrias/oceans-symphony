// The app-usability survey (v0.366.4). A message from the app's creator,
// a handful of open questions and a ramble box. Like the bug reporter it
// needs no server: "Email my answers" opens the person's mail app with
// everything filled in, to the same address bug reports go to, and "Copy
// answers" covers phones with no mail app set up.
//
// Nothing about the person or their data is attached — only the app
// version and which kind of app it is (web, Android, iOS, desktop). The
// answers are a draft in localStorage until sent, so leaving mid-way
// (or the dialog closing) never loses what was typed.

import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Copy, Check, ShieldAlert } from "lucide-react";
import { APP_VERSION } from "@/lib/appVersion";
import { getNativePlatform, isDesktop, isNative } from "@/lib/platform";
import { toast } from "sonner";
import { confirm } from "@/components/shared/ConfirmDialog";

export const FEEDBACK_EMAIL = "pesturedrawing@gmail.com";
const DRAFT_KEY = "symphony_feedback_survey_draft_v1";

// Draft questions — Penumbra reviews the wording before this ships.
export const SURVEY_QUESTIONS = [
  { id: "use", q: "What do you use the app for most?" },
  { id: "hard", q: "What has been hardest or most confusing to find or use?" },
  { id: "start", q: "How did getting started feel? What would have helped in your first few days?" },
  { id: "missing", q: "Is there anything you expected the app to do that it doesn't?" },
  { id: "change", q: "If you could change one thing about the app, what would it be?" },
  { id: "more", q: "Anything else? Ramble and tangent away." },
];

function platformName() {
  try {
    if (isDesktop()) return "Desktop";
    if (isNative()) return getNativePlatform() === "ios" ? "iOS" : "Android";
  } catch { /* fall through */ }
  return "Web";
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

export function buildSurveyBody(answers) {
  const lines = [];
  for (const { id, q } of SURVEY_QUESTIONS) {
    const a = (answers[id] || "").trim();
    if (!a) continue;
    lines.push(q);
    lines.push(a);
    lines.push("");
  }
  lines.push("---");
  lines.push(`App version: ${APP_VERSION} (${platformName()})`);
  return lines.join("\n");
}

export default function FeedbackSurveyModal({ open, onClose, onSent }) {
  const [answers, setAnswers] = useState(readDraft);
  const [copied, setCopied] = useState(false);

  // Keep the draft as they type, so closing never loses it.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(answers)); } catch { /* storage off */ }
  }, [answers]);

  const hasAnswers = SURVEY_QUESTIONS.some(({ id }) => (answers[id] || "").trim());
  const body = buildSurveyBody(answers);
  const mailUrl = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent("Oceans Symphony feedback")}&body=${encodeURIComponent(body)}`;

  const markSent = () => {
    // The draft stays until they confirm it went — a mail app that never
    // opened mustn't cost them their answers.
    onSent?.();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`To: ${FEEDBACK_EMAIL}\n\n${body}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success(`Copied. Paste it into an email to ${FEEDBACK_EMAIL}.`);
      markSent();
    } catch {
      toast.error("Couldn't copy on this device.");
    }
  };

  const clearDraft = async () => {
    const ok = await confirm({ title: "Clear your answers?", body: "Everything you've written here will be removed.", confirmLabel: "Clear", destructive: true });
    if (!ok) return;
    setAnswers({});
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage off */ }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.(); }}>
      <DialogContent
        className="max-w-lg flex flex-col max-h-[90vh] sm:max-h-[85vh]"
        // A tap outside mustn't throw away a half-written answer.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="flex-shrink-0 text-left">
          <DialogTitle>Share your feedback</DialogTitle>
          <DialogDescription className="sr-only">An app usability survey from the app's creator.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto overscroll-contain flex-1 -mx-1 px-1">
          <div className="space-y-2 text-sm leading-relaxed">
            <p>Hi! This is a message from Penumbrial Ecosystem, the app's creator 😃</p>
            <p>I hope for your wellness, safety, and abundance.</p>
            <p>
              I'm seeking to improve app usability and want to hear feedback from you all! I have a few
              questions but feel free to ramble and tangent, as long as the subject remains focused on the
              app, I'm very interested in your thoughts. Responses will be sent to my email address, the same
              one which bug reports are sent to, <span className="font-medium select-all">{FEEDBACK_EMAIL}</span>.
            </p>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
            <p className="font-medium">Please DO NOT share any private, personal, medical, or identifying information.</p>
          </div>

          <p className="text-xs text-muted-foreground">
            Every question is optional. Answer one, all of them, or just the last box.
          </p>

          {SURVEY_QUESTIONS.map(({ id, q }) => (
            <div key={id} className="space-y-1.5">
              <Label htmlFor={`survey-${id}`} className="text-sm leading-snug">{q}</Label>
              {/* Emailed, never saved — @mention popups would invite names
                  into an email we ask to keep anonymous. ui-ok */}
              <Textarea
                id={`survey-${id}`}
                value={answers[id] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [id]: e.target.value }))}
                rows={id === "more" ? 5 : 3}
                className="text-sm"
              />
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Only your answers and the app version ({APP_VERSION}, {platformName()}) are sent. Your answers are
            kept here as a draft until you clear them.
          </p>
        </div>

        <div className="flex-shrink-0 flex flex-col gap-2 pt-3 border-t border-border/50">
          <div className="flex flex-col sm:flex-row gap-2">
            {hasAnswers ? (
              <a href={mailUrl} onClick={markSent} className={buttonVariants({ className: "flex-1 gap-1.5" })}>
                <Mail className="w-4 h-4" /> Email my answers
              </a>
            ) : (
              <Button disabled className="flex-1 gap-1.5"><Mail className="w-4 h-4" /> Email my answers</Button>
            )}
            <Button variant="outline" onClick={copy} disabled={!hasAnswers} className="flex-1 gap-1.5">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />} Copy answers
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={clearDraft} disabled={!hasAnswers}>Clear answers</Button>
            <Button variant="ghost" size="sm" onClick={() => onClose?.()}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
