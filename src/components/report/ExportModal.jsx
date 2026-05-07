import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, X, Download } from "lucide-react";
import { useState } from "react";

export default function ExportModal({ isOpen, onClose, content, filename, format = "json", blobUrl }) {
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
      if (format === "pdf" && blobUrl) {
        const blob = await fetch(blobUrl).then(r => r.blob());
        const file = new File([blob], filename, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: filename });
        }
      } else if (format === "text") {
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

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {format === "pdf" ? "Download PDF Report" : format === "text" ? "Copy Report as Text" : "Copy Backup"}
          </DialogTitle>
        </DialogHeader>

        {format === "pdf" ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 py-6">
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Your PDF is ready. Tap <strong>Download PDF</strong> to save it, or use <strong>Share</strong> to send it directly to another app.
            </p>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <p className="text-xs text-muted-foreground text-center">
              On iOS: tap Download, then use the share icon in the PDF viewer to save to Files.
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground flex-shrink-0">
              {format === "text"
                ? "Copy this text and paste it into an email, notes app, or anywhere you like."
                : "Copy this JSON and paste it into a notes app or email to save your backup."}
            </p>
            <textarea
              className="flex-1 min-h-[180px] p-3 rounded-lg border border-input bg-transparent text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-y-auto"
              value={content}
              readOnly
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose} className="gap-2">
            <X className="w-4 h-4" /> {format === "pdf" ? "Close" : "Close"}
          </Button>
          {navigator.share && (
            <Button variant="outline" onClick={handleShare} className="gap-2">
              <Share2 className="w-4 h-4" /> Share
            </Button>
          )}
          {format !== "pdf" && (
            <Button onClick={handleCopy} className="gap-2">
              <Copy className="w-4 h-4" />
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
