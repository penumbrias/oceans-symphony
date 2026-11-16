// Small shared pieces for text templates: the folder picker (nesting-aware,
// searchable) and the formatted preview. Used by the toolbar's Templates
// sheet and by Settings → Text templates, so both look and behave the same.
import React, { useMemo } from "react";
import { FolderPlus } from "lucide-react";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { promptText } from "@/components/shared/ConfirmDialog";
import { renderBulletinContent } from "@/lib/renderBulletinContent";
import { flattenFolderTree } from "@/lib/textTemplateModel";
import { createTemplateFolder } from "@/lib/textTemplates";

const TOP = "__top__";

// Pick which folder something lives in. The list is the whole folder tree,
// indented by depth, plus "Not in a folder". "New folder" makes one inside
// the folder that is picked right now and picks it.
export function TemplateFolderSelect({ value, onChange, folders = [], onFoldersChanged, excludeIds = null, allowNew = true }) {
  const options = useMemo(() => [
    { id: TOP, label: "Not in a folder", _depth: 0 },
    ...flattenFolderTree(folders)
      .filter(({ folder }) => !excludeIds || !excludeIds.has(folder.id))
      .map(({ folder, depth }) => ({ id: folder.id, label: folder.name || "Folder", _depth: depth })),
  ], [folders, excludeIds]);

  const makeFolder = async () => {
    const name = await promptText({ title: "New folder", placeholder: "Folder name", confirmLabel: "Make folder" });
    if (!name) return;
    const made = await createTemplateFolder({ name, parentId: value || null });
    onFoldersChanged?.();
    if (made?.id) onChange(made.id);
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 min-w-0">
        <SearchableSelect
          value={value || TOP}
          onChange={(id) => onChange(id === TOP ? null : id)}
          options={options}
          placeholder="Not in a folder"
          searchPlaceholder="Search folders…"
          renderOption={(o) => (
            <span className="flex items-center min-w-0">
              {o._depth > 0 && <span style={{ width: o._depth * 12 }} className="flex-shrink-0" />}
              {o._depth > 0 && <span className="text-muted-foreground mr-1">↳</span>}
              <span className="truncate">{o.label}</span>
            </span>
          )}
        />
      </div>
      {allowNew && (
        <button type="button" onClick={makeFolder} title="New folder" aria-label="New folder"
          className="h-9 w-9 flex-shrink-0 inline-flex items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/50">
          <FolderPlus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// The template as it will look when pasted.
export function TemplatePreview({ content, className = "" }) {
  return (
    <div className={`wysiwyg-content text-sm leading-relaxed break-words ${className}`}>
      {renderBulletinContent(content || "", [], null)}
    </div>
  );
}
