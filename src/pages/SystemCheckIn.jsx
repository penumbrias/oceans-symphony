import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Pencil, Eye, CheckCircle2, Users, MessageSquare } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import CheckInStep1 from "@/components/system-checkin/CheckInStep1";
import CheckInStep2 from "@/components/system-checkin/CheckInStep2";
import CheckInStep3 from "@/components/system-checkin/CheckInStep3";
import CheckInStep4 from "@/components/system-checkin/CheckInStep4";
import CheckInStep5 from "@/components/system-checkin/CheckInStep5";

export default function SystemCheckInPage() {
  const navigate = useNavigate();
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
    if (!formData.date) {
      toast.error("Please select a date");
      return;
    }

    const dataToSave = { ...formData };
    const shouldCreateDiary = formData.create_diary_card;
    delete dataToSave.create_diary_card;

    if (currentCheckIn) {
      updateMutation.mutate(dataToSave);
    } else {
      createMutation.mutate(dataToSave);
    }

    // If step2 has alters_present, update the active fronting session
    const altersPresent = formData.step2_notice?.alters_present || [];
    const alterIds = altersPresent.filter((id) => alters.some((a) => a.id === id));
    if (alterIds.length > 0) {
      try {
        const now = new Date().toISOString();
        const activeSessions = await base44.entities.FrontingSession.filter({ is_active: true });
        // End old session at this moment, then start fresh
        if (activeSessions.length > 0) {
          await base44.entities.FrontingSession.update(activeSessions[0].id, {
            is_active: false,
            end_time: now,
          });
        }
        await base44.entities.FrontingSession.create({
          primary_alter_id: alterIds[0],
          co_fronter_ids: alterIds.slice(1),
          start_time: now,
          is_active: true,
        });
        queryClient.invalidateQueries({ queryKey: ["activeFront"] });
        queryClient.invalidateQueries({ queryKey: ["frontHistory"] });
      } catch (err) {
        console.error("Failed to update front from check-in", err);
      }
    }

    if (shouldCreateDiary) {
      setTimeout(() => { navigate("/diary?create=true"); }, 500);
    }
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
            <h1 className="font-display text-3xl font-semibold text-foreground">{terms.System} Check-In</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {new Date(currentCheckIn.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
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
                  {currentCheckIn.step2_notice.feelings && <p className="text-sm text-foreground mb-1"><span className="text-muted-foreground text-xs">Feelings: </span>{currentCheckIn.step2_notice.feelings}</p>}
                  {currentCheckIn.step2_notice.sensations && <p className="text-sm text-foreground mb-1"><span className="text-muted-foreground text-xs">Sensations: </span>{currentCheckIn.step2_notice.sensations}</p>}
                  {currentCheckIn.step2_notice.notes && <p className="text-sm text-foreground">{currentCheckIn.step2_notice.notes}</p>}
                </CardContent>
              </Card>
            )}
            {/* Step 3 */}
            {currentCheckIn.step3_greet?.notes && (
              <Card>
                <CardContent className="py-4 px-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Step 3 · Greet</p>
                  <p className="text-sm text-foreground">{currentCheckIn.step3_greet.notes}</p>
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
                  {currentCheckIn.step4_share.notes && <p className="text-sm text-foreground">{currentCheckIn.step4_share.notes}</p>}
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
                  {currentCheckIn.step5_closing.notes && <p className="text-sm text-foreground">{currentCheckIn.step5_closing.notes}</p>}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
      {view === "list" ? (
        <div>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-foreground">{terms.System} Check-Ins</h1>
            <p className="text-muted-foreground text-sm mt-1">
              A 5-minute guided ritual to connect with your {terms.system}
            </p>
          </div>
          <Button onClick={handleNewCheckIn} className="gap-2 mb-6">
            <Plus className="w-4 h-4" />
            New Check-In
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
                const date = new Date(checkIn.date);
                const formatted = date.toLocaleDateString("en-US", {
                  weekday: "short", month: "short", day: "numeric", year: "numeric",
                });
                return (
                  <Card key={checkIn.id} className="hover:bg-card/80 transition-colors">
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
              {currentCheckIn ? "Edit Check-In" : `New ${terms.System} Check-In`}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Take 5 minutes to connect with your {terms.system}
            </p>
          </div>

          <div className="space-y-6 max-w-2xl">
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
             <CheckInStep2 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} alters={alters} groups={groups} />
             <CheckInStep3 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} />
             <CheckInStep4 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} />
             <CheckInStep5 data={formData} onChange={(data) => setFormData({ ...formData, ...data })} />

            {/* Next Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Next Step</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="diary-card"
                    checked={formData.create_diary_card || false}
                    onChange={(e) => setFormData({ ...formData, create_diary_card: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="diary-card" className="cursor-pointer text-sm">
                    Complete a daily diary card next
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <Button
              onClick={handleSave}
              className="w-full gap-2"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              <Save className="w-4 h-4" />
              {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Check-In"}
            </Button>
          </div>
        </div>
      ) : null}
    </motion.div>
  );
}