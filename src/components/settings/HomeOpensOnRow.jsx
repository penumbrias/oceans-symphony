import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { writeSettings } from "@/lib/settingsWriter";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";
import { Row, Segmented } from "@/components/shared/SettingRows";

// Which board greets you when Home opens — the home screen or the widget
// board one swipe left. Lives in the home screen's Display options
// (v0.353.0); the setup guide shows the same row.
export default function HomeOpensOnRow() {
  const queryClient = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });
  const record = pickPrimarySystemSettings(rows) || rows[0];
  const value = record?.ui_v2?.homeDefault === "board" ? "board" : "classic";
  const choose = async (v) => {
    if (v === value) return;
    try {
      // Fresh row, one key changed; a row is created only if none exists.
      await writeSettings({ ui_v2: { homeDefault: v } }, { create: true, queryClient });
    } catch (e) {
      toast.error(e?.message || "Couldn't switch");
    }
  };
  return (
    <Row label="Home opens on" hint="The other one is always a swipe away">
      <Segmented label="Home opens on" equal={false} value={value} onChange={choose}
        options={[{ value: "classic", label: "Home screen" }, { value: "board", label: "Widget board" }]} />
    </Row>
  );
}
