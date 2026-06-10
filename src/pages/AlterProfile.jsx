import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, User, IdCard, MessageSquare, TrendingUp, FileText, SlidersHorizontal, Pencil, Eye, Save, Mail, GitMerge, Pin, Link2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, profileSurfaceCss, profileThemeCss } from "@/lib/profileStyle";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { migrateAlterCustomFieldsObject, needsAlterCustomFieldsMigration } from "@/lib/alterCustomFieldsMigration";

import ProfileTab from "@/components/alters/profile/ProfileTab";
import InfoTab from "@/components/alters/profile/InfoTab";
import HistoryTab from "@/components/alters/profile/HistoryTab";
import NotesTab from "@/components/alters/profile/NotesTab";
import MessagesTab from "@/components/alters/profile/MessagesTab";
import PrivateMessagesTab from "@/components/alters/profile/PrivateMessagesTab";
import OptionsTab from "@/components/alters/profile/OptionsTab";
import LineageTab from "@/components/alters/profile/LineageTab";
import RelationshipsTab from "@/components/alters/profile/RelationshipsTab";
import LocationsTab from "@/components/alters/profile/LocationsTab";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "info", label: "Info", icon: IdCard },
  { id: "messages", label: "Board", icon: MessageSquare },
  { id: "private-messages", label: "Messages", icon: Mail },
  { id: "history", label: "History", icon: TrendingUp },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "lineage", label: "Lineage", icon: GitMerge },
  { id: "relationships", label: "Relationships", icon: Link2 },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "options", label: "Options", icon: SlidersHorizontal },
];

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_IMAGE_KEY = "_header_image";
const HEADER_BG_KEY = "_header_bg_color";
const HEADER_FONT_KEY = "_header_font";
const SECTION_BG_KEY = "_section_bg_opacity";
const PAGE_TEXT_KEY = "_page_text_color";
const PAGE_FONT_KEY = "_page_font";

function getContrastColor(hex) {
  if (!hex) return "#ffffff";
  const clean = hex.replace("#", "");
  if (clean.length < 6) return "#ffffff";
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterProfileFallback({ error, reset }) {
  const msg = (error && (error.message || String(error))) || "Unknown error";
  const stack = (error && error.stack) || "";
  return (
    <div className="p-4 space-y-3">
      <Link to="/Home">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to {`alters`}
        </Button>
      </Link>
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-destructive">Something went wrong loading this alter</p>
        <p className="text-xs text-foreground/90 break-words">{msg}</p>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Show details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[10px] leading-snug">{stack}</pre>
        </details>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={reset}>Try again</Button>
          <Link to="/Home"><Button size="sm">Go back</Button></Link>
        </div>
      </div>
    </div>
  );
}

function AlterProfileInner() {
  const { id: alterId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    const valid = ["profile", "info", "messages", "private-messages", "history", "notes", "lineage", "relationships", "locations", "options"];
    return valid.includes(t) ? t : "profile";
  });
  const highlightMessageId = searchParams.get("messageId") || null;
  const [editMode, setEditMode] = useState(false);

  // Keep tab in sync when the URL ?tab= param changes (e.g. tour navigation)
  useEffect(() => {
    const t = searchParams.get("tab");
    const valid = ["profile", "info", "messages", "private-messages", "history", "notes", "lineage", "relationships", "locations", "options"];
    if (t && valid.includes(t)) setTab(t);
  }, [searchParams]);
  const [showComposeMessage, setShowComposeMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [resolvedHeaderImage, setResolvedHeaderImage] = useState(null);
  const [resolvedBgImage, setResolvedBgImage] = useState(null);
  const saveRef = useRef(null);

  const queryClient = useQueryClient();
  const { data: alter, isLoading } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(alterId)) || null;
    },
    enabled: !!alterId,
    staleTime: 0,
  });

  // Recolour the APP-HEADER wave to this profile's wave colour while it's open.
  // _theme_wave is either a concrete colour (custom hex) or a var(--color-…)
  // reference to one of the profile's palette colours; resolve the reference
  // against the live .os-pf theme so the header (outside .os-pf) gets a concrete
  // colour. Cleared on unmount so other pages keep the global wave.
  const profileWaveRaw = alter?.custom_fields?.["_theme_wave"];
  useEffect(() => {
    if (!profileWaveRaw) { setPageWaveOverride(null); return () => setPageWaveOverride(null); }
    let color = profileWaveRaw;
    const m = typeof profileWaveRaw === "string" && profileWaveRaw.match(/^var\((--[\w-]+)\)/);
    if (m) {
      const el = document.querySelector(".os-pf");
      color = el ? getComputedStyle(el).getPropertyValue(m[1]).trim() : "";
    }
    setPageWaveOverride(color || null);
    return () => setPageWaveOverride(null);
  }, [profileWaveRaw]);

  // Lazy one-shot migration: if this alter still has object-shape
  // data on the legacy alter_custom_fields field, fold it into
  // alter.custom_fields and clear the legacy field. Idempotent,
  // runs at most once per alter (the next render reads the migrated
  // record and the predicate is false).
  useEffect(() => {
    if (!alter) return;
    if (!needsAlterCustomFieldsMigration(alter)) return;
    let cancelled = false;
    (async () => {
      try {
        await migrateAlterCustomFieldsObject(alter);
        if (cancelled) return;
        queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
        queryClient.invalidateQueries({ queryKey: ["alters"] });
      } catch { /* non-fatal — the defensive Array.isArray reads keep the page rendering */ }
    })();
    return () => { cancelled = true; };
  }, [alter, queryClient]);

  // Resolve avatar URL (local or external)
  useEffect(() => {
    if (alter?.avatar_url) {
      resolveImageUrl(alter.avatar_url).then(setAvatarSrc);
    } else {
      setAvatarSrc(null);
    }
  }, [alter?.avatar_url]);

  // Resolve header image URL
  useEffect(() => {
    const img = alter?.custom_fields?.[HEADER_IMAGE_KEY];
    if (img) resolveImageUrl(img).then(setResolvedHeaderImage).catch(() => setResolvedHeaderImage(null));
    else setResolvedHeaderImage(null);
  }, [alter?.custom_fields?.[HEADER_IMAGE_KEY]]);

  // Resolve page background image URL. Like the header above, this MUST go
  // through resolveImageUrl — a raw local-image:// (legacy) value can't be
  // consumed by a CSS background-image, which is why some backgrounds showed
  // up in the header but never behind the page.
  useEffect(() => {
    const img = alter?.custom_fields?.[BG_IMAGE_KEY];
    if (img) resolveImageUrl(img).then(setResolvedBgImage).catch(() => setResolvedBgImage(null));
    else setResolvedBgImage(null);
  }, [alter?.custom_fields?.[BG_IMAGE_KEY]]);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: systemFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!alter) {
    return (
      <div className="text-center py-24">
        <p className="text-muted-foreground">Alter not found</p>
        <Link to="/Home"><Button variant="outline" className="mt-4">Go back</Button></Link>
      </div>
    );
  }

  const hasColor = alter.color && alter.color.length > 3;
  const alterColor = hasColor ? alter.color : null;
  const textOnColor = hasColor ? getContrastColor(alter.color) : null;

  const cf = alter.custom_fields || {};
  const ps = readProfileBg(cf);
  const pageBgColor = ps.bgColor;
  const pageBgImage = ps.bgImage;
  const pageBgOpacity = ps.bgOpacity;       // image:0.5 / colour:0.15 default
  const readability = ps.readability;        // _bg_color tint over image (0.1 default)
  const headerOpacity = ps.headerOpacity;    // header image opacity (0.45 default)
  const pageHeaderImage = cf[HEADER_IMAGE_KEY] || "";
  const pageTextColor = cf[PAGE_TEXT_KEY] || "";
  const pageFont = fontStackFor(cf[PAGE_FONT_KEY]);
  // Header bg colour with its own opacity baked in (rgba) — so the header
  // colour can be made translucent independently of the body.
  const pageHeaderBgColor = ps.headerBgColorWithAlpha || cf[HEADER_BG_KEY] || "";
  const headerFont = fontStackFor(cf[HEADER_FONT_KEY]);
  const hasPageBg = ps.hasPageBg;
  const surfaceCss = profileSurfaceCss("os-pf", cf);
  const themeCss = profileThemeCss("os-pf", cf);

  const sortedAlters = [...alters].filter(a => !a.is_archived).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const currentIndex = sortedAlters.findIndex(a => a.id === alter.id);
  const prevAlter = currentIndex > 0 ? sortedAlters[currentIndex - 1] : null;
  const nextAlter = currentIndex >= 0 && currentIndex < sortedAlters.length - 1 ? sortedAlters[currentIndex + 1] : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="relative min-h-screen"
    >
      {hasPageBg && (
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
          {pageBgImage && resolvedBgImage ? (
            <>
              {/* SOLID full-opacity base layer of _bg_color UNDER the image, so
                  lowering the image opacity reveals the colour beneath it (and
                  the profile's bg colour takes precedence over the app page bg
                  for this page). */}
              {pageBgColor && (
                <div className="absolute inset-0" style={{ backgroundColor: pageBgColor }} />
              )}
              {/* Image on top at its own opacity. */}
              <div className="absolute inset-0" style={{
                backgroundImage: `url("${resolvedBgImage}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                opacity: pageBgOpacity,
              }} />
            </>
          ) : pageBgColor ? (
            <div className="absolute inset-0" style={{ backgroundColor: pageBgColor, opacity: pageBgOpacity }} />
          ) : null}
        </div>
      )}

      {pageTextColor && (
        <style>{`.apc .text-foreground{color:${pageTextColor}}.apc .text-muted-foreground{color:${pageTextColor}99}.apc .text-muted-foreground\\/70{color:${pageTextColor}66}`}</style>
      )}
      {/* Per-profile theme palette — overrides the app's --color-* variables
          for this profile's pages (view + edit), so every card/text/button
          inside .os-pf adopts the profile's colours. */}
      {themeCss && <style>{themeCss}</style>}
      {/* With a bg image, _bg_color fills the surfaces (cards + entry windows),
          in both view and edit mode — never the whole page. */}
      {surfaceCss && <style>{surfaceCss}</style>}
      <div className={cn("relative z-10 os-pf", pageTextColor && "apc")} style={{ ...(pageTextColor ? { color: pageTextColor } : {}), ...(pageFont ? { fontFamily: pageFont } : {}) }}>
        {/* Header row: pin toggle on the left (the app header already
            provides Back, so the page-level Back was removed); Prev/Next
            + message button on the right. data-pf-chrome backs this row with
            the profile bg colour when a background image is set, so the
            ghost/outline buttons stay legible over the image. */}
        <div data-pf-chrome className="flex items-center justify-between mb-4 px-2 py-1.5">
          <button
            type="button"
            onClick={async () => {
              try {
                await base44.entities.Alter.update(alter.id, { is_pinned: !alter.is_pinned });
                queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
                queryClient.invalidateQueries({ queryKey: ["alters"] });
                toast.success(alter.is_pinned ? `${alter.name} unpinned` : `${alter.name} pinned to top`);
              } catch (e) {
                toast.error(e?.message || "Failed to update pin");
              }
            }}
            aria-pressed={!!alter.is_pinned}
            title={alter.is_pinned ? "Unpin from top of the alters page" : "Pin to top of the alters page"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium transition-colors flex-shrink-0",
              alter.is_pinned
                ? "text-primary bg-primary/10 hover:bg-primary/15"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <Pin className={cn("w-4 h-4", alter.is_pinned && "fill-primary")} />
            {alter.is_pinned ? "Pinned" : "Pin"}
          </button>
          <div className="flex items-center gap-2">
            {prevAlter && (
              <Link to={`/alter/${prevAlter.id}`}>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Prev
                </Button>
              </Link>
            )}
            {nextAlter && (
              <Link to={`/alter/${nextAlter.id}`}>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  Next
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            )}
            {tab !== "profile" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Switch to the private-messages tab and signal it to
                  // open the compose form via a URL param. Replaces the
                  // old setShowComposeMessage state that had no listener.
                  const params = new URLSearchParams(searchParams);
                  params.set("tab", "private-messages");
                  params.set("compose", "1");
                  setSearchParams(params, { replace: true });
                }}
                className="gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" /> Message
              </Button>
            )}
            {tab === "profile" && (
              <div className="flex items-center gap-2">
                {editMode && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => saveRef.current?.()}
                    className="gap-1.5 bg-primary hover:bg-primary/90"
                  >
                    <Save className="w-3.5 h-3.5" /> Save
                  </Button>
                )}
                <Button
                  data-tour="alter-profile-edit-btn"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(e => !e)}
                  className="gap-1.5"
                >
                  {editMode ? <><Eye className="w-3.5 h-3.5" /> View</> : <><Pencil className="w-3.5 h-3.5" /> Edit</>}
                </Button>
              </div>
            )}
          </div>
        </div>

          {tab !== "profile" && (
          <div
            className="rounded-2xl p-4 mb-5 flex items-center gap-4 relative overflow-hidden"
            style={{
              background: pageHeaderBgColor
                ? pageHeaderBgColor
                : alterColor
                  ? `linear-gradient(135deg, ${alterColor}22, ${alterColor}08)`
                  : "hsl(var(--muted)/0.3)",
              borderLeft: alterColor ? `4px solid ${alterColor}` : "4px solid hsl(var(--primary))",
            }}
          >
            {resolvedHeaderImage && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage: `url("${resolvedHeaderImage}")`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  opacity: headerOpacity,
                }}
              />
            )}
            <div
              className="w-14 h-14 rounded-xl border-2 border-border/60 overflow-hidden flex-shrink-0 relative z-10"
              style={{ backgroundColor: alterColor || "hsl(var(--muted))" }}
            >
              {avatarSrc ? (
                <img src={avatarSrc} alt={alter.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center" style={{ color: textOnColor || "hsl(var(--muted-foreground))" }}>
                  <User className="w-7 h-7" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 relative z-10" style={headerFont ? { fontFamily: headerFont } : undefined}>
              <h1 className="font-display text-xl font-semibold text-foreground">{alter.name}</h1>
              {alter.pronouns && !(alter.name || "").toLowerCase().includes(alter.pronouns.toLowerCase()) && (
                <p className="text-sm text-muted-foreground">{alter.pronouns}</p>
              )}
              {alter.role && <p className="text-xs text-muted-foreground/70 mt-0.5">{alter.role}</p>}
              {alter.origin_year && <p className="text-xs text-muted-foreground/60 mt-0.5">Since {alter.origin_year}</p>}
            </div>
          </div>
        )}

        <div data-tour="alter-profile-tabs" data-pf-chrome className="flex items-center gap-1 overflow-x-auto pb-1 mb-5 scrollbar-none px-1.5 py-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id !== "profile") setEditMode(false); }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-shrink-0",
                  tab === t.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        <div>
          {tab === "profile" && (
            <ProfileTab
              alter={alter}
              editMode={editMode}
              onEditModeChange={setEditMode}
              systemFields={systemFields}
              saveRef={saveRef}
            />
          )}
          {tab === "info" && <InfoTab alter={alter} systemFields={systemFields} />}
          {tab === "messages" && <MessagesTab alterId={alter.id} alters={alters} />}
          {tab === "private-messages" && <PrivateMessagesTab alterId={alter.id} alters={alters} highlightMessageId={highlightMessageId} autoOpenCompose={searchParams.get("compose") === "1"} />}
          {tab === "history" && <HistoryTab alterId={alter.id} />}
          {tab === "notes" && <NotesTab alterId={alter.id} />}
          {tab === "lineage" && <LineageTab alterId={alter.id} />}
          {tab === "relationships" && <RelationshipsTab alter={alter} alters={alters} />}
          {tab === "locations" && <LocationsTab alter={alter} />}
          {tab === "options" && <OptionsTab alter={alter} />}
        </div>
      </div>
    </motion.div>
  );
}

export default function AlterProfile() {
  // Wrap the page in an error boundary so a render-time crash
  // (most commonly a malformed FrontingSession payload for a
  // currently-fronting alter) shows the actual error text + a
  // way back to the alters list, instead of leaving the user
  // staring at a blank black screen with no path home.
  const { id: alterId } = useParams();
  return (
    <ErrorBoundary fallback={(error, reset) => <AlterProfileFallback error={error} reset={reset} />} resetKeys={[alterId]}>
      <AlterProfileInner />
    </ErrorBoundary>
  );
}