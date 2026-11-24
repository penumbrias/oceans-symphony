// Settings → Look → Try the new house (step 2.1). A per-device switch:
// the same records and the same save paths, only the frame around the pages
// changes. Kept in BACKUP_LS_KEYS, so it survives a cache clear and Preview
// Mode leaves it alone.

import React from "react";
import { Group, SwitchRow } from "@/components/shared/SettingRows";
import { setHouseSwitch, useHouseSwitch } from "@/lib/houseSwitch";

export default function NewHouseSettings() {
  const on = useHouseSwitch();
  return (
    <Group title="The new house" first>
      <SwitchRow
        label="Try the new house"
        hint="A desktop and tablet layout with menus along the top, a side panel and a status bar. Your data stays exactly the same. Only this device changes."
        checked={on}
        onChange={(v) => setHouseSwitch(v)}
      />
      <p className="text-xs text-muted-foreground px-1 pt-2">
        Phones keep the current look for now. To switch back from inside the new house, open the More menu (⋯) at the top right and choose “Use the old house”.
      </p>
    </Group>
  );
}
