import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { format } from "date-fns";
import { useTerms } from "@/lib/useTerms";
import { sightingsOf } from "./PresencePicker";

// Promote a recorded presence into a real alter, carrying over its data
// (name from the label/vibe, colour, emoji, vibe+notes → bio). The user then
// chooses how it relates to the presence's linked alters: either keep them as
// defined relationships, or drop the new alter into a SUBSYSTEM of one of them.
// On success the presence is marked resolved (resolved_alter_id) and we open
// the new alter's profile.
export default function CreateAlterFromPresence({ open, onClose, presence }) {
  const terms = useTerms();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: alters = [] } = useQuery({ queryKey: ["alters"], queryFn: () => base44.entities.Alter.list(), enabled: open });
  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list(), enabled: open });

  const associated = useMemo(
    () => (presence?.associated_alter_ids || []).map((id) => alters.find((a) => a.id === id)).filter(Boolean),
    [presence, alters]
  );

  const [name, setName] = useState("");
  const [mode, setMode] = useState("relationships"); // "relationships" | "subsystem"
  const [ownerId, setOwnerId] = useState("");
  const [subsystemId, setSubsystemId] = useState(""); // "" = create new
  const [newSubName, setNewSubName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !presence) return;
    setName(presence.label || presence.vibe || "");
    setMode("relationships");
    setOwnerId(associated[0]?.id || "");
    setSubsystemId("");
    setNewSubName("");
  }, [open, presence?.id, associated.length]);

  const ownerSubsystems = useMemo(() => groups.filter((g) => g.owner_alter_id === ownerId), [groups, ownerId]);
  const owner = alters.find((a) => a.id === ownerId);

  const subTerm = terms.subsystem || "subsystem";

  const create = async () => {
    if (!name.trim()) {
      toast.error("Give them a name first.");
      return;
    }
    setSaving(true);
    try {
      // First appearance defaults to when the presence was FIRST recorded
      // (its earliest sighting). `birthday` is the free-form display text and
      // `origin_year` the integer the lineage/timeline reads — same pairing
      // the alter editor keeps in sync.
      const seen = [...sightingsOf(presence)].sort();
      const firstSeen = seen[0] ? new Date(seen[0]) : new Date();
      const newAlter = await base44.entities.Alter.create({
        name: name.trim(),
        color: presence.color || "",
        emoji: presence.emoji || "",
        description: [presence.vibe, presence.notes].filter(Boolean).join("\n\n"),
        birthday: format(firstSeen, "MMM d, yyyy"),
        origin_year: firstSeen.getFullYear(),
        is_archived: false,
      });

      if (mode === "subsystem" && ownerId) {
        let group = subsystemId ? groups.find((g) => g.id === subsystemId) : null;
        if (!group) {
          group = await base44.entities.Group.create({
            name: newSubName.trim() || `${owner?.name || name.trim()}'s ${subTerm}`,
            color: presence.color || owner?.color || "#8b5cf6",
            parent: "",
            member_sp_ids: [],
            owner_alter_id: ownerId,
          });
        }
        const memberKey = newAlter.sp_id || newAlter.id;
        const members = new Set(group.member_sp_ids || []);
        members.add(memberKey);
        await base44.entities.Group.update(group.id, { member_sp_ids: [...members] });
        await base44.entities.Alter.update(newAlter.id, {
          groups: [{ id: group.sp_id || group.id, name: group.name, color: group.color || "" }],
        });
      } else {
        // Keep the associated alters as defined relationships.
        for (const a of associated) {
          await base44.entities.AlterRelationship.create({
            alter_id_a: newAlter.id,
            alter_id_b: a.id,
            relationship_type: presence.relationship_type || "Associated with",
            direction: "a_to_b",
          });
        }
      }

      await base44.entities.Presence.update(presence.id, { resolved_alter_id: newAlter.id });
      qc.invalidateQueries({ queryKey: ["alters"] });
      qc.invalidateQueries({ queryKey: ["groups"] });
      qc.invalidateQueries({ queryKey: ["alterRelationships"] });
      qc.invalidateQueries({ queryKey: ["presences"] });
      toast.success(`${name.trim()} created 💜`);
      onClose?.();
      navigate(`/alter/${newAlter.id}`);
    } catch (e) {
      toast.error(e.message || "Couldn't create the alter");
    } finally {
      setSaving(false);
    }
  };

  if (!presence) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md flex flex-col overflow-hidden" style={{ maxHeight: "calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - 2rem)" }}>
        <DialogHeader>
          <DialogTitle>Create {terms.alter} from presence</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 pr-1 space-y-3">
          <p className="text-xs text-muted-foreground">
            This carries over the presence's colour, emoji and notes. You can fine-tune the new {terms.alter} afterwards.
          </p>

          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0"
              style={{ backgroundColor: presence.color ? `${presence.color}30` : "hsl(var(--muted))", boxShadow: presence.color ? `inset 0 0 0 2px ${presence.color}` : undefined }}
            >
              {presence.emoji || "🌫️"}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${terms.Alter} name`} className="flex-1" />
          </div>

          {associated.length > 0 ? (
            <div className="space-y-2 pt-1">
              <p className="text-xs font-medium text-muted-foreground">
                How does this {terms.alter} relate to the {associated.length === 1 ? "linked one" : "linked ones"}?
              </p>
              <label className="flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors"
                style={{ borderColor: mode === "relationships" ? "hsl(var(--primary))" : undefined }}>
                <input type="radio" checked={mode === "relationships"} onChange={() => setMode("relationships")} className="mt-0.5 accent-primary" />
                <span className="text-sm">
                  Keep as relationships
                  <span className="block text-xs text-muted-foreground">
                    Link them to {associated.map((a) => a.name).join(", ")}{presence.relationship_type ? ` as "${presence.relationship_type}"` : ""}.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 p-2.5 rounded-xl border cursor-pointer transition-colors"
                style={{ borderColor: mode === "subsystem" ? "hsl(var(--primary))" : undefined }}>
                <input type="radio" checked={mode === "subsystem"} onChange={() => setMode("subsystem")} className="mt-0.5 accent-primary" />
                <span className="text-sm flex-1">
                  Add into a {subTerm} of…
                  <span className="block text-xs text-muted-foreground">Place them inside one of the linked {terms.alters}' {subTerm}s.</span>
                </span>
              </label>

              {mode === "subsystem" && (
                <div className="space-y-2 pl-7">
                  <select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setSubsystemId(""); }} className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm">
                    {associated.map((a) => <option key={a.id} value={a.id}>{a.name}'s {subTerm}s</option>)}
                  </select>
                  <select value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)} className="w-full h-9 px-2 rounded-md border border-input bg-background text-sm">
                    <option value="">＋ New {subTerm}…</option>
                    {ownerSubsystems.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  {!subsystemId && (
                    <Input value={newSubName} onChange={(e) => setNewSubName(e.target.value)} placeholder={`${owner?.name || ""}'s ${subTerm} (name optional)`} />
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No linked {terms.alters} — they'll be created on their own. You can add relationships from their profile later.</p>
          )}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/50">
          <Button variant="outline" onClick={onClose} disabled={saving} className="flex-1">Cancel</Button>
          <Button onClick={create} loading={saving} disabled={saving || !name.trim()} className="flex-1 bg-primary hover:bg-primary/90">
            Create {terms.alter}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
