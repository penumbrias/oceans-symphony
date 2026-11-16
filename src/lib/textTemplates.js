// Text templates: the one write path, and the hook every surface reads.
//
// Saved pieces of writing the person can paste anywhere (the Templates
// button in the mini toolbar, ~template:load) — kept with their formatting.
// Shapes and the pure helpers live in src/lib/textTemplateModel.js.
//
// Rules:
// - Only these functions write TextTemplate / TextTemplateFolder rows.
// - A new template always gets a title: the one given, or its first line.
// - Deleting goes to the trash (the entity proxy does that), so nothing is
//   lost by a mis-tap. Deleting a folder never deletes what is inside it:
//   its templates and folders move up to where the folder was.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { localEntities } from "@/api/base44Client";
import { withTrashBatch } from "@/lib/localDb";
import {
  firstLine, isBlankContent, wouldNestFolder, indexFolders, effectiveParentId, TITLE_MAX,
} from "@/lib/textTemplateModel";

export const TEMPLATES_KEY = ["textTemplates"];
export const TEMPLATE_FOLDERS_KEY = ["textTemplateFolders"];

const safeList = async (entity) => {
  try { return (await entity.list()) || []; } catch { return []; }
};

export const listTextTemplates = () => safeList(localEntities.TextTemplate);
export const listTemplateFolders = () => safeList(localEntities.TextTemplateFolder);

// Every surface reads templates through this one hook (shared query keys,
// so the toolbar picker, the settings page and the commands stay in step).
export function useTextTemplates({ enabled = true } = {}) {
  const qc = useQueryClient();
  const { data: templates = [], isLoading: l1 } = useQuery({ queryKey: TEMPLATES_KEY, queryFn: listTextTemplates, enabled });
  const { data: folders = [], isLoading: l2 } = useQuery({ queryKey: TEMPLATE_FOLDERS_KEY, queryFn: listTemplateFolders, enabled });
  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: TEMPLATES_KEY });
    qc.invalidateQueries({ queryKey: TEMPLATE_FOLDERS_KEY });
  }, [qc]);
  return { templates, folders, loading: l1 || l2, refresh };
}

const cleanTitle = (title, content) => {
  const t = String(title || "").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
  return t || firstLine(content) || "Untitled template";
};

// ── Templates ───────────────────────────────────────────────────────────────

export async function createTextTemplate({ title = "", content = "", folderId = null } = {}) {
  if (isBlankContent(content)) throw new Error("A template needs some text.");
  return localEntities.TextTemplate.create({
    title: cleanTitle(title, content),
    content: String(content),
    folder_id: folderId || null,
    sort_order: Date.now(),
  });
}

// Only the fields given are written, onto a fresh read.
export async function updateTextTemplate(id, { title, content, folderId } = {}) {
  const fresh = await localEntities.TextTemplate.get(id).catch(() => null);
  if (!fresh) throw new Error("That template isn't here any more.");
  const patch = {};
  const nextContent = content !== undefined ? String(content) : fresh.content;
  if (content !== undefined) {
    if (isBlankContent(content)) throw new Error("A template needs some text.");
    patch.content = nextContent;
  }
  if (title !== undefined) patch.title = cleanTitle(title, nextContent);
  if (folderId !== undefined) patch.folder_id = folderId || null;
  if (!Object.keys(patch).length) return fresh;
  return localEntities.TextTemplate.update(id, patch);
}

export async function deleteTextTemplate(id) {
  return localEntities.TextTemplate.delete(id);
}

// ── Folders ─────────────────────────────────────────────────────────────────

export async function createTemplateFolder({ name = "", parentId = null } = {}) {
  const n = String(name || "").trim().slice(0, TITLE_MAX) || "New folder";
  return localEntities.TextTemplateFolder.create({ name: n, parent_id: parentId || null, sort_order: Date.now() });
}

export async function updateTemplateFolder(id, { name, parentId } = {}) {
  const patch = {};
  if (name !== undefined) patch.name = String(name || "").trim().slice(0, TITLE_MAX) || "Folder";
  if (parentId !== undefined) {
    const folders = await listTemplateFolders();
    if (wouldNestFolder(id, parentId, folders)) throw new Error("A folder can't go inside itself.");
    patch.parent_id = parentId || null;
  }
  if (!Object.keys(patch).length) return null;
  return localEntities.TextTemplateFolder.update(id, patch);
}

// The folder goes to the trash; whatever was inside moves up to its parent.
export async function deleteTemplateFolder(id) {
  const [folders, templates] = await Promise.all([listTemplateFolders(), listTextTemplates()]);
  const map = indexFolders(folders);
  const folder = map.get(id);
  if (!folder) return;
  const parentId = effectiveParentId(folder, map);
  await withTrashBatch(async () => {
    for (const t of templates.filter((x) => x.folder_id === id)) {
      await localEntities.TextTemplate.update(t.id, { folder_id: parentId });
    }
    for (const f of folders.filter((x) => x.parent_id === id && x.id !== id)) {
      await localEntities.TextTemplateFolder.update(f.id, { parent_id: parentId });
    }
    await localEntities.TextTemplateFolder.delete(id);
  });
}
