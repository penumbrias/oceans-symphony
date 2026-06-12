import React, { useState, useRef, useEffect } from "react";
import { localEntities } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTerms } from "@/lib/useTerms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Map, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

// One-time localStorage marker so the starter roadmap is only seeded
// once, even if the query re-resolves to an empty list mid-session.
// User-data invariant: we ONLY create when the stored list is genuinely
// empty AND we've never seeded before — we never overwrite or delete
// existing items.
const SEED_MARKER = "symphony_roadmap_seeded_v1";

// Status catalogue. Order here = group order on the page.
const STATUSES = [
  { id: "in-progress", label: "In progress", chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  { id: "planned",     label: "Planned",     chip: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30" },
  { id: "considering", label: "Considering", chip: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30" },
  { id: "done",        label: "Done",        chip: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30" },
];
const STATUS_ORDER = STATUSES.map(s => s.id);
const statusMeta = (id) => STATUSES.find(s => s.id === id) || STATUSES[1];

// Starter roadmap seeded on first visit when the list is empty. The
// stored text stays literal — only the page chrome is terms-aware.
const SEED_ITEMS = [
  { title: "Ongoing polish", description: "Continued UI standardization, usability, accessibility, performance, and bug-squashing across the app.", category: "Polish", status: "in-progress", sort_order: 0 },
  { title: "Backburner ideas", description: "Previously-discussed or pinned ideas that haven't been built yet.", category: "General", status: "considering", sort_order: 1 },
  { title: "New presences", description: "Detect emergent alters: log just a fragment (a name, a colour, a description detail), optionally mark potential connections to existing alters, and track them over time as they coalesce into full alters or dissipate.", category: "Alters", status: "planned", sort_order: 2 },
  { title: "Grocery & wish lists", description: "Expand grocery lists into multiple list types with comprehensive wish-list functionality.", category: "Lists", status: "planned", sort_order: 3 },
  { title: "External relationships", description: "Expand the pronouns feature into an advanced-preferences field: list pronouns, touch/personal boundaries, etc. as open text with a like / neutral / dislike (optionally 5-way) toggle.", category: "Profiles", status: "planned", sort_order: 4 },
  { title: "More plural-app imports", description: "Import from more plural-focused apps beyond PluralKit and Simply Plural.", category: "Import", status: "planned", sort_order: 5 },
  { title: "Lifetime-scale performance", description: "Virtualize and date-bound very large histories (Activity Tracker and others) so the app stays instant even after years of data.", category: "Performance", status: "planned", sort_order: 6 },
];

function StatusPills({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUSES.map(s => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
              active ? s.chip : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function RoadmapItemForm({ item, onSave, onClose }) {
  const [title, setTitle] = useState(item?.title || "");
  const [description, setDescription] = useState(item?.description || "");
  const [category, setCategory] = useState(item?.category || "");
  const [status, setStatus] = useState(item?.status || "planned");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Please enter a title");
      return;
    }
    setSaving(true);
    try {
      const data = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: STATUS_ORDER.includes(status) ? status : "planned",
        sort_order: item?.sort_order ?? 0,
      };
      if (item?.id) {
        await localEntities.RoadmapItem.update(item.id, data);
        toast.success("Roadmap item updated");
      } else {
        await localEntities.RoadmapItem.create(data);
        toast.success("Roadmap item added");
      }
      onSave();
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Title</Label>
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Feature or idea..."
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs">Description</Label>
        <Textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What is this, and why is it planned?"
          className="mt-1 h-24"
        />
      </div>

      <div>
        <Label className="text-xs">Category</Label>
        <Input
          value={category}
          onChange={e => setCategory(e.target.value)}
          placeholder="e.g. Alters, Polish, Performance..."
          className="mt-1"
        />
      </div>

      <div>
        <Label className="text-xs mb-2 block">Status</Label>
        <StatusPills value={status} onChange={setStatus} />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : item?.id ? "Save Changes" : "Add Item"}
        </Button>
      </div>
    </div>
  );
}

export default function Roadmap() {
  const queryClient = useQueryClient();
  const terms = useTerms();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const seededRef = useRef(false);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["roadmapItems"],
    queryFn: () => localEntities.RoadmapItem.list(),
  });

  // One-time seed of the starter roadmap when the list is empty. Guarded
  // by both a render-stable ref and a localStorage marker so it can never
  // double-seed or overwrite anything the user already has.
  useEffect(() => {
    if (isLoading) return;
    if (seededRef.current) return;
    if (items.length > 0) {
      seededRef.current = true;
      return;
    }
    let alreadySeeded = false;
    try { alreadySeeded = localStorage.getItem(SEED_MARKER) === "1"; } catch { /* ignore */ }
    if (alreadySeeded) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    (async () => {
      try {
        // Re-check live count right before creating — defends against a
        // stale query snapshot so we never seed on top of real data.
        const live = await localEntities.RoadmapItem.list();
        if (Array.isArray(live) && live.length > 0) {
          try { localStorage.setItem(SEED_MARKER, "1"); } catch { /* ignore */ }
          return;
        }
        for (const seed of SEED_ITEMS) {
          await localEntities.RoadmapItem.create(seed);
        }
        try { localStorage.setItem(SEED_MARKER, "1"); } catch { /* ignore */ }
        queryClient.invalidateQueries({ queryKey: ["roadmapItems"] });
      } catch {
        // If seeding fails, allow a retry on the next mount.
        seededRef.current = false;
      }
    })();
  }, [isLoading, items.length, queryClient]);

  const handleDelete = async (id) => {
    try {
      await localEntities.RoadmapItem.delete(id);
      queryClient.invalidateQueries({ queryKey: ["roadmapItems"] });
      toast.success("Roadmap item deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const openAdd = () => { setEditingItem(null); setShowModal(true); };
  const openEdit = (item) => { setEditingItem(item); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditingItem(null); };
  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["roadmapItems"] });
    handleClose();
  };

  // Group by status in STATUS_ORDER, sort within group by sort_order then title.
  const groups = STATUS_ORDER.map(statusId => {
    const groupItems = items
      .filter(it => (it.status || "planned") === statusId)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.title || "").localeCompare(String(b.title || "")));
    return { statusId, items: groupItems };
  }).filter(g => g.items.length > 0);

  // Any items with an unknown status still need a home — bucket them
  // under "planned" semantics at the end so nothing silently vanishes.
  const knownIds = new Set(STATUS_ORDER);
  const orphanItems = items
    .filter(it => !knownIds.has(it.status || "planned"))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.title || "").localeCompare(String(b.title || "")));
  if (orphanItems.length > 0) {
    groups.push({ statusId: "planned", items: orphanItems });
  }

  const total = items.length;

  return (
    <div className="py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 data-tour="roadmap-header" className="font-display text-3xl font-semibold text-foreground">Roadmap</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Planned features and long-term ideas for the app.
          </p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Add item
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <Map className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No roadmap items yet</p>
          <p className="text-xs text-muted-foreground mb-4">Add planned features and ideas to track what's ahead.</p>
          <Button onClick={openAdd} size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add first item
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ statusId, items: groupItems }) => {
            const meta = statusMeta(statusId);
            return (
              <div key={statusId}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${meta.chip}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{groupItems.length}</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <div className="space-y-2">
                  {groupItems.map(item => {
                    const meta2 = statusMeta(item.status || "planned");
                    return (
                      <Card
                        key={item.id}
                        className="hover:bg-muted/20 transition-colors cursor-pointer"
                        onClick={() => openEdit(item)}
                      >
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-medium text-sm">{item.title || "Untitled"}</p>
                                {item.category && (
                                  <span className="text-[0.625rem] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/50">
                                    {item.category}
                                  </span>
                                )}
                                <span className={`text-[0.625rem] font-medium px-1.5 py-0.5 rounded-full border ${meta2.chip}`}>
                                  {meta2.label}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed whitespace-pre-wrap">
                                  {item.description}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                aria-label="Delete roadmap item"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note routed through terms — this is the only system/alter
          wording on the page chrome. */}
      {total > 0 && (
        <p className="text-xs text-muted-foreground/60 mt-8 text-center">
          A public list of what's planned for your {terms.system}'s app. Tap an item to edit it.
        </p>
      )}

      <Dialog open={showModal} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Roadmap Item" : "Add Roadmap Item"}</DialogTitle>
          </DialogHeader>
          <RoadmapItemForm
            item={editingItem}
            onSave={handleSaved}
            onClose={handleClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
