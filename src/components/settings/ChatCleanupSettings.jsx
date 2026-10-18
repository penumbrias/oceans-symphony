import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eraser } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/shared/ConfirmDialog";
import { listDeletedChatMessages, purgeDeletedChatMessages } from "@/lib/chatCleanup";

// Settings → "Clean up deleted chat messages".
// Removes the "[message deleted]" placeholders from every chat channel.
export default function ChatCleanupSettings() {
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const { data: dead = [], refetch, isLoading } = useQuery({
    queryKey: ["deletedChatMessages"],
    queryFn: () => listDeletedChatMessages(null),
  });

  const run = async () => {
    const ok = await confirm(
      `Permanently remove ${dead.length} deleted message${dead.length === 1 ? "" : "s"} from all chat channels? Normal messages are not touched. This can't be undone.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const n = await purgeDeletedChatMessages(null);
      qc.invalidateQueries({ queryKey: ["systemChatMessages"] });
      await refetch();
      toast.success(`Removed ${n} deleted message${n === 1 ? "" : "s"}.`);
    } catch (e) {
      toast.error(e?.message || "Cleanup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        When you delete a chat message, a "[message deleted]" placeholder stays behind so replies still make sense.
        This removes those placeholders for good — handy after a messy import.
      </p>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          {isLoading ? "Checking…" : dead.length === 0 ? "No deleted messages to clean up." : `${dead.length} deleted message${dead.length === 1 ? "" : "s"} found`}
        </p>
        <Button size="sm" variant="outline" disabled={busy || isLoading || dead.length === 0} onClick={run}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Eraser className="w-4 h-4 mr-1.5" /> Remove all</>}
        </Button>
      </div>
    </div>
  );
}
