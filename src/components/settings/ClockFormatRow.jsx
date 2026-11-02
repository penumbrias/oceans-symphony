// 12-hour or 24-hour clock for every time the app shows (from the Apeiron
// Zetta fork by ShineSpark330). Stored on this device; rides backups through
// BACKUP_LS_KEYS like the other display preferences.
import { Row, Segmented } from "@/components/shared/SettingRows";
import { useTimeFormat, setTimeFormat } from "@/lib/timeFormat";

export default function ClockFormatRow() {
  const format = useTimeFormat();
  const sample = new Date(2026, 0, 1, 15, 30);
  return (
    <Row label="Clock" hint={`Times read like ${sample.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: format !== "24" })}`}>
      <Segmented label="Clock" equal={false} value={format} onChange={setTimeFormat}
        options={[{ value: "12", label: "12-hour" }, { value: "24", label: "24-hour" }]} />
    </Row>
  );
}
