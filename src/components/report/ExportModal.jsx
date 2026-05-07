import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, X, Download } from "lucide-react";
import { useState } from "react";

export default function ExportModal({ isOpen, onClose, content, filename, format = "json", blob }) {
  const [copied, setCopied] = useState(false);

  const canShareFiles = !!(navigator.share && navigator.canShare);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // PDF: use Web Share API when available (reliable on Android/iOS PWA),
  // fall back to anchor-click download on desktop where share isn't supported.
  const handleSavePdf = async () => {
    if (!blob) return;

    if (canShareFiles) {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: filename });
          return;
        } catch (err) {
          if (err.name === "AbortError") return;
          // fall through to anchor download
        }
      }
    }

    // Desktop fallback
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const handleShareText = async () => {
    if (!navigator.share) return;
    try {
      if (format === "text") {
        await navigator.share({ title: filename, text: content });
      } else {
        const jsonBlob = new Blob([content], { type: "application/json" });
        const file = new File([jsonBlob], filename, { type: "application/json" });
        if (navigator.canShare?.({ files: [file] })) {
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
          <DialogTitle>
            {format === "pdf" ? "Save PDF Report" : format === "text" ? "Copy Report as Text" : "Copy Backup"}
          </DialogTitle>
        </DialogHeader>

        {format === "pdf" ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 py-6">
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              Your PDF is ready.
              {canShareFiles
                ? " Tap Save / Share to open the share sheet — you can save it to Files, send it, or open it in a PDF app."
                : " Tap Download to save the file."}
            </p>
            <button
              onClick={handleSavePdf}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {canShareFiles ? <Share2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {canShareFiles ? "Save / Share PDF" : "Download PDF"}
            </button>
            {!canShareFiles && (
              <p className="text-xs text-muted-foreground text-center">
                On iOS: tap Download, then use the share icon in the PDF viewer to save to Files.
              </p>
            )}
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
            <X className="w-4 h-4" /> Close
          </Button>
          {format !== "pdf" && navigator.share && (
            <Button variant="outline" onClick={handleShareText} className="gap-2">
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
