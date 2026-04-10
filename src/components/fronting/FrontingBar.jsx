import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { User, Star, Plus, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import SetFrontModal from "./SetFrontModal";
import { useTerms } from "@/lib/useTerms";
import { normalizeSessions } from "@/lib/frontingUtils";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function FronterAvatar({ alter, isPrimary, size = "md" }) {
  const bg = alter?.color || null;
  const text = bg ? getContrastColor(bg) : null;
  const sz = size === "lg" ? "w-14 h-14" : "w-10 h-10";
  const iconSz = size === "lg" ? "w-7 h-7" : "w-5 h-5";

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${sz} rounded-2xl overflow-hidden flex items-center justify-center border-2`}
        style={{
          backgroundColor: bg || "hsl(var(--muted))",
          borderColor: isPrimary ? "hsl(var(--primary))" : "hsl(var(--border))"
        }}>
        
        {alter?.avatar_url ?
        <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" /> :

        <User className={iconSz} style={{ color: text || "hsl(var(--muted-foreground))" }} />
        }
      </div>
      {isPrimary &&
      <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-background flex items-center justify-center border border-border">
          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
        </div>
      }
    </div>);

}

export default function FrontingBar({ alters }) {
  const [showModal, setShowModal] = useState(false);
  const terms = useTerms();

  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
    refetchInterval: 30000
  });

  const session = activeSessions[0] || null;
  const allAltersById = Object.fromEntries((alters || []).map((a) => [a.id, a]));

const activeSessionsList = activeSessions; // already filtered by is_active in the query
const normalized = normalizeSessions(activeSessionsList);
const activeAlterIds = [...new Set(normalized.map(s => s.alterId))];
const primaryAlter = activeAlterIds[0] ? allAltersById[activeAlterIds[0]] : null;
const coFronters = activeAlterIds.slice(1).map(id => allAltersById[id]).filter(Boolean);

  const startedAt = session?.start_time ? new Date(session.start_time) : null;
  const duration = startedAt ?
  (() => {
    const diff = Date.now() - startedAt.getTime();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor(diff % 3600000 / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })() :
  null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }} className="bg-card mb-6 px-4 py-1 rounded-2xl border border-border/50">

        
        <div className="pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${session ? "bg-green-500 animate-pulse" : "bg-muted-foreground/30"}`} />
            <span className="text-sm font-medium text-foreground">
              {session ? `Currently ${terms.Fronting}` : `No Active ${terms.Front}`}
            </span>
            {duration && <span className="text-xs text-muted-foreground">· {duration}</span>}
          </div>
          <Button
            size="sm"
            variant={session ? "outline" : "default"}
            onClick={() => setShowModal(true)} className="bg-background mt-1 pr-2 pl-2 text-xs font-medium rounded-md inline-flex items-center justify-center whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground h-8 gap-1.5">
            
            
            {session ?
            <><Pencil className="w-3.5 h-3.5" /> Edit {terms.Front}</> :

            <><Plus className="w-3.5 h-3.5" /> Set {terms.Front}</>
            }
          </Button>
        </div>

        {session ?
        <div className="mb-1 pb-1 flex items-center gap-3 flex-wrap">
            {primaryAlter &&
          <div className="flex items-center gap-2.5">
                <FronterAvatar alter={primaryAlter} isPrimary={true} size="lg" />
                <div>
                  <p className="font-semibold text-foreground">{primaryAlter.name}</p>
                  {primaryAlter.pronouns &&
              <p className="text-xs text-muted-foreground">{primaryAlter.pronouns}</p>
              }
                  <p className="text-xs text-amber-500 font-medium">Primary {terms.alter}</p>
                </div>
              </div>
          }

            {coFronters.length > 0 &&
          <>
                <div className="w-px h-10 bg-border/50 mx-1" />
                <div className="flex items-center gap-2 flex-wrap">
                  {coFronters.map((a) =>
              <div key={a.id} className="flex items-center gap-1.5">
                      <FronterAvatar alter={a} isPrimary={false} />
                      <div>
                        <p className="text-sm font-medium text-foreground">{a.name}</p>
                        {a.pronouns && <p className="text-xs text-muted-foreground">{a.pronouns}</p>}
                      </div>
                    </div>
              )}
                </div>
              </>
          }
          </div> :

        <p className="text-sm text-muted-foreground">
            No one is currently {terms.fronting}. Set a {terms.front} to track who's out.
          </p>
        }
      </motion.div>

      <SetFrontModal
        open={showModal}
        onClose={() => setShowModal(false)}
        alters={alters || []}
        currentSession={session} />
      
    </>);

}