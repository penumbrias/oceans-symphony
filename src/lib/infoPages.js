// Standard pages (v0.322.0). A Field widget set to "Pages" shows each entry
// as a tab you can swipe to — the bio first, then pages like Backstory.
// These are the ready-made page names offered by "Add a page"; each one is
// a long-text entry kept in that alter's or group's info, so it's there in
// Info even when no widget shows it. A blank page takes any name.

export const STANDARD_PAGES = {
  alter: ["About me", "Backstory", "Likes & dislikes", "How to help me", "Comforts", "Goals", "Things to know"],
  group: ["Purpose", "History", "Agreements", "How to help us", "Things to know"],
};

export const standardPagesFor = (type) => STANDARD_PAGES[type] || [];

// A page is long text; any other kind of entry still works as a page.
export const PAGE_KIND = "richtext";
