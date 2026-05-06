import React, { useState } from "react";
import { localEntities } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, Plus, Trash2, Pencil } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { toast } from "sonner";
import { LOCATION_CATEGORIES, getCategoryMeta } from "@/lib/locationCategories";

function toDatetimeLocal(iso) {
  const d = iso ? new Date(iso) : new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function groupByDay(locations) {
  const groups = {};
  for (const loc of locations) {
    const dateStr = format(new Date(loc.timestamp), "yyyy-MM-dd");
    if (!groups[dateStr]) groups[dateStr] = [];
    groups[dateStr].push(loc);
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
}

function formatDayLabel(dateStr) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, MMMM d");
}

function LocationLogForm({ location, onSave, onClose }) {
  const [name, setName] = useState(location?.name || "");
  const [category, setCategory] = useState(location?.category || "");
  const [lat, setLat] = useState(location?.latitude ?? null);
  const [lng, setLng] = useState(location?.longitude ?? null);
  const [notes, setNotes] = useState(location?.notes || "");
  const [timestamp, setTimestamp] = useState(() => toDatetimeLocal(location?.timestamp));
  const [gpsLoading, setGpsLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleGPS = () => {
    if (!navigator.geolocation) { toast.error("GPS not available on this device"); return; }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGpsLoading(false);
        toast.success("GPS location captured");
      },
      (err) => {
        toast.error("Could not get location: " + err.message);
        setGpsLoading(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleSave = async () => {
    if (!category && !name.trim()) {
      toast.error("Please select a category or enter a place name");
      return;
    }
    setSaving(true);
    try {
      const data = {
        timestamp: new Date(timestamp).toISOString(),
        name: name.trim() || getCategoryMeta(category).label,
        category: category || "other",
        latitude: lat ?? null,
        longitude: lng ?? null,
        source: lat != null ? "gps" : "manual",
        notes: notes.trim() || null,
      };
      if (location?.id) {
        await localEntities.Location.update(location.id, data);
        toast.success("Location updated");
      } else {
        await localEntities.Location.create(data);
        toast.success("Location logged");
      }
      onSave();
    } catch (err) {
      toast.error(err.message || "Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">Date & Time</Label>
        <Input type="datetime-local" value={timestamp} onChange={e => setTimestamp(e.target.value)} className="mt-1" />
      </div>

      <div>
        <Label className="text-xs mb-2 block">Category</Label>
        <div className="flex flex-wrap gap-1.5">
          {LOCATION_CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id === category ? "" : cat.id)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all"
              style={
                category === cat.id
                  ? { backgroundColor: cat.color, borderColor: cat.color, color: "#fff" }
                  : {}
              }
              data-inactive={category !== cat.id ? "true" : undefined}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
        <style>{`button[data-inactive="true"] { border-color: hsl(var(--border)); color: hsl(var(--muted-foreground)); }`}</style>
      </div>

      <div>
        <Label className="text-xs">Place Name</Label>
        <div className="flex gap-2 mt-1">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={category ? getCategoryMeta(category).label : "Place name..."}
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleGPS}
            disabled={gpsLoading}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors disabled:opacity-50 flex-shrink-0 ${
              lat != null
                ? "border-green-500/60 bg-green-500/10 text-green-600 dark:text-green-400"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
            }`}
          >
            {gpsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
            {lat != null ? "✓ GPS" : "GPS"}
          </button>
        </div>
        {lat != null && (
          <p className="text-xs text-muted-foreground/60 mt-1">
            {lat.toFixed(5)}, {lng?.toFixed(5)} ·{" "}
            <button
              type="button"
              onClick={() => { setLat(null); setLng(null); }}
              className="hover:text-destructive transition-colors"
            >
              clear
            </button>
          </p>
        )}
      </div>

      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any notes about this location..."
          className="mt-1 h-16"
        />
      </div>

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : location?.id ? "Save Changes" : "Log Location"}
        </Button>
      </div>
    </div>
  );
}

export default function LocationHistory() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => localEntities.Location.list(),
  });

  const sorted = [...locations].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const grouped = groupByDay(sorted);

  const handleDelete = async (id) => {
    try {
      await localEntities.Location.delete(id);
      queryClient.invalidateQueries({ queryKey: ["locations"] });
      toast.success("Location deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const openAdd = () => { setEditingLocation(null); setShowModal(true); };
  const openEdit = (loc) => { setEditingLocation(loc); setShowModal(true); };
  const handleClose = () => { setShowModal(false); setEditingLocation(null); };
  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["locations"] });
    handleClose();
  };

  // Stats
  const total = locations.length;
  const catCounts = {};
  for (const loc of locations) catCounts[loc.category] = (catCounts[loc.category] || 0) + 1;
  const topCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];
  const topCatMeta = topCat ? getCategoryMeta(topCat[0]) : null;

  return (
    <div className="py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Location History</h1>
          <p className="text-muted-foreground text-sm mt-1">Track where you go and see patterns over time</p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Log Location
        </Button>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{total}</div>
                <div className="text-xs text-muted-foreground">Total check-ins</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="text-center">
                <div className="text-2xl">{topCatMeta?.emoji || "📍"}</div>
                <div className="text-xs text-muted-foreground">{topCatMeta?.label || "—"} most visited</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {total === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <MapPin className="w-12 h-12 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">No locations logged yet</p>
          <p className="text-xs text-muted-foreground mb-4">Track where you go to discover patterns and insights</p>
          <Button onClick={openAdd} size="sm" className="bg-primary hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Log first location
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([dateStr, dayLocs]) => (
            <div key={dateStr}>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {formatDayLabel(dateStr)}
                </p>
                <div className="flex-1 h-px bg-border/40" />
              </div>
              <div className="space-y-2">
                {dayLocs.map((loc) => {
                  const cat = getCategoryMeta(loc.category);
                  return (
                    <Card key={loc.id} className="hover:bg-muted/20 transition-colors">
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                            style={{ backgroundColor: cat.color + "20", border: `1px solid ${cat.color}40` }}
                          >
                            {cat.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{loc.name || cat.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(loc.timestamp), "h:mm a")}
                              {loc.source === "gps" && (
                                <span className="ml-2 text-green-500">📍 GPS</span>
                              )}
                            </p>
                            {loc.notes && (
                              <p className="text-xs text-muted-foreground mt-1 italic">{loc.notes}</p>
                            )}
                            {loc.latitude != null && loc.longitude != null && (
                              <a
                                href={`https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:text-blue-300 underline mt-1 inline-block"
                                onClick={e => e.stopPropagation()}
                              >
                                {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)} ↗
                              </a>
                            )}
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => openEdit(loc)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(loc.id)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
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
          ))}
        </div>
      )}

      <Dialog open={showModal} onOpenChange={handleClose}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLocation ? "Edit Location" : "Log Location"}</DialogTitle>
          </DialogHeader>
          <LocationLogForm
            location={editingLocation}
            onSave={handleSaved}
            onClose={handleClose}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
