// "Profile style" (v0.310.0) — the one door from a profile's forms
// to its look, which has its own sheet (ProfileLookSheet, ProfileLookTabs):
// colours, pictures, fonts, the song and the header.
import React from "react";
import { Palette } from "lucide-react";
import { Row } from "@/components/shared/SettingRows";
import { openProfileLook } from "@/lib/lookSubject";

export default function PageLookRow({ hint = "Colours, pictures, fonts, the song and the header" }) {
  return (
    <Row label="Profile style" hint={hint}>
      <button type="button" onClick={openProfileLook} data-page-look-open=""
        className="h-8 px-3 rounded-lg border border-border/60 text-xs hover:bg-muted/40 flex items-center gap-1.5">
        <Palette className="w-3.5 h-3.5" /> Open…
      </button>
    </Row>
  );
}
