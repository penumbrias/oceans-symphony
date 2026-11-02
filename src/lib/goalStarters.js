// Ready-made goal pages (v0.340.0). "Start it as a story" makes a page whose
// new sections are chapters, with a first chapter and plain sections for the
// characters, places and lore that go with it. Everything it makes is an
// ordinary page or section the person can rename, move or delete.

import { createPage } from "@/lib/goalTree";

const STORY_SECTIONS = [
  { title: "Characters", icon: "🧑" },
  { title: "Places", icon: "🗺️" },
  { title: "Lore and notes", icon: "📜" },
];

export async function createStoryPage({ title, order = null } = {}) {
  const story = await createPage({
    title: String(title || "").trim() || "My story", order,
    icon: "📖", view: "outline", child_section_style: "chapter",
  });
  await createPage({ title: "Chapter one", parent_id: story.id, order: 1, status: null, section_style: "chapter" });
  let n = 2;
  for (const s of STORY_SECTIONS) {
    await createPage({ title: s.title, icon: s.icon, parent_id: story.id, order: n, status: null });
    n += 1;
  }
  return story;
}
