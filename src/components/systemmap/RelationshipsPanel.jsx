import React, { useState, useRef, useEffect } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, MapPin, X, Upload, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import CreateRelationshipModal from "./CreateRelationshipModal";
import { DEFAULT_RELATIONSHIP_TYPES } from "@/lib/relationshipTypes";
import { useTerms } from "@/lib/useTerms";
import ColorPicker from "@/components/shared/ColorPicker";
import LocalImageFixer from "@/components/shared/LocalImageFixer";
import RelationshipTypesManager from "@/components/settings/RelationshipTypesManager";

export function AlterAvatar({ alter, size = 24 }) {
  if (!alter) return <div className="rounded-full bg-muted flex-shrink-0" style={{ width: size, height: size }} />;
  return alter.avatar_url ? (
    <img src={alter.avatar_url} className="rounded-full object-cover flex-shrink-0 border border-border"
      style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
      style={{ width: size, height: size, backgroundColor: alter.color || "#8b5cf6", fontSize: size * 0.4 }}>
      {alter.name?.charAt(0)?.toUpperCase()}
    </div>
  );
}

function DirArrow({ direction }) {
  if (direction === "a_to_b") return <span className="text-muted-foreground text-sm">→</span>;
  if (direction === "b_to_a") return <span className="text-muted-foreground text-sm">←</span>;
  return <span className="text-muted-foreground text-sm">↔</span>;
}

function RelTypeLabel({ rel }) {
  return rel.relationship_type === "Custom" ? (rel.custom_label || "Custom") : rel.relationship_type;
}

function EditRelationshipModal({ rel, alterMap, onSave, onClose }) {
  const [direction, setDirection] = useState(rel.direction);
  const [relType, setRelType] = useState(rel.relationship_type);
  const [color, setColor] = useState(rel.color || "#6b7280");
  const [notes, setNotes] = useState(rel.notes || "");
  const [strength, setStrength] = useState(rel.strength || 3);

  const { data: relTypes = [] } = useQuery({
    queryKey: ["relationshipTypes"],
    queryFn: async () => {
      const all = await base44.entities.RelationshipType.list();
      if (all.length === 0) return DEFAULT_RELATIONSHIP_TYPES.map((t, i) => ({ ...t, id: i, order: i }));
      return all.filter(t => !t.is_archived).sort((a, b) => (a.order || 0) - (b.order || 0));
    },
  });

  const handleTypeChange = (label) => {
    setRelType(label);
    const found = relTypes.find(t => t.label === label);
    if (found) setColor(found.color || "#6b7280");
  };

  const alterA = alterMap[rel.alter_id_a];
  const alterB = alterMap[rel.alter_id_b];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-5 shadow-xl w-full max-w-sm mx-4 space-y-4"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground">Edit Relationship</h3>
          <button onClick={onClose}><X className="w-4 h-4 text-muted-foreground" /></button>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Direction</p>
          {[
            { value: "a_to_b", label: `${alterA?.name} → ${alterB?.name}` },
            { value: "b_to_a", label: `${alterB?.name} → ${alterA?.name}` },
            { value: "bidirectional", label: `${alterA?.name} ↔ ${alterB?.name}` },
          ].map(opt => (
            <button key={opt.value} onClick={() => setDirection(opt.value)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm border mb-1 transition-colors ${direction === opt.value ? "bg-primary/10 border-primary/40 text-primary" : "border-border hover:bg-muted/40"}`}>
              {opt.label}
            </button>
          ))}
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Type</p>
          <select value={relType} onChange={e => handleTypeChange(e.target.value)}
            className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm">
            {relTypes.map(t => (
              <option key={t.id || t.label} value={t.label}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Strength <span className="font-normal normal-case text-muted-foreground/70">{["", "Very Weak", "Weak", "Moderate", "Strong", "Very Strong"][strength]}</span>
          </p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} onClick={() => setStrength(v)}
                className={`flex-1 h-8 rounded-lg border-2 text-xs font-bold transition-all ${
                  v <= strength ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:border-primary/50"
                }`}>
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Color</p>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm resize-none" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onSave({ direction, relationship_type: relType, custom_label: "", color, notes, strength })}>Save</Button>
        </div>
      </div>
    </div>
  );
}

export default function RelationshipsPanel({ relationships, alters, locations = [], onRefreshRelationships }) {
  const queryClient = useQueryClient();
  const t = useTerms();
  const [filterAlterId, setFilterAlterId] = useState("");
  const [filterMode, setFilterMode] = useState("all"); // "all" | "relationships" | "locations"
  const [creating, setCreating] = useState(false);
  const [editingRel, setEditingRel] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [open, setOpen] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null); // location detail modal
  const [managingTypes, setManagingTypes] = useState(false);

  const alterMap = Object.fromEntries(alters.map(a => [a.id, a]));
  const locationMap = Object.fromEntries(locations.map(l => [l.id, l]));

  const filteredRels = (filterMode === "relationships" || filterMode === "all") 
    ? filterAlterId
      ? relationships.filter(r => r.alter_id_a === filterAlterId || r.alter_id_b === filterAlterId)
      : relationships
    : [];

  // Location rows: alters that have inner_world_location_id set
  const locationRows = alters.filter(a => !a.is_archived && a.inner_world_location_id);
  const filteredLocationRows = (filterMode === "locations" || filterMode === "all")
    ? filterAlterId
      ? locationRows.filter(a => a.id === filterAlterId)
      : locationRows
    : [];

  // Nested locations: locations inside other locations by coordinate overlap
  const getParentLocation = (loc) => {
    const sortedLocs = [...locations].sort((a, b) => (b.order || 0) - (a.order || 0));
    for (const parent of sortedLocs) {
      if (parent.id === loc.id) continue;
      if (loc.x >= parent.x && loc.x + (loc.width || 200) <= parent.x + (parent.width || 200) &&
          loc.y >= parent.y && loc.y + (loc.height || 150) <= parent.y + (parent.height || 150)) {
        return parent;
      }
    }
    return null;
  };

  // Get sub-locations for a location
  const getSubLocations = (locId) => {
    return locations.filter(loc => {
      const parent = getParentLocation(loc);
      return parent?.id === locId;
    });
  };

  // Get alters in a location
  const getAltersInLocation = (locId) => {
    return alters.filter(a => !a.is_archived && a.inner_world_location_id === locId);
  };

  const locationListItems = (filterMode === "locations" || filterMode === "all")
    ? locations.filter(l => {
        // Only show top-level locations or filter by parent if needed
        return !getParentLocation(l);
      })
    : [];

  const handleDelete = async (rel) => {
    await base44.entities.AlterRelationship.delete(rel.id);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setConfirmDelete(null);
  };

  const handleSaveNew = async (data) => {
    await base44.entities.AlterRelationship.create(data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setCreating(false);
  };

  const handleSaveEdit = async (data) => {
    await base44.entities.AlterRelationship.update(editingRel.id, data);
    queryClient.invalidateQueries({ queryKey: ["alterRelationships"] });
    onRefreshRelationships?.();
    setEditingRel(null);
  };

  const totalCount = filteredRels.length + filteredLocationRows.length + locationListItems.length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
        <span className="font-semibold text-sm text-foreground">
          Relationships &amp; Locations ({totalCount})
        </span>
        <div className="flex items-center gap-2">
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <>
          <div className="px-3 pb-2 border-t border-border pt-2 flex flex-wrap gap-2 items-center">
            {/* Filter tabs */}
            <div className="flex gap-1 border border-border rounded-lg bg-muted/20 p-0.5">
              {["all", "relationships", "locations"].map(mode => (
                <button
                  key={mode}
                  onClick={() => { setFilterMode(mode); setFilterAlterId(""); }}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                    filterMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "all" ? "All" : mode === "relationships" ? "Relationships" : "Locations"}
                </button>
              ))}
            </div>

            {/* Alter filter (only for relationships and all modes) */}
            {(filterMode === "all" || filterMode === "relationships") && (
              <select value={filterAlterId} onChange={e => setFilterAlterId(e.target.value)}
                className="h-8 px-2 rounded border border-border bg-background text-xs">
                <option value="">{`All ${t.alters}`}</option>
                {alters.filter(a => !a.is_archived).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            )}

            {(filterMode === "all" || filterMode === "relationships") && (
              <Button size="sm" className="text-xs h-8" onClick={() => setCreating(true)}>
                <Plus className="w-3 h-3 mr-1" /> Add Relationship
              </Button>
            )}
            {(filterMode === "all" || filterMode === "relationships") && (
              <button
                onClick={() => setManagingTypes(true)}
                className="flex items-center gap-1 h-8 px-2.5 text-xs rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                title="Manage relationship types"
              >
                <Settings2 className="w-3 h-3" /> Types
              </button>
            )}
          </div>

          <div className="divide-y divide-border/50">
            {filteredRels.length === 0 && filteredLocationRows.length === 0 && locationListItems.length === 0 && (
              <p className="text-xs text-muted-foreground px-4 py-3 text-center">
                {filterMode === "locations" ? "No locations yet" : filterMode === "relationships" ? `No ${t.relationships} yet` : `No ${t.relationships} or locations yet`}
              </p>
            )}

            {/* Relationship rows */}
            {filteredRels.map(rel => {
              const a = alterMap[rel.alter_id_a];
              const b = alterMap[rel.alter_id_b];
              return (
                <div key={rel.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  {/* Alter A */}
                  <AlterAvatar alter={a} size={22} />
                  <span className="text-xs text-foreground font-medium">{a?.name || "?"}</span>

                  {/* Direction arrow */}
                  <DirArrow direction={rel.direction} />

                  {/* Relationship type */}
                  <span className="text-xs text-muted-foreground"><RelTypeLabel rel={rel} /></span>

                  {/* Arrow other way / Alter B */}
                  <AlterAvatar alter={b} size={22} />
                  <span className="text-xs text-foreground font-medium">{b?.name || "?"}</span>

                  {/* Strength dots */}
                  <div className="flex gap-0.5 ml-auto flex-shrink-0">
                    {[1,2,3,4,5].map(v => (
                      <div key={v} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: v <= (rel.strength || 3) ? (rel.color || "#6b7280") : "transparent", border: `1px solid ${rel.color || "#6b7280"}`, opacity: v <= (rel.strength || 3) ? 1 : 0.35 }} />
                    ))}
                  </div>

                  {/* Color dot */}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: rel.color || "#6b7280" }} />

                  {/* Actions */}
                  <button onClick={() => setEditingRel(rel)}
                    className="text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setConfirmDelete(rel)}
                    className="text-muted-foreground hover:text-destructive p-0.5 flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}

            {/* Location rows (alters in locations) */}
            {filteredLocationRows.map(alter => {
              const loc = locationMap[alter.inner_world_location_id];
              return (
                <div key={`loc-${alter.id}`} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  <AlterAvatar alter={alter} size={22} />
                  <span className="text-xs text-foreground font-medium">{alter.name}</span>
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">located in</span>
                  <button onClick={() => setSelectedLocation(loc)}
                    className="text-xs text-primary hover:underline font-medium">
                    {loc?.name || "Unknown location"}
                  </button>
                </div>
              );
            })}

            {/* Location list rows */}
            {locationListItems.map(loc => {
              const parentLoc = getParentLocation(loc);
              const subLocs = getSubLocations(loc.id);
              const altersInLoc = getAltersInLocation(loc.id);
              return (
                <div key={`location-${loc.id}`} className="px-4 py-2.5 hover:bg-muted/20 transition-colors">
                  <button 
                    onClick={() => setSelectedLocation(loc)}
                    className="w-full text-left flex items-center gap-2.5">
                    <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: loc.color || "#6366f1" }} />
                    <span className="text-xs text-foreground font-medium flex-1">{loc.name}</span>
                    {subLocs.length > 0 && <span className="text-xs text-muted-foreground text-right">{subLocs.length} sub</span>}
                    {altersInLoc.length > 0 && <span className="text-xs text-muted-foreground text-right">{altersInLoc.length} {t.alters}</span>}
                  </button>
                  {parentLoc && (
                    <div className="mt-1 ml-6 flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">inside</span>
                      <button onClick={() => setSelectedLocation(parentLoc)}
                        className="text-xs text-primary hover:underline">
                        {parentLoc.name}
                      </button>
                    </div>
                  )}
                  {/* Nested sublocs */}
                  {subLocs.length > 0 && (
                    <div className="mt-2 ml-6 space-y-1.5">
                      {subLocs.map(sub => (
                        <div key={`sub-${sub.id}`} className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded flex-shrink-0" style={{ backgroundColor: sub.color || "#6366f1" }} />
                          <button onClick={() => setSelectedLocation(sub)}
                            className="text-xs text-foreground hover:text-primary transition-colors font-medium flex-1">
                            {sub.name}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {creating && (
        <CreateRelationshipModal
          allAlters={alters.filter(a => !a.is_archived)}
          alterA={null}
          alterB={null}
          onSave={handleSaveNew}
          onClose={() => setCreating(false)}
        />
      )}

      {editingRel && (
        <EditRelationshipModal
          rel={editingRel}
          alterMap={alterMap}
          onSave={handleSaveEdit}
          onClose={() => setEditingRel(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setConfirmDelete(null)}>
          <div className="bg-card border border-border rounded-xl p-4 shadow-xl max-w-xs mx-4 space-y-3"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">Delete relationship?</p>
            <p className="text-xs text-muted-foreground">This cannot be undone.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={() => handleDelete(confirmDelete)}>Delete</Button>
            </div>
          </div>
        </div>
      )}

      {managingTypes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pb-16 sm:pb-0" onClick={() => setManagingTypes(false)}>
          <div className="w-full max-w-sm mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">Manage Relationship Types</span>
              <button onClick={() => setManagingTypes(false)} className="text-white/70 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <RelationshipTypesManager />
          </div>
        </div>
      )}

      {selectedLocation && (
        <LocationDetailModal
          location={selectedLocation}
          alters={alters}
          locationMap={locationMap}
          getParentLocation={getParentLocation}
          getSubLocations={getSubLocations}
          getAltersInLocation={getAltersInLocation}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  );
}

function LocationDetailModal({ location, alters, locationMap, getParentLocation, getSubLocations, getAltersInLocation, onClose }) {
  const t = useTerms();
  const bgFileRef = useRef(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState(location);
  const [resolvedBgUrl, setResolvedBgUrl] = useState(null);
  const queryClient = useQueryClient();

  const parentLoc = getParentLocation(location);
  const subLocs = getSubLocations(location.id);
  const altersInLoc = getAltersInLocation(location.id);

  // Resolve local-image:// URLs for rendering
  useEffect(() => {
    const url = editData.background_image_url;
    if (!url) { setResolvedBgUrl(null); return; }
    import("@/lib/imageUrlResolver").then(({ resolveImageUrl }) => {
      resolveImageUrl(url).then(setResolvedBgUrl);
    });
  }, [editData.background_image_url]);

  const handleBgImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const compressImage = (f, maxWidth = 1200, quality = 0.8) => new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(f);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = url;
    });
    const dataUrl = await compressImage(file);
    const { isLocalMode } = await import("@/lib/storageMode");
    let imageUrl = dataUrl;
    if (isLocalMode()) {
      const { saveLocalImage, createLocalImageUrl } = await import("@/lib/localImageStorage");
      const imageId = `location-bg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(imageId, dataUrl);
      imageUrl = createLocalImageUrl(imageId);
    }
    setEditData(l => ({ ...l, background_image_url: imageUrl }));
  };

  const handleSave = async () => {
    await base44.entities.InnerWorldLocation.update(location.id, editData);
    queryClient.invalidateQueries({ queryKey: ["innerWorldLocations"] });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    setEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 pb-16 sm:pb-0" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with background image or color */}
        <div
          className="relative h-40 flex items-end p-4"
          style={{
            backgroundColor: editData.color || "#6366f1",
            backgroundImage: resolvedBgUrl ? `url(${resolvedBgUrl})` : "none",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative z-10">
            {editing ? (
              <input
                value={editData.name || ""}
                onChange={e => setEditData(l => ({ ...l, name: e.target.value }))}
                className="text-3xl font-bold text-white bg-black/30 rounded px-3 py-1 w-full max-w-md"
              />
            ) : (
              <h1 className="text-3xl font-bold text-white">{editData.name}</h1>
            )}
          </div>
          <button onClick={onClose} className="absolute top-3 right-3 z-20 text-white hover:text-muted-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Description</p>
            {editing ? (
              <textarea
                value={editData.description || ""}
                onChange={e => setEditData(l => ({ ...l, description: e.target.value }))}
                className="w-full h-20 px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none"
              />
            ) : (
              <p className="text-sm text-foreground">{editData.description || "No description"}</p>
            )}
          </div>

          {/* Color & Shape */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Color</p>
              {editing ? (
                <ColorPicker value={editData.color || "#6366f1"} onChange={e => setEditData(l => ({ ...l, color: e }))} />
              ) : (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded border border-border" style={{ backgroundColor: editData.color || "#6366f1" }} />
                  <span className="text-sm font-mono text-muted-foreground">{editData.color || "#6366f1"}</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Shape</p>
              {editing ? (
                <select
                  value={editData.shape || "rectangle"}
                  onChange={e => setEditData(l => ({ ...l, shape: e.target.value }))}
                  className="w-full h-8 px-2 rounded border border-border bg-background text-xs"
                >
                  <option value="rectangle">Rectangle</option>
                  <option value="oval">Oval</option>
                </select>
              ) : (
                <p className="text-sm text-foreground capitalize">{editData.shape || "rectangle"}</p>
              )}
            </div>
          </div>

          {/* Background Image */}
          {editing && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Background Image</p>
              <div className="space-y-2">
                <input
                  value={editData.background_image_url || ''}
                  onChange={e => setEditData(l => ({ ...l, background_image_url: e.target.value }))}
                  placeholder="https://... or upload below"
                  className="w-full h-8 px-3 rounded border border-border bg-background text-xs"
                />
                <button
                  onClick={() => bgFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-1.5 h-8 text-xs border border-dashed border-border rounded hover:border-primary/50 hover:bg-muted/30 transition-colors text-muted-foreground"
                >
                  <Upload className="w-3 h-3" /> Upload image file
                </button>
                <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={handleBgImageFile} />
                {editData.background_image_url && (
                   <div className="relative">
                     <img
                       src={resolvedBgUrl || editData.background_image_url}
                       alt="background preview"
                       className="w-full h-24 object-cover rounded border border-border"
                     />
                     <button
                       onClick={() => setEditData(l => ({ ...l, background_image_url: '' }))}
                       className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-black/80"
                     >
                       <X className="w-3 h-3" />
                     </button>
                     <div className="absolute bottom-1 left-1">
                       <LocalImageFixer
                         value={editData.background_image_url}
                         maxWidth={1200}
                         quality={0.8}
                         onFixed={(url) => setEditData(l => ({ ...l, background_image_url: url }))}
                       />
                     </div>
                   </div>
                 )}
                </div>

                {/* Background image opacity */}
                {editing && editData.background_image_url && (
                 <div className='space-y-1'>
                   <div className='flex items-center justify-between'>
                     <p className='text-xs text-muted-foreground'>Image opacity</p>
                     <span className='text-xs text-muted-foreground font-mono'>
                       {Math.round((editData.background_opacity ?? 0.7) * 100)}%
                     </span>
                   </div>
                   <input
                     type='range'
                     min={0.05}
                     max={1}
                     step={0.05}
                     value={editData.background_opacity ?? 0.7}
                     onChange={e => {
                       const v = parseFloat(e.target.value);
                       setEditData(l => ({ ...l, background_opacity: v }));
                     }}
                     className='w-full accent-primary'
                   />
                 </div>
                )}

                {/* Layer order */}
                {editing && (
                 <div className='space-y-1'>
                   <p className='text-xs text-muted-foreground'>Layer order</p>
                   <div className='flex gap-1'>
                     <button
                       onClick={() => {
                         const newOrder = (editData.order || 0) + 1;
                         setEditData(l => ({ ...l, order: newOrder }));
                       }}
                       className='flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50 transition-colors'
                     >
                       ↑ Bring forward
                     </button>
                     <button
                       onClick={() => {
                         const newOrder = Math.max(0, (editData.order || 0) - 1);
                         setEditData(l => ({ ...l, order: newOrder }));
                       }}
                       className='flex-1 h-7 text-xs border border-border rounded hover:bg-muted/50 transition-colors'
                     >
                       ↓ Send back
                     </button>
                   </div>
                   <p className='text-xs text-muted-foreground text-center'>Layer: {editData.order || 0}</p>
                 </div>
                )}
                </div>
                )}

          {/* Parent location */}
          {parentLoc && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/50">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground font-medium">Located inside</p>
                <p className="text-sm text-foreground font-medium">{parentLoc.name}</p>
              </div>
            </div>
          )}

          {/* Sub-locations */}
          {subLocs.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Sub-locations ({subLocs.length})
              </p>
              <div className="space-y-2">
                {subLocs.map(sub => (
                  <div key={sub.id} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-muted/10">
                    <div className="w-4 h-4 rounded flex-shrink-0" style={{ backgroundColor: sub.color || "#6366f1" }} />
                    <span className="text-sm text-foreground flex-1">{sub.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alters in this location */}
          {altersInLoc.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {t.Alters} here ({altersInLoc.length})
              </p>
              <div className="space-y-2">
                {altersInLoc.map(alter => (
                  <div key={alter.id} className="flex items-center gap-2.5 p-2 rounded-lg border border-border/50 hover:bg-muted/10">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                      style={{ backgroundColor: alter.color || "#8b5cf6", fontSize: 10 }}
                    >
                      {alter.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="text-sm text-foreground flex-1">{alter.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-4 border-t border-border/50">
            {editing ? (
              <>
                <Button variant="outline" className="flex-1" size="sm" onClick={() => { setEditing(false); setEditData(location); }}>
                  Cancel
                </Button>
                <Button className="flex-1" size="sm" onClick={handleSave}>
                  Save Changes
                </Button>
              </>
            ) : (
              <Button variant="outline" className="w-full" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit Location
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}