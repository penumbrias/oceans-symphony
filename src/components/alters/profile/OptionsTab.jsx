import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Trash2, AlertTriangle, Share2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useTerms } from "@/lib/useTerms";
import AlterExportModal from "@/components/alters/AlterExportModal";
import PrivacyLevelsManager from "@/components/friends/PrivacyLevelsManager";
import { getPrivacyLevels, sortedLevels, selectablePillClass } from "@/lib/privacyLevels";
import { Settings2 } from "lucide-react";

export default function OptionsTab({ alter }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const terms = useTerms();
  const [archived, setArchived] = useState(alter.is_archived || false);
  const [showExport, setShowExport] = useState(false);
  const [friendsVisible, setFriendsVisible] = useState(alter.friends_visible ?? true);
  const [saving, setSaving] = useState(false);
  const [levelIds, setLevelIds] = useState(() => (Array.isArray(alter.privacy_levels) ? alter.privacy_levels : []));
  const [showLevelsManager, setShowLevelsManager] = useState(false);

  const { data: settingsList = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const levels = sortedLevels(getPrivacyLevels(settingsList[0]));

  const toggleLevel = async (levelId) => {
    const next = levelIds.includes(levelId) ? levelIds.filter((id) => id !== levelId) : [...levelIds, levelId];
    setLevelIds(next);
    await base44.entities.Alter.update(alter.id, { privacy_levels: next });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
  };

  const toggleArchived = async (val) => {
    setArchived(val);
    setSaving(true);
    await base44.entities.Alter.update(alter.id, { is_archived: val });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    setSaving(false);
  };

  const toggleFriendsVisible = async (val) => {
    setFriendsVisible(val);
    setSaving(true);
    await base44.entities.Alter.update(alter.id, { friends_visible: val });
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
    setSaving(false);
  };

  const deleteAlter = async () => {
    await base44.entities.Alter.delete(alter.id);
    queryClient.invalidateQueries({ queryKey: ["alters"] });
    navigate("/Home");
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-primary uppercase tracking-wider mb-4">Settings</p>
        <div className="space-y-4">
          <SettingRow
            label="Archived"
            description={`Marking as archived keeps the data but hides this ${terms.alter} from member counts and searches.`}
            checked={archived}
            onCheckedChange={toggleArchived}
            disabled={saving}
          />
          <SettingRow
            label={`Visible to friends`}
            description={`When enabled, this ${terms.alter} can appear in your front status shared with friends. Disable to keep them private.`}
            checked={friendsVisible}
            onCheckedChange={toggleFriendsVisible}
            disabled={saving}
          />
        </div>
      </div>

      {/* Sharing levels — which privacy levels this alter appears in */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-primary uppercase tracking-wider">Sharing levels</p>
          <button onClick={() => setShowLevelsManager(true)} className="text-[0.6875rem] text-primary hover:underline inline-flex items-center gap-1">
            <Settings2 className="w-3 h-3" /> Manage levels
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          Which privacy levels this {terms.alter} appears in. Private until you pick at least one — friends only see the levels you grant them on the Friends page.
        </p>
        {levels.length === 0 ? (
          <p className="text-xs text-muted-foreground/70 italic">No privacy levels yet — tap “Manage levels” to create some.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {levels.map((l) => {
                const on = levelIds.includes(l.id);
                return (
                  <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleLevel(l.id)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectablePillClass(on)}`}>
                    {on ? "✓ " : ""}{l.number}. {l.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.6875rem] mt-1.5">
              {levelIds.length === 0
                ? <span className="text-muted-foreground">🔒 Private — in no levels, so no friend can see this {terms.alter}.</span>
                : <span className="text-primary">Shared in {levelIds.length} level{levelIds.length === 1 ? "" : "s"} — filled pills are on.</span>}
            </p>
          </>
        )}
      </div>

      {/* Info */}
      {alter.sp_id && (
        <div>
          <p className="text-xs font-medium text-primary uppercase tracking-wider mb-3">Info</p>
          <div className="rounded-xl border border-border/50 bg-muted/10 p-3">
            <p className="text-xs text-muted-foreground mb-1">Simply Plural member ID</p>
            <p className="text-sm font-mono text-foreground break-all">{alter.sp_id}</p>
          </div>
        </div>
      )}

      {/* Share / export this profile */}
      <div>
        <p className="text-xs font-medium text-primary uppercase tracking-wider mb-3">Share</p>
        <button
          onClick={() => setShowExport(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/50 bg-muted/10 hover:bg-muted/30 transition-colors text-left">
          <Share2 className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium">Export / share this {terms.alter}'s profile</span>
        </button>
      </div>

      {/* Danger zone */}
      <div>
        <p className="text-xs font-medium text-destructive uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> Danger Zone
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button data-tour="alter-profile-delete" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors">
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Delete {terms.alter}</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {alter.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete this alter and all their data. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deleteAlter} className="bg-destructive hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <AlterExportModal
        isOpen={showExport}
        onClose={() => setShowExport(false)}
        alters={[alter]}
        presetAlterId={alter.id} />

      <PrivacyLevelsManager isOpen={showLevelsManager} onClose={() => setShowLevelsManager(false)} />
    </div>
  );
}

function SettingRow({ label, description, checked, onCheckedChange, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-border/50 bg-muted/10">
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}