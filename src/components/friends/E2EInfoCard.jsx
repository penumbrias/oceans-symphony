import React, { useState } from "react";
import { Lock, ChevronDown, ChevronRight } from "lucide-react";
import { useTerms } from "@/lib/useTerms";

// Plain-language + precise explanation of how friend sharing is protected.
// The top tier reassures without scaring; the "Technical details" tier gives
// the exact crypto + the honest limitations for people who want them.
export default function E2EInfoCard() {
  const terms = useTerms();
  const [showTech, setShowTech] = useState(false);

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 text-sm">
      <div className="flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="min-w-0 space-y-1.5">
          <p className="font-semibold text-foreground">Your sharing is end-to-end encrypted</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            What you share with a friend is scrambled on your device and can only be unscrambled by that friend. The server that
            passes it along can't read it — and neither can we. The key that does the unscrambling stays on this device and is never
            uploaded or included in your backups. For most people that's already private; if you want to be extra certain a friend is
            really who they say, you can compare a short “safety number” with them on their card below.
          </p>

          <button
            type="button"
            onClick={() => setShowTech((v) => !v)}
            aria-expanded={showTech}
            className="flex items-center gap-1 text-xs text-primary hover:underline pt-0.5"
          >
            {showTech ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Technical details
          </button>

          {showTech && (
            <div className="text-xs text-muted-foreground leading-relaxed space-y-2 pt-1 border-t border-border/40 mt-1">
              <p>
                <strong className="text-foreground">How it works.</strong> Each {terms.system} has an ECDH P-256 keypair generated
                on-device with the browser's built-in Web Crypto (no third-party crypto libraries). Each share encrypts the payload
                once with a random AES-256-GCM content key; that content key is then wrapped separately for each recipient using an
                AES-256-GCM key derived from ECDH(your private key, their public key). The relay stores only the ciphertext and the
                per-recipient wrapped keys.
              </p>
              <p>
                <strong className="text-foreground">Keys.</strong> Your public key is published to the relay so friends can fetch it;
                your private key (a JWK) lives only on this device's friend identity, which is deliberately excluded from backups.
              </p>
              <p>
                <strong className="text-foreground">What the relay can see.</strong> The encrypted content is unreadable to it, but it
                still sees metadata — who is friends with whom, when you update, and rough sizes. Encryption protects the contents, not
                the existence of the connection.
              </p>
              <p>
                <strong className="text-foreground">Fronting status is separate.</strong> The member list you share is end-to-end
                encrypted (above). Your live <em>fronting</em> status is handled differently: it stays readable by the relay so it can
                send a notification that names who's {terms.fronting} the moment it changes. If you'd rather the relay not see that, set
                a friend's fronting view to “count only” or “hidden” — then no names are sent.
              </p>
              <p>
                <strong className="text-foreground">Trust.</strong> Public keys are distributed “trust on first use” through the relay,
                so a malicious or compromised relay could in principle substitute a key to eavesdrop. Comparing a friend's safety number
                with them through another channel detects that — without verifying, your privacy depends on the relay being honest.
              </p>
              <p>
                <strong className="text-foreground">Limits, honestly.</strong> Keys are tied to this device with no recovery: a new or
                reset device gets a new key, friends re-fetch it, and shares made to the old key can't be read on the new one. It uses
                static keys (no forward secrecy), so if a private key were ever extracted, previously captured ciphertext could be
                decrypted. And like any app, it can't protect against malware on your own device. These are normal trade-offs for this
                kind of feature — it is a large step up from sending data the server could read.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
