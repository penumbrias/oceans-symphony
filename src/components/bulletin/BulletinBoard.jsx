import React, { useState, useRef, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin, Search, X, CheckSquare, MessageCircle } from "lucide-react";
import TaskBulletinCard from "./TaskBulletinCard";
import { Input } from "@/components/ui/input";
import BulletinCard from "./BulletinCard";
import BulletinComposer from "./BulletinComposer";
import QuickPlanComposer from "./QuickPlanComposer";
import MentionAlertBanner from "./MentionAlertBanner";
import PinnedPollCard from "./PinnedPollCard";
import UpcomingPlans from "@/components/dashboard/UpcomingPlans";
import { toast } from "sonner";
import { getBulletinBatchSize } from "@/lib/bulletinLimit";

function QuickTaskAdd({ frontingAlterIds = [], onTaskAdded }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleKeyDown = async (e) => {
    if (e.key !== "Enter" || !text.trim()) return;
    setSaving(true);
    // Same defensive live-fetch pattern as BulletinComposer — a quick
    // task added right after page load shouldn't be attributed to
    // "System" while the parent query is still hydrating.
    let authorIds = frontingAlterIds;
    if (authorIds.length === 0) {
      try {
        const active = await base44.entities.FrontingSession.filter({ is_active: true });
        const liveIds = active.map(s => s.alter_id || s.primary_alter_id).filter(Boolean);
        if (liveIds.length > 0) authorIds = liveIds;
      } catch { /* fall through */ }
    }
    const task = await base44.entities.Task.create({ title: text.trim(), completed: false, priority: "medium" });
    await base44.entities.Bulletin.create({
      content: `[task:${task.id}] ${text.trim()}`,
      author_alter_ids: authorIds,
      author_alter_id: authorIds[0] || null,
      reactions: {},
      read_by_alter_ids: authorIds
    });
    qc.invalidateQueries({ queryKey: ["bulletins"] });
    toast.success("✅ Task added!");
    setText("");
    setSaving(false);
  };

  return (
    <div className="bg-muted/40 mb-3 px-3 py-1 rounded-xl flex items-center gap-2 border border-border/40">
      <CheckSquare className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <input
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
        placeholder="Quick task… press Enter to add"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
      />
    </div>
  );
}

export default function BulletinBoard({
  alters,
  currentAlterId,
  frontingAlterIds = [],
  highlightBulletinId: highlightBulletinIdProp,
  // pageMode = true: standalone /bulletins page variant. Uses a
  // larger default batch + IntersectionObserver auto-load-more on
  // scroll. Default (false) is the dashboard widget.
  pageMode = false,
  // groupId set → an isolated board for that group/subsystem: shows only
  // its own bulletins and posts are tagged with it. Null (default) → the
  // system-wide board, which excludes any group-scoped bulletins.
  groupId = null,
}) {
  const [composing, setComposing] = useState(false);
  const [composeInitial, setComposeInitial] = useState("");
  const [searchOpen, setSearchOpen] = useState(pageMode);
  const [searchQuery, setSearchQuery] = useState("");
  // Local highlight overrides the prop when the user taps the mention banner —
  // mirrors the notification-click flow without needing to round-trip through
  // location state since we're already on the dashboard.
  const [localHighlightId, setLocalHighlightId] = useState(null);
  const highlightBulletinId = localHighlightId || highlightBulletinIdProp;
  // Initial visible count + load-more batch. Dashboard widget reads
  // the user's configured batch size; the standalone page uses a
  // larger default (25) so it feels like a real list, not a
  // dashboard preview strip.
  const [batchSize, setBatchSize] = useState(() => pageMode ? 25 : getBulletinBatchSize());
  useEffect(() => {
    if (pageMode) return; // page mode is fixed
    const sync = () => setBatchSize(getBulletinBatchSize());
    window.addEventListener("bulletin-batch-size-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("bulletin-batch-size-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, [pageMode]);
  const [visibleCount, setVisibleCount] = useState(() => pageMode ? 25 : getBulletinBatchSize());
  const [sortByActivity, setSortByActivity] = useState(false);
  const bulletinRefs = useRef({});
  const observerTarget = useRef(null);

  // Auto-load-more in page mode using IntersectionObserver on the
  // sentinel at the end of the list. Threshold is wide so users get
  // the next batch as the sentinel approaches the viewport rather
  // than waiting until it's fully visible.
  useEffect(() => {
    if (!pageMode) return;
    const el = observerTarget.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((v) => v + 25);
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
    // re-attach when filtered list size changes so a new sentinel is observed
  }, [pageMode, visibleCount, searchQuery, sortByActivity]);

  // Page mode browses every bulletin (with IntersectionObserver
  // lazy-load), so we widen the query cap. Dashboard mode keeps the
  // 100-row cap since the widget only ever shows the latest few.
  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins", pageMode ? "all" : "recent"],
    queryFn: () => base44.entities.Bulletin.list("-created_date", pageMode ? 2000 : 100)
  });

  // Polls flagged `pinned_to_dashboard` from the Polls page surface in
  // this Pinned section. We render only the standalone ones (no
  // bulletin_id) here — polls created from a bulletin already appear via
  // their auto-pinned BulletinCard, so showing the Poll record again
  // would duplicate.
  const { data: allPinnedPolls = [] } = useQuery({
    queryKey: ["polls", "pinned_in_board"],
    queryFn: () => base44.entities.Poll.filter({ pinned_to_dashboard: true }, "-created_date"),
  });
  const standalonePinnedPolls = useMemo(
    // Standalone pinned polls belong to the system board only.
    () => (groupId ? [] : allPinnedPolls.filter((p) => !p.bulletin_id)),
    [allPinnedPolls, groupId]
  );

  // One query for every comment on the board so each card can show a
  // count badge without firing N separate filter() requests on render.
  const { data: allComments = [] } = useQuery({
    queryKey: ["bulletinCommentsAll"],
    queryFn: () => base44.entities.BulletinComment.list("-created_date", 2000),
  });
  const commentCounts = useMemo(() => {
    const m = {};
    for (const c of allComments) m[c.bulletin_id] = (m[c.bulletin_id] || 0) + 1;
    return m;
  }, [allComments]);

  useEffect(() => {
    if (!highlightBulletinId || bulletins.length === 0) return;
    const idx = bulletins.findIndex((b) => b.id === highlightBulletinId);
    if (idx !== -1) setVisibleCount((v) => Math.max(v, idx + 5));
    setTimeout(() => {
      bulletinRefs.current[highlightBulletinId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [highlightBulletinId, bulletins.length]);

  // Scope to this group's board, or (system board) exclude any
  // group-scoped bulletins so they don't leak into the main feed.
  const scopedBulletins = bulletins.filter((b) => (groupId ? b.group_id === groupId : !b.group_id));
  const filteredBulletins = scopedBulletins.filter((b) =>
    !searchQuery || b.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Pinned always stays at top, unaffected by sort
  const pinned = filteredBulletins.filter((b) => b.is_pinned);
  const filteredRecent = filteredBulletins.filter((b) => !b.is_pinned);

  // Sort recent by activity (last comment) or default (created_date desc)
  const sortedRecent = sortByActivity
    ? [...filteredRecent].sort((a, b) => {
        const aTime = new Date(a.last_activity_at || a.created_date);
        const bTime = new Date(b.last_activity_at || b.created_date);
        return bTime - aTime;
      })
    : filteredRecent;

  const unreadCount = scopedBulletins.filter((b) =>
    currentAlterId && b.mentioned_alter_ids?.includes(currentAlterId) && !b.read_by_alter_ids?.includes(currentAlterId)
  ).length;

  // Open the full composer as soon as the user taps into the box (on
  // focus), not once they start typing — the empty composer autofocuses
  // its own textarea so typing continues seamlessly.
  const handleInlineFocus = () => {
    setComposeInitial("");
    setComposing(true);
  };

  return (
    <div data-tour="bulletin-list">
      {/* Header */}
      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-foreground px-3 text-sm font-semibold uppercase">Bulletin Board</h2>
          {unreadCount > 0 &&
            <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full font-medium">{unreadCount}</span>
          }
        </div>
        <button
          onClick={() => { setSearchOpen((p) => !p); if (searchOpen) setSearchQuery(""); }}
          className={`p-1.5 rounded-lg transition-colors ${searchOpen ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
          {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      {/* Search */}
      {searchOpen &&
        <div className="mb-3">
          <Input
            autoFocus
            placeholder="Search bulletins..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(batchSize); }}
            className="h-8 text-sm"
          />
        </div>
      }

      {/* Inline compose trigger */}
      {!composing &&
        <input
          className="bg-transparent text-foreground mb-2 px-3 text-sm rounded-xl w-full h-9 border border-border/50 placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
          placeholder="type here… use @ to mention, -name to sign as author"
          onFocus={handleInlineFocus}
        />
      }

      {/* Full composer */}
      {composing &&
        <div className="mb-3">
          <BulletinComposer
            alters={alters}
            authorAlterId={currentAlterId}
            frontingAlterIds={frontingAlterIds}
            initialContent={composeInitial}
            groupId={groupId}
            onClose={() => { setComposing(false); setComposeInitial(""); }}
          />
        </div>
      }

      {/* Quick Task Add — system board only (tasks aren't group-scoped) */}
      {!groupId && <QuickTaskAdd frontingAlterIds={frontingAlterIds} />}

      {/* Quick Plan — schedules an Activity for today straight from the
          board. System board only (plans aren't group-scoped). */}
      {!groupId && <QuickPlanComposer />}

      {/* Mention alerts */}
      {currentAlterId &&
        <MentionAlertBanner
          bulletins={bulletins}
          currentAlterId={currentAlterId}
          alters={alters}
          onJumpToBulletin={(id) => {
            setLocalHighlightId(id);
            setTimeout(() => setLocalHighlightId(null), 5000);
          }}
        />
      }

      <UpcomingPlans placement="bulletin_top" />

      {/* Pinned — always on top, never reordered. Includes both pinned
          bulletins/tasks AND standalone pinned polls (Polls page polls
          with no source bulletin). */}
      {(pinned.length > 0 || standalonePinnedPolls.length > 0) &&
        <div className="mb-4">
          <div className="mr-2 mb-2 px-2 flex items-center gap-2">
            <Pin className="w-3 h-3 text-primary" />
            <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-primary">Pinned</p>
            <div className="flex-1 h-px bg-border/50" />
          </div>
          <div className="space-y-3">
            {standalonePinnedPolls.map((p) =>
              <PinnedPollCard key={`poll-${p.id}`} poll={p} currentAlterId={currentAlterId} />
            )}
            {pinned.map((b) =>
              <div key={b.id} id={`bulletin-${b.id}`} ref={(el) => bulletinRefs.current[b.id] = el}>
                {b.content?.match(/^\[task:/) ?
                  <TaskBulletinCard
                    bulletin={b}
                    alters={alters}
                    currentAlterId={currentAlterId}
                    frontingAlterIds={frontingAlterIds}
                    highlight={highlightBulletinId === b.id}
                  /> :
                  <BulletinCard bulletin={b} alters={alters} currentAlterId={currentAlterId} frontingAlterIds={frontingAlterIds} canDelete highlight={highlightBulletinId === b.id} commentCount={commentCounts[b.id] || 0} />
                }
              </div>
            )}
          </div>
        </div>
      }

      {/* Recent */}
      {filteredRecent.length > 0 &&
        <div>
          {/* RECENT header with activity sort toggle */}
          <div className="flex items-center justify-between mb-2 px-2">
            {pinned.length > 0 &&
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">Recent</p>
            }
            <button
              onClick={() => { setSortByActivity(p => !p); setVisibleCount(batchSize); }}
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition-colors ml-auto ${
                sortByActivity
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <MessageCircle className="w-3 h-3" />
              Recent activity
            </button>
          </div>

          <div className="space-y-3">
            {sortedRecent.slice(0, visibleCount).map((b) =>
              <div key={b.id} id={`bulletin-${b.id}`} ref={(el) => bulletinRefs.current[b.id] = el}>
                {b.content?.match(/^\[task:/) ?
                  <TaskBulletinCard
                    bulletin={b}
                    alters={alters}
                    currentAlterId={currentAlterId}
                    frontingAlterIds={frontingAlterIds}
                    highlight={highlightBulletinId === b.id}
                  /> :
                  <BulletinCard bulletin={b} alters={alters} currentAlterId={currentAlterId} frontingAlterIds={frontingAlterIds} canDelete highlight={highlightBulletinId === b.id} commentCount={commentCounts[b.id] || 0} />
                }
              </div>
            )}
          </div>

          {visibleCount < sortedRecent.length &&
            <div ref={observerTarget} className="py-4 text-center">
              {pageMode ? (
                <span className="text-xs text-muted-foreground">Loading more…</span>
              ) : (
                <button
                  onClick={() => setVisibleCount((v) => v + batchSize)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Load more
                </button>
              )}
            </div>
          }
        </div>
      }

      {filteredBulletins.length === 0 && searchQuery &&
        <div className="flex flex-col items-center py-10 text-center">
          <div className="text-3xl mb-2">🔍</div>
          <p className="text-sm font-medium text-foreground mb-1">No matches found</p>
          <p className="text-xs text-muted-foreground">Try a different search term</p>
        </div>
      }
      {bulletins.length === 0 && !composing &&
        <div className="flex flex-col items-center py-10 text-center">
          <div className="text-3xl mb-2">📌</div>
          <p className="text-sm font-medium text-foreground mb-1">No bulletins yet</p>
          <p className="text-xs text-muted-foreground">Start typing above to post the first one!</p>
        </div>
      }
    </div>
  );
}