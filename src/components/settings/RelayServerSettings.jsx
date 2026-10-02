import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Server, Check, X, Loader2, AlertTriangle } from "lucide-react";
import { DEFAULT_API_HOST, getApiHostOverride, setApiHost } from "@/lib/apiBase";
import { useTerms } from "@/lib/useTerms";

// Point Friends, reminders and web push at a relay you run yourself.
//
// The relay is a dumb router: it stores friend links and forwards
// end-to-end encrypted payloads. Your private key never reaches it. Self
// hosting changes WHO runs that router, not what it can see.
//
// The load-bearing warning is that identities are per-relay. A friend code
// is minted by, and only exists on, the relay that issued it — so moving
// relays means a new identity and re-adding friends, and everyone you
// share with has to be on the same relay. That is a property of the
// design, not a limitation to be worked around; see docs/self-hosting.md.

const normalise = (raw) => String(raw || "").trim().replace(/\/+$/, "");

export default function RelayServerSettings() {
  const t = useTerms();
  const saved = getApiHostOverride();
  const [value, setValue] = useState(saved);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }

  const active = saved || DEFAULT_API_HOST;
  const isCustom = !!saved;
  const dirty = normalise(value) !== saved;

  const testConnection = async (host) => {
    const target = normalise(host);
    if (!target) return { ok: false, text: "Enter an address first." };
    if (!/^https:\/\//i.test(target)) {
      return {
        ok: false,
        text: "Must start with https:// — the app is only allowed to connect over HTTPS.",
      };
    }
    try {
      const res = await fetch(`${target}/health`, { method: "GET" });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) return { ok: true, text: "Reachable, and its database is up." };
      if (res.ok) return { ok: false, text: "Answered, but not like an Oceans Symphony relay." };
      if (body?.redis === "down") return { ok: false, text: "Relay is up but its database is down." };
      return { ok: false, text: `Relay answered ${res.status}.` };
    } catch (e) {
      return { ok: false, text: `Couldn't reach it: ${e?.message || "network error"}.` };
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    setResult(await testConnection(value));
    setTesting(false);
  };

  const handleSave = async () => {
    const target = normalise(value);
    if (target) {
      setTesting(true);
      const check = await testConnection(target);
      setTesting(false);
      setResult(check);
      // A relay that can't be reached is almost always a typo or a server
      // that isn't running. Saving it would leave Friends silently broken
      // until they came back here, so make them confirm.
      if (!check.ok && !window.confirm(
        `That address didn't respond correctly:\n\n${check.text}\n\nSave it anyway?`
      )) return;
    }
    setApiHost(target);
    toast.success(
      target ? "Relay saved — restart the app to use it." : "Back to the default relay — restart the app.",
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2">Friends &amp; sync server</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Friends, {t.fronting} sharing, reminder delivery and push all go through a small relay
          server. You can run your own instead of ours — see <code>server/</code> in the
          repository.
        </p>

        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card mb-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Server className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{isCustom ? "Your own relay" : "Default relay"}</p>
            <p className="text-xs text-muted-foreground truncate" title={active}>{active}</p>
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 mb-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs space-y-1.5">
              <p className="font-medium">Your friend code belongs to one relay.</p>
              <p className="text-muted-foreground">
                Codes are issued by the relay that made them. Switching gives you a new identity
                there, and you and your friends must all be on the same relay to see each other.
                Your existing friends aren&apos;t deleted — they&apos;re still on the old relay if
                you switch back.
              </p>
              <p className="text-muted-foreground">
                Android push is the one thing that can&apos;t follow you: it&apos;s tied to this
                build of the app. Web push works on your own relay.
              </p>
            </div>
          </div>
        </div>

        <label className="text-xs font-medium block mb-1" htmlFor="relay-host">Relay address</label>
        <Input
          id="relay-host"
          value={value}
          onChange={(e) => { setValue(e.target.value); setResult(null); }}
          placeholder={DEFAULT_API_HOST}
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          inputMode="url"
        />

        {result && (
          <div className={`flex items-start gap-2 mt-2 text-xs ${result.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
            {result.ok ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            <span>{result.text}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          <Button size="sm" variant="outline" onClick={handleTest} disabled={testing || !normalise(value)}>
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Test connection
          </Button>
          <Button size="sm" onClick={handleSave} disabled={testing || !dirty}>
            Save
          </Button>
          {isCustom && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setValue(""); setResult(null); setApiHost(""); toast.success("Back to the default relay — restart the app."); }}
              disabled={testing}
            >
              Use default
            </Button>
          )}
        </div>

        <p className="text-[0.6875rem] text-muted-foreground mt-2">
          Takes effect when the app restarts.
        </p>
      </div>
    </div>
  );
}
