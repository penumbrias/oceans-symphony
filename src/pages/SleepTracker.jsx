import React, { useState, useMemo } from "react";
import { confirm } from "@/components/shared/ConfirmDialog";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, AlarmClock, Cloud, ZapOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, formatDistanceToNow, subDays } from "date-fns";
import SleepLogModal from "@/components/sleep/SleepLogModal";
import SleepEditModal from "@/components/sleep/SleepEditModal";
import SleepEndModal from "@/components/sleep/SleepEndModal";
import { startSleep } from "@/lib/sleepEntry";
import { clockPattern } from "@/lib/timeFormat";
import RichText from "@/components/shared/RichText";
import { useUiLook } from "@/lib/uiLook";
import "@/styles/pixel/care.css";

// Pixel look: a night's bar colour by how long it was (SleepPhone).
const nightColor = (h) => (h >= 6.5 ? "#8fb8e0" : h >= 5 ? "#e3c16f" : "#ef8a6a");
const hm = (hours) => {
  const mins = Math.max(0, Math.round(hours * 60));
  return `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
};

export default function SleepTracker() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingSleep, setEditingSleep] = useState(null);
  const [endingSleep, setEndingSleep] = useState(null);
  const [startingNow, setStartingNow] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const { data: sleepRecords = [] } = useQuery({
    queryKey: ["sleep", format(currentDate, "yyyy-MM")],
    queryFn: () => base44.entities.Sleep.list(),
  });

  // EVERY render-time date read goes through this. A record missing
  // `date` or `bedtime` (older widget rows, imports) must degrade to a
  // dash — parseISO(undefined) THROWS, and one such row used to crash
  // the whole page, locking the user out of the data that could fix it.
  const safeDate = (iso, fmt, fallback = "—") => {
    if (!iso) return fallback;
    const d = parseISO(iso);
    return isNaN(d) ? fallback : format(d, fmt);
  };

  const getSleepForDate = (date) => {
    // Legacy/widget rows may lack `date` — fall back to the bedtime so
    // they still land on a day instead of vanishing (and parseISO of
    // undefined never gets to throw on render).
    return sleepRecords.find((s) => {
      const d = s.date || s.bedtime;
      if (!d) return false;
      const parsed = parseISO(d);
      if (isNaN(parsed)) return false;
      return format(parsed, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
    });
  };

  const calculateDuration = (sleep) => {
    if (!sleep.bedtime || !sleep.wake_time) return 0;
    const bedTime = parseISO(sleep.bedtime);
    const wakeTime = parseISO(sleep.wake_time);
    const hours = (wakeTime - bedTime) / (1000 * 60 * 60);
    return Number.isFinite(hours) ? hours : 0; // corrupted timestamps read as 0, not "NaN hours"
  };

  // An "in-progress" sleep is the record created by Start sleep —
  // bedtime is set but wake_time is null (the user hasn't ended the
  // log yet). The Start/End button switches mode based on whether
  // one exists. We pick the most recent one if there's somehow more
  // than one (shouldn't happen in normal use; defensive against
  // double-tap on Start).
  const inProgressSleep = useMemo(() => {
    return [...sleepRecords]
      .filter((s) => s.bedtime && !s.wake_time)
      .sort((a, b) => parseISO(b.bedtime) - parseISO(a.bedtime))[0] || null;
  }, [sleepRecords]);

  const handleStartSleep = async () => {
    if (inProgressSleep) {
      // Defensive — shouldn't be reachable when a sleep is in progress
      // because the button changes label.
      return;
    }
    setStartingNow(true);
    try {
      // wake_time stays empty until the night is ended via SleepEndModal.
      await startSleep();
      queryClient.invalidateQueries({ queryKey: ["sleep"] });
      toast.success("💤 Sleep started. Tap End sleep when you wake up.");
    } catch (err) {
      toast.error(err.message || "Failed to start sleep log");
    } finally {
      setStartingNow(false);
    }
  };

  const handleEndSleep = () => {
    if (!inProgressSleep) return;
    setEndingSleep(inProgressSleep);
  };

  const handleEndSaved = () => {
    setEndingSleep(null);
    queryClient.invalidateQueries({ queryKey: ["sleep"] });
    queryClient.invalidateQueries({ queryKey: ["activities"] });
    toast.success("✅ Sleep logged!");
  };

  const handleCancelInProgress = async () => {
    if (!inProgressSleep) return;
    if (!(await confirm("Discard this in-progress sleep log? Bedtime will be removed; no record will be saved."))) return;
    try {
      await base44.entities.Sleep.delete(inProgressSleep.id);
      queryClient.invalidateQueries({ queryKey: ["sleep"] });
      toast.success("Sleep log discarded");
    } catch (err) {
      toast.error(err.message || "Failed to discard sleep log");
    }
  };

  const handleDelete = async (sleepId) => {
    if (!(await confirm({ title: "Delete this sleep record?", body: "Its mirrored Sleep activity is removed too. A linked dream journal entry stays in Journals.", confirmLabel: "Delete", destructive: true }))) return;
    try {
      // Cascade-delete the linked "Sleep" Activity so the tracker's week
      // grid doesn't keep an orphaned bar after the underlying record is gone.
      // Per user-data-preservation rules, the linked dream JournalEntry is
      // NOT auto-deleted — journal content is user-edited and outlives the
      // originating sleep record. We surface a notice so the user knows
      // where to find it.
      const sleep = sleepRecords.find(s => s.id === sleepId);
      await base44.entities.Sleep.delete(sleepId);
      if (sleep?.linked_activity_id) {
        try { await base44.entities.Activity.delete(sleep.linked_activity_id); } catch {}
        queryClient.invalidateQueries({ queryKey: ["activities"] });
      }
      queryClient.invalidateQueries({ queryKey: ["sleep"] });
      if (sleep?.journal_entry_id) {
        toast.success("🗑 Sleep record deleted. The linked dream journal entry remains in your Journals — delete it there if you also want to remove it.");
      } else {
        toast.success("🗑 Sleep record deleted");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete sleep record");
    }
  };

  const handleAddSleep = (date) => {
    setSelectedDate(date);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    queryClient.invalidateQueries({ queryKey: ["sleep"] });
    setIsModalOpen(false);
    toast.success("✅ Sleep logged!");
  };

  const averageQuality =
    sleepRecords.length > 0
      ? (sleepRecords.reduce((sum, s) => sum + (s.quality || 0), 0) /
          sleepRecords.length).toFixed(1)
      : 0;

  const averageDuration =
    sleepRecords.length > 0
      ? (sleepRecords.reduce((sum, s) => sum + calculateDuration(s), 0) /
          sleepRecords.length).toFixed(1)
      : 0;

  const pixel = useUiLook() === "pixel";
  if (pixel) {
    const today = new Date();
    const nights = Array.from({ length: 7 }, (_, i) => subDays(today, 6 - i)).map((d) => {
      const sl = getSleepForDate(d);
      const h = sl ? calculateDuration(sl) : 0;
      return { d, sl, h, live: !!sl && !sl.wake_time };
    });
    const done = nights.filter((n) => n.h > 0);
    const avg7 = done.length ? done.reduce((a, n) => a + n.h, 0) / done.length : 0;
    const sorted = [...sleepRecords].sort((a, b) => parseISO(b.bedtime || "") - parseISO(a.bedtime || ""));
    const sinceHours = inProgressSleep?.bedtime ? (Date.now() - parseISO(inProgressSleep.bedtime)) / 3600000 : 0;
    return (
      <div className="px-cr" data-tour="sleep-page">
        <div className="px-cr-head">
          <h1 className="px-cr-title">Sleep</h1>
          <button type="button" className="px-cr-btn px-cr-icon" aria-label="Add past night" title="Add past night"
            onClick={() => handleAddSleep(new Date())}><Plus className="w-4 h-4" /></button>
        </div>
        <div className="px-cr-grid">
          <div className="px-cr-col">
            <section className="px-cr-pn" data-tour="sleep-start">
              {inProgressSleep ? (
                <>
                  <h2 className="px-cr-ttl"><span>Sleeping now</span><span className="px-cr-pf" style={{ color: "var(--color-primary)" }}>in progress</span></h2>
                  <div className="px-sl-now">
                    <span>Since {safeDate(inProgressSleep.bedtime, clockPattern("h:mm a"))} · {hm(sinceHours)} min</span>
                    {!endingSleep && <button type="button" className="px-cr-btn on" onClick={handleEndSleep}>End sleep</button>}
                  </div>
                  <p className="px-sl-sub px-cr-mut" style={{ margin: 0 }}>
                    Started by mistake? <button type="button" className="px-cr-link" onClick={handleCancelInProgress}>Discard it</button>
                  </p>
                </>
              ) : (
                <>
                  <h2 className="px-cr-ttl"><span>Tonight</span></h2>
                  <div className="px-sl-now">
                    <span className="px-cr-mut">Going to bed? Start it now and end it when you wake.</span>
                    <button type="button" className="px-cr-btn on" onClick={handleStartSleep} disabled={startingNow}>
                      {startingNow ? "Starting…" : "Start sleep"}
                    </button>
                  </div>
                  <p className="px-sl-sub" style={{ margin: 0 }}>
                    <button type="button" className="px-cr-link" onClick={() => handleAddSleep(new Date())}>Add past night</button>
                  </p>
                </>
              )}
            </section>
            <section className="px-cr-pn">
              <h2 className="px-cr-ttl"><span>Last 7 nights</span>{avg7 > 0 && <span className="px-cr-mut">avg {hm(avg7)}</span>}</h2>
              <div className="px-sl-bars">
                {nights.map((n) => {
                  const label = format(n.d, "EEEEEE");
                  const height = n.live ? 30 : Math.min(100, Math.round(n.h * 10));
                  const style = { height: n.sl ? height : 4, background: n.live ? "var(--px-hi)" : n.sl ? nightColor(n.h) : "var(--px-sunk)" };
                  const title = `${format(n.d, "EEEE")}: ${n.live ? "in progress" : n.sl ? hm(n.h) : "nothing logged"}`;
                  return n.sl && !n.live ? (
                    <button key={label + n.d.getDate()} type="button" className="px-sl-bar" title={title} aria-label={`${title}. Edit`}
                      onClick={() => setEditingSleep(n.sl)}>
                      <span style={style} /><span>{label}</span>
                    </button>
                  ) : (
                    <span key={label + n.d.getDate()} className="px-sl-bar" title={title}><span style={style} /><span>{label}</span></span>
                  );
                })}
              </div>
              <div className="px-sl-stats">
                <span><b>{sleepRecords.length}</b> nights logged</span>
                <span>avg <b>{averageDuration}h</b></span>
                <span>quality <b>{averageQuality}</b>/10</span>
              </div>
            </section>
            <SleepEndModal inline isOpen={!!endingSleep} sleep={endingSleep}
              onClose={() => setEndingSleep(null)} onSave={handleEndSaved} />
          </div>
          <section className="px-cr-pn" aria-label="Recent nights">
            <h2 className="px-cr-ttl"><span>Recent nights</span><span className="px-cr-mut">{sleepRecords.length}</span></h2>
            {sorted.length === 0 ? (
              <p className="px-cr-empty">No sleep records yet. Log your first night to start tracking patterns.</p>
            ) : (
              <ul className="px-sl-list">
                {sorted.map((sleep) => {
                  const n = sleep.interruption_count || sleep.interruption_times?.length;
                  return (
                    <li key={sleep.id} className="px-sl-rec">
                      <div className="px-sl-rec-main">
                        <span className="px-sl-rec-day">{safeDate(sleep.date || sleep.bedtime, "EEE d MMM")}</span>
                        <span className="px-sl-rec-meta">
                          <span>{safeDate(sleep.bedtime, clockPattern("h:mm a"))} – {sleep.wake_time ? safeDate(sleep.wake_time, clockPattern("h:mm a")) : "in progress"}</span>
                          {sleep.wake_time && <b>{hm(calculateDuration(sleep))}</b>}
                          {sleep.quality ? <span>quality <b>{sleep.quality}</b>/10</span> : null}
                        </span>
                        {(sleep.is_interrupted || sleep.dreamed || sleep.had_nightmare) && (
                          <span className="px-sl-tags">
                            {sleep.is_interrupted && <span>{n ? `Interrupted ×${n}` : "Interrupted"}</span>}
                            {sleep.dreamed && !sleep.had_nightmare && <span>Dreamed</span>}
                            {sleep.had_nightmare && <span>Nightmare</span>}
                          </span>
                        )}
                        {sleep.is_interrupted && sleep.interruption_times?.length > 0 && (
                          <span className="px-cr-mut" style={{ fontSize: 12 }}>Woke at: {sleep.interruption_times.join(", ")}</span>
                        )}
                        {sleep.notes && <span className="px-cr-mut"><RichText content={sleep.notes} /></span>}
                      </div>
                      <div className="px-sl-acts">
                        <button type="button" className="px-cr-btn" aria-label="Edit" title="Edit" onClick={() => setEditingSleep(sleep)}><Pencil className="w-4 h-4" /></button>
                        <button type="button" className="px-cr-btn" aria-label="Delete" title="Delete" onClick={() => handleDelete(sleep.id)}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <SleepLogModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleSave} selectedDate={selectedDate} />
        {editingSleep && (
          <SleepEditModal sleep={editingSleep} onClose={() => setEditingSleep(null)}
            onSave={() => { queryClient.invalidateQueries({ queryKey: ["sleep"] }); setEditingSleep(null); }} />
        )}
      </div>
    );
  }

  return (
    <div className="py-6">
      <div className="max-w-4xl mx-auto" data-tour="sleep-page">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Sleep Tracker</h1>
          <p className="text-muted-foreground">Track your sleep patterns and quality</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {sleepRecords.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  Records this month
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {averageDuration}h
                </div>
                <div className="text-xs text-muted-foreground">
                  Average duration
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {averageQuality}
                </div>
                <div className="text-xs text-muted-foreground">
                  Average quality (1-10)
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 space-y-2" data-tour="sleep-start">
              {/* Start sleep / End sleep — primary one-tap flow for
                  logging tonight's sleep as it happens. When no log
                  is in progress, the button starts one (creates a
                  Sleep record with bedtime=now, wake_time=null);
                  when a log IS in progress, it opens the End modal
                  so the user can stamp wake time + optional quality
                  / dreams / notes. The retroactive "+ New Record"
                  flow stays available below for "I forgot to start
                  it" cases. */}
              {inProgressSleep ? (
                <>
                  <Button
                    onClick={handleEndSleep}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    <AlarmClock className="w-4 h-4 mr-2" />
                    End sleep
                  </Button>
                  <p className="text-[0.6875rem] text-center text-muted-foreground">
                    In progress since {safeDate(inProgressSleep.bedtime, clockPattern("h:mm a"))}
                    {" · "}
                    <button
                      type="button"
                      onClick={handleCancelInProgress}
                      className="underline hover:text-foreground"
                    >
                      discard
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <Button
                    onClick={handleStartSleep}
                    disabled={startingNow}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    <AlarmClock className="w-4 h-4 mr-2" />
                    {startingNow ? "Starting…" : "Start sleep"}
                  </Button>
                  <Button
                    onClick={() => handleAddSleep(new Date())}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add past night
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sleep records list */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Recent Records</p>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          {sleepRecords.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <div className="text-4xl mb-2">😴</div>
              <p className="text-sm font-medium text-foreground mb-1">No sleep records yet</p>
              <p className="text-xs text-muted-foreground">Log your first night to start tracking patterns.</p>
            </div>
          ) : (
            sleepRecords
              .sort(
                (a, b) =>
                  parseISO(b.bedtime || "") - parseISO(a.bedtime || "")
              )
              .map((sleep) => {
                const duration = calculateDuration(sleep);
                return (
                  <Card key={sleep.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="font-semibold text-foreground">
                            {safeDate(sleep.date || sleep.bedtime, "EEEE, MMMM d")}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {safeDate(sleep.bedtime, clockPattern("h:mm a"))} -{" "}
                            {sleep.wake_time
                              ? safeDate(sleep.wake_time, clockPattern("h:mm a"))
                              : <span className="italic text-primary">in progress</span>}
                          </div>
                          <div className="text-sm mt-2 flex gap-4">
                            {sleep.wake_time ? (
                              <span className="text-primary font-medium">
                                {duration.toFixed(1)} hours
                              </span>
                            ) : (
                              <span className="text-primary font-medium italic">
                                {sleep.bedtime && !isNaN(parseISO(sleep.bedtime))
                                  ? `${formatDistanceToNow(parseISO(sleep.bedtime), { addSuffix: false })} so far`
                                  : "—"}
                              </span>
                            )}
                            {sleep.quality && (
                              <span className="text-accent-foreground">
                                Quality: {sleep.quality}/10
                              </span>
                            )}
                          </div>
                          {(sleep.is_interrupted || sleep.dreamed || sleep.had_nightmare) && (
                            <div className="flex gap-1.5 mt-2 flex-wrap">
                              {sleep.is_interrupted && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20">
                                  <AlarmClock className="w-3 h-3" />
                                  {(() => { const n = sleep.interruption_count || sleep.interruption_times?.length; return n ? `Interrupted ×${n}` : "Interrupted"; })()}
                                </span>
                              )}
                              {sleep.dreamed && !sleep.had_nightmare && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                  <Cloud className="w-3 h-3" /> Dreamed
                                </span>
                              )}
                              {sleep.had_nightmare && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                                  <ZapOff className="w-3 h-3" /> Nightmare
                                </span>
                              )}
                            </div>
                          )}
                          {sleep.is_interrupted && sleep.interruption_times?.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Woke at: {sleep.interruption_times.join(", ")}
                            </p>
                          )}
                          {sleep.notes && (
                            <p className="text-sm text-muted-foreground mt-2">
                              <RichText content={sleep.notes} />
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingSleep(sleep)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(sleep.id)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
          )}
        </div>
      </div>

      <SleepLogModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSave}
        selectedDate={selectedDate}
      />

      {editingSleep && (
        <SleepEditModal
          sleep={editingSleep}
          onClose={() => setEditingSleep(null)}
          onSave={() => {
            queryClient.invalidateQueries({ queryKey: ["sleep"] });
            setEditingSleep(null);
          }}
        />
      )}

      <SleepEndModal
        isOpen={!!endingSleep}
        sleep={endingSleep}
        onClose={() => setEndingSleep(null)}
        onSave={handleEndSaved}
      />
    </div>
  );
}