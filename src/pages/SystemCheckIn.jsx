import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus } from "lucide-react";
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

  // Open specific check-in if ?id= URL param is present
  const [pendingId] = useState(() => new URLSearchParams(window.location.search).get('id'));
  React.useEffect(() => {
    if (pendingId && checkIns.length > 0 && view === "list") {
      const ci = checkIns.find(c => c.id === pendingId);
      if (ci) { setCurrentCheckIn(ci); setFormData(ci); setView("create"); }
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

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {view === "list" ? (
        <div>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-foreground">System Check-Ins</h1>
            <p className="text-muted-foreground text-sm mt-1">
              A 5-minute guided ritual to connect with your system
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
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });

                return (
                  <Card key={checkIn.id} className="hover:bg-card/80 transition-colors">
                    <CardContent className="py-4 px-4 flex items-center justify-between">
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => handleEdit(checkIn)}
                      >
                        <p className="font-medium text-foreground">{formatted}</p>
                        {checkIn.overall_notes && (
                          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                            {checkIn.overall_notes}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(checkIn)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(checkIn.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView("list")}
            className="mb-6 gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="mb-8">
            <h1 className="font-display text-3xl font-semibold text-foreground">
              {currentCheckIn ? "Edit Check-In" : "New System Check-In"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Take 5 minutes to connect with your system
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
      )}
    </motion.div>
  );
}