import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, Search, X, CheckSquare } from "lucide-react";
import TaskBulletinCard from "./TaskBulletinCard";
import { Input } from "@/components/ui/input";
import BulletinCard from "./BulletinCard";
import BulletinComposer from "./BulletinComposer";
import MentionAlertBanner from "./MentionAlertBanner";
import { toast } from "sonner";

function QuickTaskAdd({ frontingAlterIds = [], onTaskAdded }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleKeyDown = async (e) => {
    if (e.key !== "Enter" || !text.trim()) return;
    setSaving(true);
    const task = await base44.entities.Task.create({ title: text.trim(), completed: false, priority: "medium" });
    await base44.entities.Bulletin.create({
      content: `[task:${task.id}] ${text.trim()}`,
      author_alter_ids: frontingAlterIds,
      author_alter_id: frontingAlterIds[0] || null,
      reactions: {},
      read_by_alter_ids: frontingAlterIds,
    });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    toast.success("Task added!");
    setText("");
    setSaving(false);
  };

  return (
    <div className="flex items-center gap-2 bg-muted/40 border border-border/40 rounded-xl px-3 py-2 mb-3">
      <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <input
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        placeholder="Quick task… press Enter to add"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
      />
    </div>
  );
}

export default function BulletinBoard({ alters, currentAlterId, frontingAlterIds = [], highlightBulletinId }) {
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(10);
  const bulletinRefs = useRef({});
  const observerTarget = useRef(null);

  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", 100),
  });

  useEffect(() => {
    if (!highlightBulletinId || bulletins.length === 0) return;
    const idx = bulletins.findIndex(b => b.id === highlightBulletinId);
    if (idx !== -1) setVisibleCount(v => Math.max(v, idx + 5));
    setTimeout(() => {
      bulletinRefs.current[highlightBulletinId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [highlightBulletinId, bulletins.length]);

  const filteredBulletins = bulletins.filter(b =>
    !searchQuery || b.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const pinned = filteredBulletins.filter(b => b.is_pinned);
  const filteredRecent = filteredBulletins.filter(b => !b.is_pinned);

  const unreadCount = bulletins.filter(b =>
    currentAlterId && b.mentioned_alter_ids?.includes(currentAlterId) && !b.read_by_alter_ids?.includes(currentAlterId)
  ).length;

  const handleInlineType = (e) => {
    const val = e.target.value;
    if (val.trim()) {
      setComposeInitial(val);
      e.target.value = "";
      setComposing(true);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-foreground text-base">Bulletin Board</h2>
          {unreadCount > 0 && (
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">{unreadCount}</span>
          )}
        </div>
        <button
          onClick={() => { setSearchOpen(p => !p); if (searchOpen) setSearchQuery(""); }}
          className={`p-1.5 rounded-lg transition-colors ${searchOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
        >
          {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      {/* Search (toggle) */}
      {searchOpen && (
        <div className="mb-3">
          <Input
            autoFocus
            placeholder="Search bulletins..."
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setVisibleCount(10); }}
            className="h-8 text-sm"
          />
        </div>
      )}

      {/* Inline compose trigger */}
      {!composing && (
        <input
          className="w-full h-9 px-3 rounded-xl border border-border/50 bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50 mb-3"
          placeholder="Write something…"
          onChange={handleInlineType}
        />
      )}

      {/* Full composer */}
      {composing && (
        <div className="mb-3">
          <BulletinComposer
            alters={alters}
            authorAlterId={currentAlterId}
            frontingAlterIds={frontingAlterIds}
            initialContent={composeInitial}
            onClose={() => { setComposing(false); setComposeInitial(""); }}
          />
        </div>
      )}

      {/* Quick Task Add */}
      <QuickTaskAdd frontingAlterIds={frontingAlterIds} />

      {/* Mention alerts */}
      {currentAlterId && (
        <MentionAlertBanner bulletins={bulletins} currentAlterId={currentAlterId} alters={alters} />
      )}

      {/* Pinned */}
      {pinned.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Pin className="w-3.5 h-3.5 text-primary" />
            <p className="text-xs font-semibold text-primary uppercase tracking-wider">Pinned</p>
          </div>
          <div className="space-y-3">
            {pinned.map(b => (
              <div key={b.id} ref={el => (bulletinRefs.current[b.id] = el)}>
                {b.content?.match(/^\[task:/) ? (
                  <TaskBulletinCard bulletin={b} alters={alters} frontingAlterIds={frontingAlterIds} highlight={highlightBulletinId === b.id} />
                ) : (
                  <BulletinCard bulletin={b} alters={alters} currentAlterId={currentAlterId} frontingAlterIds={frontingAlterIds} canDelete highlight={highlightBulletinId === b.id} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      {filteredRecent.length > 0 && (
        <div>
          {pinned.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Recent</p>}
          <div className="space-y-3">
            {filteredRecent.slice(0, visibleCount).map(b => (
              <div key={b.id} ref={el => (bulletinRefs.current[b.id] = el)}>
                {b.content?.match(/^\[task:/) ? (
                  <TaskBulletinCard bulletin={b} alters={alters} frontingAlterIds={frontingAlterIds} highlight={highlightBulletinId === b.id} />
                ) : (
                  <BulletinCard bulletin={b} alters={alters} currentAlterId={currentAlterId} frontingAlterIds={frontingAlterIds} canDelete highlight={highlightBulletinId === b.id} />
                )}
              </div>
            ))}
          </div>
          {visibleCount < filteredRecent.length && (
            <div ref={observerTarget} className="py-4 text-center">
              <button onClick={() => setVisibleCount(v => v + 10)} className="text-xs text-muted-foreground hover:text-foreground">Load more</button>
            </div>
          )}
        </div>
      )}

      {filteredBulletins.length === 0 && searchQuery && (
        <div className="text-center py-10"><p className="text-muted-foreground text-sm">No bulletins match your search</p></div>
      )}
      {bulletins.length === 0 && !composing && (
        <div className="text-center py-10"><p className="text-muted-foreground text-sm">No bulletins yet. Start writing above!</p></div>
      )}
    </div>
  );
}