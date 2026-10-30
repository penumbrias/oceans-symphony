import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, User, IdCard, MessageSquare, TrendingUp, FileText, SlidersHorizontal, Pencil, Eye, Save, Mail, GitMerge, Pin, Link2, MapPin, BookOpen, Zap, Heart, BarChart3, Network, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";
import { useRotatingImageUrl } from "@/lib/imageRotation";
import { fontStackFor } from "@/lib/profileFonts";
import { readProfileBg, profileSurfaceCss, profileThemeCss } from "@/lib/profileStyle";
import { setPageWaveOverride } from "@/lib/pageWaveOverride";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { migrateAlterCustomFieldsObject, needsAlterCustomFieldsMigration } from "@/lib/alterCustomFieldsMigration";
import { useTerms } from "@/lib/useTerms";
import { FrontingToggleButton } from "@/components/alters/AlterCard";

import ProfileTab from "@/components/alters/profile/ProfileTab";
import AlterInfo from "@/components/alters/info/AlterInfo";
import ProfileSongPlayer from "@/components/alters/ProfileSongPlayer";
import { PS } from "@/lib/profileStyle";
// The profile is a widget board (v0.290.0): the same canvas as the home
// screen, one page per tab, every section a widget (src/v2/profileWidgets).
// The layout lives in a ProfileBoard row once the person edits it; until
// then the page renders the seeded board, which is today's page. The host
// (ProfileBoardCanvas) is shared with the group, contact and location pages.
import ProfileBoardCanvas, { useProfilePageState, openProfileLayoutEditor } from "@/components/profile/ProfileBoardCanvas";
import { useRegisterLookSubject } from "@/lib/lookSubject";
import { useLookDefaults, withLookDefaults } from "@/lib/profileLookDefaults";
import { profilePageId, ALTER_PROFILE_PAGES, NEW_ALTER_PROFILE_PAGES, NEW_PROFILE_TAB_ALIASES, usesNewProfile, layoutSuffixFor } from "@/lib/profileBoard";
import NewProfileOffer from "@/components/alters/NewProfileOffer";

// The icon each tab's page shows in the page strip (by page id).
const PAGE_ICONS = {
  [profilePageId("profile")]: User,
  [profilePageId("info")]: IdCard,
  [profilePageId("messages")]: MessageSquare,
  [profilePageId("private-messages")]: Mail,
  [profilePageId("history")]: TrendingUp,
  [profilePageId("notes")]: FileText,
  [profilePageId("wishlist")]: Heart,
  [profilePageId("journal")]: BookOpen,
  [profilePageId("lineage")]: GitMerge,
  [profilePageId("relationships")]: Link2,
  [profilePageId("locations")]: MapPin,
  [profilePageId("activities")]: Zap,
  [profilePageId("options")]: SlidersHorizontal,
};

// The new profile's seven pages (v0.305.0).
const NEW_PAGE_ICONS = {
  [profilePageId("profile")]: User,
  [profilePageId("fronting")]: BarChart3,
  [profilePageId("fields")]: ListChecks,
  [profilePageId("messages")]: Mail,
  [profilePageId("notes")]: FileText,
  [profilePageId("journal")]: BookOpen,
  [profilePageId("wishes")]: Heart,
  [profilePageId("connections")]: Network,
};

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
  // The page showing on the board. ?tab= opens a page (today's deep links,
  // the tour, notifications); the board reports the page it is on so the
  // URL stays in step and the header knows whether this is the Profile page.
  // The page state is set up before the record has loaded, so which pages
  // (classic or the new profile) follows the record once it's here.
  const queryClient = useQueryClient();
  const cachedAlter = queryClient.getQueryData(["alter", alterId]);
  const [onNewLayout, setOnNewLayout] = useState(() => usesNewProfile(cachedAlter));
  const page = useProfilePageState(onNewLayout ? NEW_ALTER_PROFILE_PAGES : ALTER_PROFILE_PAGES,
    { aliases: onNewLayout ? NEW_PROFILE_TAB_ALIASES : null });
  const { searchParams, setSearchParams, layoutEditing, onFirstPage: onProfilePage } = page;
  // false = the board · "info" = the Alter info list (the pencil, v0.294.0)
  // · "classic" = the old pencil form, kept for page style and header
  // options until those move onto the board.
  const [editMode, setEditMode] = useState(false);
  // Alter info while the page layout is being edited (v0.320.0): the board
  // keeps its unsaved layout, so the list opens over it instead of in
  // place of it.
  const [infoOverlay, setInfoOverlay] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [resolvedHeaderImage, setResolvedHeaderImage] = useState(null);
  const [resolvedBgImage, setResolvedBgImage] = useState(null);
  const saveRef = useRef(null);

  const terms = useTerms();
  const { data: alter, isLoading } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(alterId)) || null;
    },
    enabled: !!alterId,
    staleTime: 0,
  });

  useEffect(() => { if (alter) setOnNewLayout(usesNewProfile(alter)); }, [alter]);
  // Display options offers this alter's look while the page is open
  // (v0.310.0 — the profile scope, ProfileLookTabs).
  useRegisterLookSubject("alter", alter, alter?.name);
  // What the page DRAWS: the alter's own look over the defaults for new
  // and empty alter profiles (profileLookDefaults.js). Forms and the look
  // sheet keep the raw record.
  const lookCf = withLookDefaults(alter?.custom_fields, useLookDefaults("alter"));

  // Whether this alter is currently fronting. The header's Front button is
  // the standard front control (tap = on at the top level / adjust, hold =
  // the level rail), so it behaves like the alters list and the bars.
  const { data: activeSessions = [] } = useQuery({
    queryKey: ["activeFront"],
    queryFn: () => base44.entities.FrontingSession.filter({ is_active: true }),
  });
  const isFronting = !!alter && activeSessions.some((s) => s.alter_id === alter.id);

  // Recolour the APP-HEADER wave to this profile's wave colour while it's open.
  // _theme_wave is either a concrete colour (custom hex) or a var(--color-…)
  // reference to one of the profile's palette colours; resolve the reference
  // against the live .os-pf theme so the header (outside .os-pf) gets a concrete
  // colour. Cleared on unmount so other pages keep the global wave.
  const profileWaveRaw = lookCf["_theme_wave"];
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

  // Avatar / background may rotate through a per-alter image pool (set up
  // via the profile editors) instead of showing one fixed image — resolve
  // through useRotatingImageUrl first, which is a no-op passthrough of the
  // fixed value when rotation isn't turned on.
  const rotatingAvatarUrl = useRotatingImageUrl({ alterId: alter?.id, role: "avatar", mode: alter?.avatar_rotation_mode, fallbackUrl: alter?.avatar_url, alter });
  const rotatingBgUrl = useRotatingImageUrl({ alterId: alter?.id, role: "background", mode: alter?.custom_fields?.[PS.BG_ROTATION], fallbackUrl: lookCf[PS.BG_IMAGE], alter });

  // Resolve avatar URL (local or external)
  useEffect(() => {
    if (rotatingAvatarUrl) {
      resolveImageUrl(rotatingAvatarUrl).then(setAvatarSrc);
    } else {
      setAvatarSrc(null);
    }
  }, [rotatingAvatarUrl]);

  // Resolve header image URL
  useEffect(() => {
    const img = lookCf[PS.HEADER_IMAGE];
    if (img) resolveImageUrl(img).then(setResolvedHeaderImage).catch(() => setResolvedHeaderImage(null));
    else setResolvedHeaderImage(null);
  }, [lookCf[PS.HEADER_IMAGE]]);

  // Resolve page background image URL. Like the header above, this MUST go
  // through resolveImageUrl — a raw local-image:// (legacy) value can't be
  // consumed by a CSS background-image, which is why some backgrounds showed
  // up in the header but never behind the page.
  useEffect(() => {
    if (rotatingBgUrl) resolveImageUrl(rotatingBgUrl).then(setResolvedBgImage).catch(() => setResolvedBgImage(null));
    else setResolvedBgImage(null);
  }, [rotatingBgUrl]);

  const { data: alters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const { data: systemFields = [] } = useQuery({
    queryKey: ["customFields"],
    queryFn: () => base44.entities.CustomField.list("order"),
  });

  const boardApi = React.useMemo(() => ({ alters }), [alters]);

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

  const cf = lookCf;
  const ps = readProfileBg(cf);
  const pageBgColor = ps.bgColor;
  const pageBgOpacity = ps.bgOpacity;       // image:0.5 / colour:0.15 default
  const readability = ps.readability;        // _bg_color tint over image (0.1 default)
  const headerOpacity = ps.headerOpacity;    // header image opacity (0.45 default)
  const pageHeaderImage = cf[PS.HEADER_IMAGE] || "";
  const pageTextColor = cf[PS.PAGE_TEXT] || "";
  const pageFont = fontStackFor(cf[PS.PAGE_FONT]);
  // Header bg colour with its own opacity baked in (rgba) — so the header
  // colour can be made translucent independently of the body.
  const pageHeaderBgColor = ps.headerBgColorWithAlpha || cf[PS.HEADER_BG] || "";
  const headerFont = fontStackFor(cf[PS.HEADER_FONT]);
  // A rotation-only setup (pool populated but no fixed _bg_image ever set)
  // still counts as "has a background" — readProfileBg doesn't know about
  // rotation, so OR in the rotated pick's presence locally.
  const hasPageBg = ps.hasPageBg || !!rotatingBgUrl;
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
      {/* Profile song — plays on open (MySpace style), floating mini-player,
          global toggle in Settings → {Alter} setup. Unmounts (and stops) on
          navigation away. */}
      {/* Either source: the alter's own field, or one set through the
          shared profile-style editor (which every profile page has). */}
      {(alter?.profile_song?.ref || cf[PS.SONG]?.ref) && (
        <ProfileSongPlayer song={alter?.profile_song?.ref ? alter.profile_song : cf[PS.SONG]} />
      )}
      {hasPageBg && (
        <div className="fixed inset-0 pointer-events-none z-0" aria-hidden>
          {resolvedBgImage ? (
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
        {/* Header row (v0.310.0): getting around on the left (previous,
            next, pin), doing things on the right, each with a word under
            its icon so nothing has to be guessed — Front (the same tap /
            hold control as everywhere else, so the level rail works
            here too), Info (everything about them), Edit page (the
            layout). data-pf-chrome backs this row with the profile bg
            colour when a background image is set, so the buttons stay
            legible over it. */}
        <div data-pf-chrome data-profile-header-actions="" className="flex flex-wrap items-center justify-between gap-y-2 mb-4 px-1 py-1.5">
          <div className="flex items-center gap-0.5">
            {prevAlter ? (
              <Link to={`/alter/${prevAlter.id}`} aria-label={`Previous ${terms.alter}: ${prevAlter.name}`} title={`Previous ${terms.alter}: ${prevAlter.name}`}
                className="w-8 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : <span className="w-8 h-10" aria-hidden="true" />}
            {nextAlter ? (
              <Link to={`/alter/${nextAlter.id}`} aria-label={`Next ${terms.alter}: ${nextAlter.name}`} title={`Next ${terms.alter}: ${nextAlter.name}`}
                className="w-8 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50">
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : <span className="w-8 h-10" aria-hidden="true" />}
            <button
              type="button"
              onClick={async () => {
                try {
                  await base44.entities.Alter.update(alter.id, { is_pinned: !alter.is_pinned });
                  queryClient.invalidateQueries({ queryKey: ["alter", alter.id] });
                  queryClient.invalidateQueries({ queryKey: ["alters"] });
                  toast.success(alter.is_pinned ? `${alter.name} unpinned` : `${alter.name} pinned to the top of the ${terms.alters} page`);
                } catch (e) {
                  toast.error(e?.message || "Failed to update pin");
                }
              }}
              aria-pressed={!!alter.is_pinned}
              aria-label={alter.is_pinned ? `Unpin from the top of the ${terms.alters} page` : `Pin to the top of the ${terms.alters} page`}
              title={alter.is_pinned ? `Unpin from the top of the ${terms.alters} page` : `Pin to the top of the ${terms.alters} page`}
              className={cn(
                "w-8 h-10 flex items-center justify-center rounded-lg transition-colors",
                alter.is_pinned ? "text-primary bg-primary/10 hover:bg-primary/15" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <Pin className={cn("w-4 h-4", alter.is_pinned && "fill-primary")} />
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {!layoutEditing && (
              <FrontingToggleButton alter={alter} activeSessions={activeSessions} label={isFronting ? `In ${terms.front}` : terms.Front} />
            )}
            {!onProfilePage && !layoutEditing && !editMode && (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-2.5 gap-1.5"
                onClick={() => {
                  // Open the Messages page with its compose form (the page
                  // reads ?compose=1).
                  const params = new URLSearchParams(searchParams);
                  params.set("tab", onNewLayout ? "messages" : "private-messages");
                  params.set("compose", "1");
                  setSearchParams(params, { replace: true });
                }}
                aria-label="Message"
                title={`Message ${alter.name}`}
              >
                <Mail className="w-3.5 h-3.5" />
              </Button>
            )}
            {!layoutEditing && editMode === "classic" && (
              <Button
                variant="default"
                size="sm"
                onClick={() => saveRef.current?.()}
                className="h-9 px-2.5 gap-1.5 bg-primary hover:bg-primary/90"
                title="Save"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </Button>
            )}
            {(
              <Button
                data-tour="alter-profile-edit-btn"
                variant={editMode ? "default" : "outline"}
                size="sm"
                className="h-9 px-2.5 gap-1.5"
                onClick={() => (layoutEditing ? setInfoOverlay(true) : setEditMode(e => (e ? false : "info")))}
                aria-pressed={!!editMode}
                title={editMode ? `Back to ${alter.name}'s page` : `Everything about ${alter.name}: name, pronouns, bio, entries, pictures, groups…`}
              >
                {editMode ? <Eye className="w-3.5 h-3.5" /> : <IdCard className="w-3.5 h-3.5" />}
                {editMode ? "Done" : "Info"}
              </Button>
            )}
            {!editMode && !layoutEditing && (
              <Button
                data-tour="alter-profile-layout-btn"
                variant="outline"
                size="sm"
                className="h-9 w-9 px-0"
                onClick={openProfileLayoutEditor}
                title="Edit page — move, resize and add widgets, and change what's shown"
                aria-label="Edit page"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

          {!onProfilePage && (
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

        <Dialog open={layoutEditing && infoOverlay} onOpenChange={setInfoOverlay}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto p-3" data-alter-info-overlay="">
            <DialogTitle className="sr-only">{alter.name} · info</DialogTitle>
            {layoutEditing && infoOverlay && <AlterInfo alter={alter} />}
          </DialogContent>
        </Dialog>
        {editMode === "info" ? (
          // The one list where the alter's information is entered (the
          // garden model, v0.294.0); widgets on the board show it.
          <AlterInfo alter={alter} onOpenClassic={() => setEditMode("classic")} />
        ) : editMode === "classic" ? (
          // The old pencil form, kept behind Alter info's ⋯ menu (v0.298.0)
          // for anyone who still wants it. Its Save writes only what changed
          // (saveAlterEdits).
          <ProfileTab
            alter={alter}
            onEditModeChange={setEditMode}
            saveRef={saveRef}
          />
        ) : (
          <>
            {onProfilePage && !layoutEditing && <NewProfileOffer alter={alter} />}
            {onNewLayout === usesNewProfile(alter) && <ProfileBoardCanvas
              key={onNewLayout ? "new" : "classic"}
              ownerType="alter" record={alter} page={page} tourId="alter-profile-tabs" api={boardApi}
              pageIcons={onNewLayout ? NEW_PAGE_ICONS : PAGE_ICONS}
              layoutSuffix={layoutSuffixFor(alter)} />}
          </>
        )}
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