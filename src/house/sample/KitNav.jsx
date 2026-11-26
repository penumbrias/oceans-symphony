// The kit's story sheets, linked from each other (/house/kit is the first).
// Unlinked from the app itself while the kit is being built.
import React from "react";
import { Link, useLocation } from "react-router-dom";

const SHEETS = [
  { to: "/house/kit", label: "Tokens and scales" },
  { to: "/house/kit/controls", label: "Controls and pickers" },
  { to: "/house/kit/panels", label: "Panels, content and sheets" },
];

export default function KitNav() {
  const { pathname } = useLocation();
  return (
    <nav aria-label="The kit's story sheets" className="kit-nav">
      <Link to="/" className="house-text-sm kit-link">Back to the app</Link>
      {SHEETS.map((s) => (
        <Link key={s.to} to={s.to} className="house-text-sm kit-link" aria-current={pathname === s.to ? "page" : undefined}>{s.label}</Link>
      ))}
    </nav>
  );
}
