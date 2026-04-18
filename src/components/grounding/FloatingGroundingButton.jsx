import { useState } from "react";
import { X } from "lucide-react";
import Grounding from "@/pages/Grounding";

export default function FloatingGroundingButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-card border border-border/80 shadow-lg flex items-center justify-center hover:border-primary/30 hover:scale-105 transition-all"
        title="Grounding & support"
        aria-label="Open grounding support"
      >
        <span className="text-xl select-none">🫧</span>
      </button>

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={() => setOpen(false)}>
          <div
            className="bg-background border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/40">
              <p className="text-sm font-semibold text-foreground">Support</p>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="pb-6">
              <Grounding />
            </div>
          </div>
        </div>
      )}
    </>
  );
}