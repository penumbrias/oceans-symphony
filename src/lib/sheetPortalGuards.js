// Sheets (vaul drawers, built on Radix Dialog) trap focus and treat
// anything outside their content as "dismiss/refocus" territory. Pickers
// that PORTAL to <body> (SearchableSelect dropdowns, AnchoredPortal
// popovers) render outside the sheet by design — without these guards the
// sheet steals focus back the instant you tap their search box, so you
// can't type ("can't type in Add a link" bug). Spread onto DrawerContent.

const PORTAL_SELECTOR = "[data-searchable-dropdown], [data-anchored-portal], [data-color-picker-popover]";

const guard = (e) => {
  const t = e.detail?.originalEvent?.target || e.target;
  if (t?.closest?.(PORTAL_SELECTOR)) e.preventDefault();
};

export const sheetPortalGuards = {
  onFocusOutside: guard,
  onPointerDownOutside: guard,
  onInteractOutside: guard,
};
