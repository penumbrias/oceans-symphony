import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";

export default function ExportModal({ isOpen, onClose, content, filename, format = "json" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return;
    try {
      if (format === "text") {
        await navigator.share({ title: filename, text: content });
      } else {
        const blob = new Blob([content], { type: "application/json" });
        const file = new File([blob], filename, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Share failed:", err);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{format === "text" ? "Copy Report as Text" : "Copy Backup"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {format === "text"
              ? "Copy this text and paste it into an email, notes app, or anywhere you like."
              : "Copy this JSON and paste it into a notes app or email to save your backup."}
          </p>

          <textarea
            className="flex-1 p-3 rounded-lg border border-input bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            value={content}
            readOnly
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="w-4 h-4" /> Close
          </Button>
          {navigator.share && (
            <Button variant="outline" onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          )}
          <Button onClick={handleCopy} className="gap-2">
            <Copy className="w-4 h-4" />
            {copied ? "Copied!" : "Copy to Clipboard"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}