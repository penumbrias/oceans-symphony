import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Pencil, Eye, CheckCircle2, Users, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import CheckInStep1 from "@/components/system-checkin/CheckInStep1";
import CheckInStep2 from "@/components/system-checkin/CheckInStep2";
import CheckInStep3 from "@/components/system-checkin/CheckInStep3";
import CheckInStep4 from "@/components/system-checkin/CheckInStep4";
import CheckInStep5 from "@/components/system-checkin/CheckInStep5";
import MeetingParticipantsSection, { normalizeParticipants } from "@/components/system-checkin/MeetingParticipantsSection";
import MeetingDialogue, { normalizeDialogue } from "@/components/system-checkin/MeetingDialogue";
import { saveMentions } from "@/lib/mentionUtils";
import { applyWhisper } from "@/lib/whisperUtils";
import RichText from "@/components/shared/RichText";
import { renderRichContent } from "@/lib/renderBulletinContent";
import { useMentionHighlight } from "@/lib/useMentionHighlight";

export default function SystemCheckInPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const terms = useTerms();
  const [view, setView] = useState("list"); // "list" | "create" | "edit"
  const [currentCheckIn, setCurrentCheckIn] = useState(null);
  const [formData, setFormData] = useState({});

  const { data: checkIns = [] } = useQuery({
    queryKey: ["systemCheckIns"],
    queryFn: () => base44.entities.SystemCheckIn.list("-created_date", 100),
  });

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  // Open specific check-in if ?id= URL param is present — view mode by default
  const [pendingId] = useState(() => new URLSearchParams(window.location.search).get('id'));
  React.useEffect(() => {
    if (pendingId && checkIns.length > 0 && view === "list") {
      const ci = checkIns.find(c => c.id === pendingId);
      if (ci) { setCurrentCheckIn(ci); setFormData(ci); setView("view"); }
    }
  }, [pendingId, checkIns.length]);

  // Highlight check-in on arrival from mention
  useMentionHighlight("id", checkIns.length > 0 && view === "view");

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemCheckIn.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemCheckIns"] });
      toast.success("Check-in saved!");
      setFormData({});
      setView("list");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.SystemCheckIn.update(currentCheckIn.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["systemCheckIns"] });
      toast.success("Check-in updated!");
      setFormData({});
      setCurrentCheckIn(null);
      setView("list");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSave = async () => {
    // Every field is optional — including the date. If somehow empty, default
    // to today rather than blocking the save.
    if (!formData.date) {
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      formData.date = localDate;
    }

    // Transform any "/w @name [secret]" in the step notes into a whisper bar
    // (no brackets warns first — a check-in note is a personal record). The
    // @recipients are still caught by saveMentions below (it runs on the
    // original text, which still contains the @names), so they're notified.
    const dataToSave = { ...formData };
    for (const key of ["step3_greet", "step4_share", "step5_closing"]) {
      const step = dataToSave[key];
      if (step?.notes) {
        const ww = applyWhisper(step.notes, alters, { allowWholeBlur: false, rich: false, surfaceLabel: "check-in note" });
        if (ww === null) return; // user backed out of the whole-blur warning
        dataToSave[key] = { ...step, notes: ww.content };
      }
    }

    const allStepContent = [
      formData.step3_greet?.notes,
      formData.step4_share?.notes,
      formData.step5_closing?.notes,
    ].filter(Boolean).join(" ");

    if (currentCheckIn) {
      updateMutation.mutate(dataToSave);
      // Save mentions for existing check-in
      if (allStepContent && alters.length > 0) {
        await saveMentions({
          content: allStepContent,
          alters,
          sourceType: "checkin",
          sourceId: currentCheckIn.id,
          sourceLabel: "System Check-In",
          navigatePath: `/system-checkin?id=${currentCheckIn.id}`,
          authorAlterId: null,
        });
      }
    } else {
      // Create new and then save mentions with the returned ID
      const newCheckIn = await base44.entities.SystemCheckIn.create(dataToSave);
      queryClient.invalidateQueries({ queryKey: ["systemCheckIns"] });
      if (allStepContent && alters.length > 0) {
        await saveMentions({
          content: allStepContent,
          alters,
          sourceType: "checkin",
          sourceId: newCheckIn.id,
          sourceLabel: "System Check-In",
          navigatePath: `/system-checkin?id=${newCheckIn.id}`,
          authorAlterId: null,
        });
      }
      // Per-participant feelings → EmotionCheckIn, attributed to that alter,
      // so a meeting participant's emotions show up in analytics / the
      // check-in log exactly like a Quick Check-In does. Each participant
      // gets its own row (their feelings are recorded separately).
      await syncParticipantEmotions(formData.participants);
      toast.success("Check-in saved!");
      setFormData({});
      setView("list");
      return;
    }
    // Who's near now comes from the single "Notice who's near" participants
    // section. Old records may still carry step2_notice.alters_present, so fold
    // both together for back-compat. These ids update the active front session.
    const participantIds = normalizeParticipants(formData.participants).map((p) => p.alter_id);
    const legacyPresent = formData.step2_notice?.alters_present || [];
    const altersPresent = [...new Set([...participantIds, ...legacyPresent])];
    const alterIds = altersPresent.filter((id) => alters.some((a) => a.id === id));
   if (alterIds.length > 0) {
  try {
    const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
    if (activeSessions.length > 0) {
      // Additive — merge noticed alters into existing session without ending it
      const session = activeSessions[0];
      const existing = [
        session.primary_alter_id, 
        ...(session.co_fronter_ids || [])
      ].filter(Boolean);
      const merged = [...new Set([...existing, ...alterIds])];
      await base44.entities.FrontingSession.update(session.id, {
        primary_alter_id: merged[0],
        co_fronter_ids: merged.slice(1),
      });
      // End any duplicate active sessions
      for (const s of activeSessions.slice(1)) {
        await base44.entities.FrontingSession.update(s.id, {
          is_active: false,
          end_time: new Date().toISOString(),
        });
      }
    } else {
      // No active session — create one
      await base44.entities.FrontingSession.create({
        primary_alter_id: alterIds[0],
        co_fronter_ids: alterIds.slice(1),
        start_time: new Date().toISOString(),
        is_active: true,
      });
    }
    queryClient.invalidateQueries({ queryKey: ["activeFront"] });
    queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
  } catch (err) {
    console.error("Failed to update front from check-in", err);
  }
}


    // Sync feelings to EmotionCheckIn so they appear in analytics
    // exactly the same way a Quick Check-In does — fronting alters from
    // Step 2's "alters present" picker, plus the sensations and notes
    // text folded into the EmotionCheckIn note so therapy reports,
    // analytics, and the check-in log all show the context.
    //
    // Legacy back-compat: Step 2 used to store feelings as a comma/
    // semicolon-separated string instead of an array.
    const feelings = formData.step2_notice?.feelings;
    let emotionLabels = [];
    if (Array.isArray(feelings)) {
      emotionLabels = feelings.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
    } else if (typeof feelings === "string" && feelings.trim()) {
      emotionLabels = feelings.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
    }
    if (emotionLabels.length > 0) {
      const sensations = (formData.step2_notice?.sensations || "").trim();
      const stepNotes = (formData.step2_notice?.notes || "").trim();
      const noteParts = ["From system check-in"];
      if (sensations) noteParts.push(`Sensations: ${sensations}`);
      if (stepNotes) noteParts.push(`Notes: ${stepNotes}`);
      try {
        await base44.entities.EmotionCheckIn.create({
          timestamp: new Date().toISOString(),
          emotions: emotionLabels,
          fronting_alter_ids: alterIds,
          note: noteParts.join(". "),
        });
        queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
      } catch {}
    }
  };

  // Per-participant feelings → EmotionCheckIn, one row per participant,
  // attributed to that alter. Only the new-meeting save path calls this
  // (so re-editing an old meeting doesn't duplicate rows).
  const syncParticipantEmotions = async (participants) => {
    const list = Array.isArray(participants) ? participants : [];
    let created = false;
    for (const p of list) {
      const emos = Array.isArray(p?.emotions) ? p.emotions.filter((s) => typeof s === "string" && s.trim()) : [];
      if (!p?.alter_id || emos.length === 0) continue;
      const noteBits = ["From system meeting"];
      if ((p.note || "").trim()) noteBits.push(p.note.trim());
      try {
        await base44.entities.EmotionCheckIn.create({
          timestamp: new Date().toISOString(),
          emotions: emos,
          fronting_alter_ids: [p.alter_id],
          alter_id: p.alter_id,
          note: noteBits.join(". "),
        });
        created = true;
      } catch {}
    }
    if (created) queryClient.invalidateQueries({ queryKey: ["emotionCheckIns"] });
  };

  const handleNewCheckIn = () => {
    setCurrentCheckIn(null);
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    setFormData({ date: localDate });
    setView("create");
  };

  const handleEdit = (checkIn) => {
    setCurrentCheckIn(checkIn);
    setFormData(checkIn);
    setView("create");
  };

  const handleDelete = async (id) => {
    if (confirm("Delete this check-in?")) {
      try {
        await base44.entities.SystemCheckIn.delete(id);
        queryClient.invalidateQueries({ queryKey: ["systemCheckIns"] });
        toast.success("Check-in deleted");
      } catch (err) {
        toast.error(err.message);
      }
    }
  };

  const handleView = (checkIn) => {
    setCurrentCheckIn(checkIn);
    setFormData(checkIn);
    setView("view");
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {view === "view" && currentCheckIn && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <Button variant="ghost" size="sm" onClick={() => setView("list")} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button variant="outline" size="sm" onClick={() => setView("create")} className="gap-2">
              <Pencil className="w-4 h-4" /> Edit
            </Button>
          </div>
          <div className="mb-6">
            <h1 className="font-display text-3xl font-semibold text-foreground">{terms.System} Meeting</h1>
            <p className="text-muted-foreground text-sm mt-1">
{(() => {
  // Same fallback shape as the list view — older / preview records
  // only have created_date.
  let d2;
  if (typeof currentCheckIn.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(currentCheckIn.date)) {
    const [y, m, d] = currentCheckIn.date.split("-").map(Number);
    d2 = new Date(y, m - 1, d);
  } else if (currentCheckIn.created_date) {
    d2 = new Date(currentCheckIn.created_date);
  } else {
    d2 = new Date();
  }
  return Number.isNaN(d2.getTime())
    ? "Undated"
    : d2.toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric"
      });
})()}
            </p>
          </div>
          <div className="space-y-4 max-w-2xl">
            {/* Step 1 */}
            {currentCheckIn.step1_arrive && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 1 · Arrive</p>
                  {currentCheckIn.step1_arrive.breaths_taken && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Breaths taken
                    </div>
                  )}
                  {currentCheckIn.step1_arrive.notes && <p className="text-sm text-foreground">{currentCheckIn.step1_arrive.notes}</p>}
                </CardContent>
              </Card>
            )}
            {/* Step 2 */}
            {currentCheckIn.step2_notice && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 2 · Notice</p>
                  {(currentCheckIn.step2_notice.alters_present || []).length > 0 && (
                    <div className="mb-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        <Users className="w-3.5 h-3.5" />
                        <span>{terms.alter}s present</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {currentCheckIn.step2_notice.alters_present.map((id) => {
                          const alter = alters.find(a => a.id === id) || groups.find(g => g.id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border"
                              style={{ backgroundColor: alter?.color ? `${alter.color}20` : undefined, color: alter?.color || undefined }}>
                              {alter?.name || id}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {(() => {
                    // feelings is an array of labels (new format) or a
                    // string (legacy). Render as a comma-joined string
                    // either way.
                    const f = currentCheckIn.step2_notice.feelings;
                    const text = Array.isArray(f) ? f.join(", ") : (typeof f === "string" ? f : "");
                    if (!text) return null;
                    return (
                      <p className="text-sm text-foreground mb-1">
                        <span className="text-muted-foreground text-xs">Feelings: </span>{text}
                      </p>
                    );
                  })()}
                  {currentCheckIn.step2_notice.sensations && <p className="text-sm text-foreground mb-1"><span className="text-muted-foreground text-xs">Sensations: </span>{currentCheckIn.step2_notice.sensations}</p>}
                  {currentCheckIn.step2_notice.notes && <p className="text-sm text-foreground">{currentCheckIn.step2_notice.notes}</p>}
                </CardContent>
              </Card>
            )}
            {/* Notice who's near — read-only: each one's feelings / symptoms / note shown separately */}
            {normalizeParticipants(currentCheckIn.participants).length > 0 && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notice who's near</p>
                  <div className="space-y-3">
                    {normalizeParticipants(currentCheckIn.participants).map((p) => {
                      const alter = alters.find((a) => a.id === p.alter_id);
                      const syms = Array.isArray(p.symptoms) ? p.symptoms : [];
                      return (
                        <div key={p.alter_id} className="rounded-lg border border-border/40 p-3">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: alter?.color || "#94a3b8" }} />
                              {alter?.name || "Unknown"}
                            </span>
                          </div>
                          {(p.emotions || []).length > 0 && (
                            <p className="text-sm text-foreground mb-1">
                              <span className="text-muted-foreground text-xs">Feelings: </span>{p.emotions.join(", ")}
                            </p>
                          )}
                          {syms.length > 0 && (
                            <p className="text-sm text-foreground mb-1">
                              <span className="text-muted-foreground text-xs">Symptoms: </span>
                              {syms.map((s) => `${s.label}${s.value != null && s.type !== "boolean" ? ` (${s.value})` : ""}`).join(", ")}
                            </p>
                          )}
                          {(p.note || "").trim() && (
                            <p className="text-sm text-foreground whitespace-pre-wrap">{p.note}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Open dialogue — read-only history of the meeting-scoped chat */}
            {normalizeDialogue(currentCheckIn.dialogue).length > 0 && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" /> Open dialogue
                  </p>
                  <div className="space-y-2">
                    {normalizeDialogue(currentCheckIn.dialogue).map((m) => {
                      // Resolve the message's author(s) — new multi-author
                      // (signposted / co-signed) array, or legacy single id.
                      const authorIds = (m.author_alter_ids && m.author_alter_ids.length > 0)
                        ? m.author_alter_ids
                        : (m.alter_id ? [m.alter_id] : []);
                      const authorList = authorIds.map((id) => alters.find((a) => a.id === id)).filter(Boolean);
                      const label = authorList.length > 0 ? authorList.map((a) => a.name).join(", ") : terms.System;
                      return (
                        <div key={m.id} className="text-sm">
                          <span className="font-semibold" style={{ color: authorList[0]?.color || undefined }}>
                            {label}
                          </span>
                          <span className="text-muted-foreground text-xs"> · {new Date(m.timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
                          <div className={`wysiwyg-content whitespace-pre-wrap break-words ${m.deleted_at ? "italic text-muted-foreground" : "text-foreground"}`}>
                            {m.deleted_at ? "[message deleted]" : renderRichContent(m.text, { terms })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
            {/* Step 3 */}
            {currentCheckIn.step3_greet?.notes && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 3 · Greet</p>
                  <div className="text-sm text-foreground"><RichText content={currentCheckIn.step3_greet.notes} alters={alters} /></div>
                </CardContent>
              </Card>
            )}
            {/* Step 4 */}
            {currentCheckIn.step4_share && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 4 · Share</p>
                  {currentCheckIn.step4_share.invitation_given && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Invitation given
                    </div>
                  )}
                  {currentCheckIn.step4_share.notes && <div className="text-sm text-foreground"><RichText content={currentCheckIn.step4_share.notes} alters={alters} /></div>}
                </CardContent>
              </Card>
            )}
            {/* Step 5 */}
            {currentCheckIn.step5_closing && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 5 · Closing</p>
                  {currentCheckIn.step5_closing.gratitude_expressed && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Gratitude expressed
                    </div>
                  )}
                  {currentCheckIn.step5_closing.reminder_given && (
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Reminder given
                    </div>
                  )}
                  {currentCheckIn.step5_closing.notes && <div className="text-sm text-foreground"><RichText content={currentCheckIn.step5_closing.notes} alters={alters} /></div>}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      {view === "list" ? (
        <div data-tour="meetings-list">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-foreground">{terms.System} Meetings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              A 5-minute guided ritual to connect with your {terms.system}
            </p>
            <p className="text-muted-foreground/70 text-xs mt-2 italic">
              Adapted from the 5 Minute System Check-In by Monika Ostroff, LICSW, CEDS-S / Healing My Parts
            </p>
          </div>
          <Button data-tour="meetings-new" onClick={handleNewCheckIn} className="gap-2 mb-6">
            <Plus className="w-4 h-4" />
            New Meeting
          </Button>
          {checkIns.length === 0 ? (
            <Card className="bg-muted/30">
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground text-sm">No check-ins yet. Create one to get started!</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {checkIns.map((checkIn) => {
                // `date` is the canonical YYYY-MM-DD field on the entity;
                // `created_date` is a full ISO string set automatically by
                // the backend on insert. Older records (and the Tapestry
                // preview) only have created_date, so fall back rather
                // than crash on `undefined.split(...)`.
                let date;
                if (typeof checkIn.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(checkIn.date)) {
                  const [y, m, d] = checkIn.date.split("-").map(Number);
                  date = new Date(y, m - 1, d);
                } else if (checkIn.created_date) {
                  date = new Date(checkIn.created_date);
                } else {
                  date = new Date();
                }
                const formatted = Number.isNaN(date.getTime())
                  ? "Undated check-in"
                  : date.toLocaleDateString("en-US", {
                      weekday: "short", month: "short", day: "numeric", year: "numeric",
                    });
                return (
                  <Card key={checkIn.id} id={`item-${checkIn.id}`} className="hover:bg-card/80 transition-colors border-border/50">
                    <CardContent className="py-4 px-4 flex items-center justify-between">
                      <div className="flex-1 cursor-pointer" onClick={() => handleView(checkIn)}>
                        <p className="font-medium text-foreground">{formatted}</p>
                        {checkIn.overall_notes && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{checkIn.overall_notes}</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleView(checkIn)}><Eye className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(checkIn)}>Edit</Button>
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(checkIn.id)}>Delete</Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : view === "create" ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => currentCheckIn ? setView("view") : setView("list")}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-foreground">
              {currentCheckIn ? "Edit Meeting" : `New ${terms.System} Meeting`}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Take 5 minutes to connect with your {terms.system}
            </p>
          </div>

          <div className="space-y-6 max-w-2xl">
            {/* Everything in a meeting is optional — make that explicit up top
                so no one feels they have to fill it all in. */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p className="text-sm text-foreground">
                <span className="font-semibold">Every field here is completely optional.</span>{" "}
                Fill in as much or as little as feels right — even just showing up counts.
              </p>
            </div>

            {/* Date */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Date</CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="px-3 py-2 border border-border rounded-md bg-background w-full"
                />
              </CardContent>
            </Card>

            {/* Steps */}
             <CheckInStep1 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} />
             {/* "Notice who's near" participants render INSIDE Step 2 (passed as
                 children) so it's one section, not a redundant card below.
                 Choosing who's near opens the real Set Fronters modal
                 (selectionMode); each participant is the "currently fronting"
                 per-alter panel. */}
             <CheckInStep2 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} alters={alters} groups={groups}>
              <MeetingParticipantsSection
                participants={formData.participants || []}
                onChange={(participants) => setFormData({ ...formData, participants })}
                alters={alters}
              />
            </CheckInStep2>

            <CheckInStep3 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} alters={alters} />
            <CheckInStep4 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} alters={alters}>
              {/* Open dialogue lives inside Invite Sharing now. It renders the
                  REAL System Chat surface (ChatSurface) — same composer,
                  formatting toolbar, and live @mention / -signpost autocomplete
                  as the Chat page. By default history stays on this meeting's
                  record; the in-panel toggle can instead route messages to a
                  real System Chat channel (existing or newly created). */}
              <div data-tour="meetings-dialogue" className="space-y-3">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, open_dialogue: !formData.open_dialogue })}
                  className="w-full flex items-start gap-2.5 text-left"
                >
                  <span className={`mt-0.5 flex-shrink-0 w-9 h-5 rounded-full transition-colors relative ${formData.open_dialogue ? "bg-primary" : "bg-muted-foreground/30"}`}>
                    <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${formData.open_dialogue ? "left-[1.125rem]" : "left-0.5"}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                      Open a dialogue space for this meeting
                    </span>
                    <span className="block text-xs text-muted-foreground leading-snug mt-0.5">
                      A back-and-forth between {terms.alters} using the full {terms.System} Chat composer. Keep it with this meeting, or save it to a {terms.System} Chat channel.
                    </span>
                  </span>
                </button>
                {formData.open_dialogue && (
                  <div className="-mx-6">
                  <MeetingDialogue
                    dialogue={formData.dialogue || []}
                    onChange={(dialogue) => setFormData((prev) => ({ ...prev, dialogue }))}
                    alters={alters}
                    storageMode={formData.dialogue_storage_mode || "meeting"}
                    storageChannelId={formData.dialogue_storage_channel_id || null}
                    onStorageChange={({ mode, channelId }) =>
                      setFormData((prev) => ({
                        ...prev,
                        dialogue_storage_mode: mode,
                        dialogue_storage_channel_id: channelId,
                      }))
                    }
                    onAddParticipants={(ids) => {
                      // Signposting an alter in a dialogue message auto-adds
                      // them to "notice who's near" (the participants list).
                      const existing = normalizeParticipants(formData.participants);
                      const have = new Set(existing.map((p) => p.alter_id));
                      const toAdd = ids.filter((id) => id && !have.has(id));
                      if (toAdd.length === 0) return;
                      const added = toAdd.map((id) => ({ alter_id: id, emotions: [], symptoms: [], note: "" }));
                      setFormData((prev) => ({
                        ...prev,
                        participants: [...normalizeParticipants(prev.participants), ...added],
                      }));
                    }}
                    defaultSpeakerId={(formData.participants || [])[0]?.alter_id || null}
                  />
                  </div>
                )}
              </div>
            </CheckInStep4>
            <CheckInStep5 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} alters={alters} />

            {/* Save Button */}
            <Button
              onClick={handleSave}
              className="w-full gap-2"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="w-4 h-4" />
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Meeting"}
            </Button>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}