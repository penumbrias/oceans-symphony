import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Share2, X, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { shareFile } from "@/lib/shareFile";
import { isNative } from "@/lib/platform";

export default function ExportModal({ isOpen, onClose, content, filename, format = "json", blob }) {
  const [copied, setCopied] = useState(false);

  // Native Capacitor WebView pretends to support Web Share but the
  // canShare({files}) check usually returns false and the anchor-click
  // fallback is a no-op — meaning the previous flow silently failed.
  // On native we always have the @capacitor/share path so the button
  // is always available. On web we keep the original
  // navigator.share-or-anchor detection.
  const canShareFiles = isNative() || !!(navigator.share && navigator.canShare);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // PDF: route through the shared helper so native (Capacitor) and
  // web (Chrome / TWA / desktop) share one delivery path. Failures
  // toast loudly — silent failure on "Save PDF" was exactly the
  // bug reported.
  const handleSavePdf = async () => {
    if (!blob) return;
    const { result, error } = await shareFile({
      blob,
      filename,
      title: filename,
      dialogTitle: "Save PDF report",
    });
    if (result === "failed") {
      toast.error(`Could not save the PDF${error ? `: ${error}` : ""}`);
    } else if (result === "shared" || result === "downloaded") {
      toast.success(result === "shared" ? "PDF ready to share" : "PDF downloaded");
    }
  };

  const handleShareText = async () => {
    if (format === "text") {
      // Plain-text reports go through the simpler text share path.
      if (typeof navigator !== "undefined" && navigator.share) {
        try {
          await navigator.share({ title: filename, text: content });
        } catch (err) {
          if (err?.name !== "AbortError") console.error("Share failed:", err);
        }
      }
      return;
    }
    // JSON: hand it through the same file-share pipeline.
    const jsonBlob = new Blob([content], { type: "application/json" });
    await shareFile({
      blob: jsonBlob,
      filename,
      title: filename,
      dialogTitle: "Save file",
    });
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
