import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { TIMEZONE_GROUPS, ALL_TIMEZONES } from "@/lib/timezoneHelpers";
import { ChevronRight } from "lucide-react";

export default function TimezoneSettings() {
  const queryClient = useQueryClient();
  const [showOverride, setShowOverride] = useState(false);

  const { data: settings = [] } = useQuery({
    queryKey: ["systemSettings"],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  const setting = settings[0];
  const currentTz = setting?.timezone || "UTC";

  // Flatten grouped timezones for select options
  const tzOptions = useMemo(
    () =>
      Object.entries(TIMEZONE_GROUPS).flatMap(([group, zones]) =>
        zones.map((tz) => ({ value: tz, label: tz, group }))
      ),
    []
  );

  const handleChange = async (tz) => {
    if (!setting) return;
    await base44.entities.SystemSettings.update(setting.id, { timezone: tz });
    queryClient.invalidateQueries({ queryKey: ["systemSettings"] });
    setShowOverride(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Timezone</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Used to fire reminders at the right local time. Auto-detected from your device.
        </p>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
          <div className="flex-1">
            <p className="text-sm font-medium">Your timezone</p>
            <p className="text-xs text-muted-foreground">{currentTz}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOverride(!showOverride)}
            className="gap-1"
          >
            Change <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {showOverride && (
          <div className="mt-3">
            <SearchableSelect
              options={tzOptions}
              value={currentTz}
              onChange={handleChange}
              placeholder="Search timezone..."
              maxHeight={300}
              formatGroupLabel={(group) => (
                <span className="text-xs font-semibold text-muted-foreground uppercase">
                  {group}
                </span>
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}