// The page's own background (v0.310.0) — drawn on every page that has one
// in SystemSettings.page_looks (pageLooks.js). Mounted once inside
// AppLayout's <main> (its `isolate` context), so the fixed -z-10 layer
// sits behind the page's content and above the app background, exactly
// where the home board paints its own. The home page and the profile pages
// draw their own backgrounds, so this renders nothing there.
import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import PageBackground, { resolveBackground } from "@/components/v2/PageBackground";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { pageForPath, readPageLook } from "@/lib/pageLooks";
import { pickPrimarySystemSettings } from "@/lib/systemSettingsSingleton";

export default function PageLookHost() {
  const location = useLocation();
  const page = useMemo(() => pageForPath(location.pathname), [location.pathname]);
  const { data: rows = [] } = useQuery({ queryKey: ["systemSettings"], queryFn: () => base44.entities.SystemSettings.list() });
  const look = readPageLook(pickPrimarySystemSettings(rows), page?.id);
  const raw = useMemo(() => resolveBackground(look?.background), [look?.background]);
  // A folder rotates the picture on each app open, like the home board.
  const pick = useRotatingImageUrl({
    folder: raw.image.folder || "",
    mode: raw.image.mode || "random",
    scope: `page:${page?.id || ""}`,
    fallbackUrl: raw.image.url || "",
  });
  if (!page || !look) return null;
  const background = raw.type === "image" && raw.image.folder
    ? { ...raw, image: { ...raw.image, url: pick || raw.image.url } }
    : raw;
  return (
    <>
      <PageBackground background={background} />
      {background.audio?.ref && <ProfileSongPlayer song={background.audio} />}
    </>
  );
}
