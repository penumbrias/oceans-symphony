import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, User, IdCard, MessageSquare, TrendingUp, FileText, SlidersHorizontal, Pencil, Eye, Save, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveImageUrl } from "@/lib/imageUrlResolver";

import ProfileTab from "@/components/alters/profile/ProfileTab";
import InfoTab from "@/components/alters/profile/InfoTab";
import HistoryTab from "@/components/alters/profile/HistoryTab";
import NotesTab from "@/components/alters/profile/NotesTab";
import MessagesTab from "@/components/alters/profile/MessagesTab";
import PrivateMessagesTab from "@/components/alters/profile/PrivateMessagesTab";
import OptionsTab from "@/components/alters/profile/OptionsTab";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "info", label: "Info", icon: IdCard },
  { id: "messages", label: "Board", icon: MessageSquare },
  { id: "private-messages", label: "Messages", icon: Mail },
  { id: "history", label: "History", icon: TrendingUp },
  { id: "notes", label: "Notes", icon: FileText },
  { id: "options", label: "Options", icon: SlidersHorizontal },
];

const BG_COLOR_KEY = "_bg_color";
const BG_IMAGE_KEY = "_bg_image";
const BG_OPACITY_KEY = "_bg_opacity";
const HEADER_IMAGE_KEY = "_header_image";
const SECTION_BG_KEY = "_section_bg_opacity";

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

export default function AlterProfile() {
  const { id: alterId } = useParams();
  const [tab, setTab] = useState("profile");
  const [editMode, setEditMode] = useState(false);
  const [showComposeMessage, setShowComposeMessage] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState(null);
  const [resolvedHeaderImage, setResolvedHeaderImage] = useState(null);
  const saveRef = useRef(null);

  const { data: alter, isLoading } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(alterId)) || null;
    },
    enabled: !!alterId,
    staleTime: 0,
  });

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
  const pageBgColor = cf[BG_COLOR_KEY] || "";
  const pageBgImage = cf[BG_IMAGE_KEY] || "";
  const pageBgOpacity = cf[BG_OPACITY_KEY] !== undefined ? cf[BG_OPACITY_KEY] : 0.15;
  const pageHeaderImage = cf[HEADER_IMAGE_KEY] || "";
  const sectionBgOpacity = cf[SECTION_BG_KEY] !== undefined ? cf[SECTION_BG_KEY] : 0;
  const hasPageBg = pageBgColor || pageBgImage;

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
          {pageBgColor && (
            <div className="absolute inset-0" style={{ backgroundColor: pageBgColor, opacity: pageBgOpacity }} />
          )}
          {pageBgImage && (
            <div className="absolute inset-0" style={{
              backgroundImage: `url("${pageBgImage}")`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              opacity: pageBgOpacity,
            }} />
          )}
        </div>
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <Link to="/Home">
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          </Link>
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
                onClick={() => setShowComposeMessage(true)}
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

        {/* Header banner image */}
        {resolvedHeaderImage && (
          <div className="w-full rounded-2xl overflow-hidden mb-4" style={{ height: 160 }}>
            <img src={resolvedHeaderImage} alt="" className="w-full h-full object-cover" />
          </div>
        )}

        {tab !== "profile" && (
          <div
            className="rounded-2xl p-4 mb-5 flex items-center gap-4"
            style={{
              background: alterColor
                ? `linear-gradient(135deg, ${alterColor}22, ${alterColor}08)`
                : "hsl(var(--muted)/0.3)",
              borderLeft: alterColor ? `4px solid ${alterColor}` : "4px solid hsl(var(--primary))",
            }}
          >
            <div
              className="w-14 h-14 rounded-xl border-2 border-border/60 overflow-hidden flex-shrink-0"
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
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-xl font-semibold text-foreground">{alter.name}</h1>
              {alter.pronouns && <p className="text-sm text-muted-foreground">{alter.pronouns}</p>}
              {alter.role && <p className="text-xs text-muted-foreground/70 mt-0.5">{alter.role}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-5 scrollbar-none">
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

        <div
          className={hasPageBg && sectionBgOpacity > 0 ? "rounded-2xl p-2" : ""}
          style={hasPageBg && sectionBgOpacity > 0 ? {
            backgroundColor: `hsl(var(--background) / ${sectionBgOpacity})`,
          } : {}}>
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
          {tab === "private-messages" && <PrivateMessagesTab alterId={alter.id} alters={alters} />}
          {tab === "history" && <HistoryTab alterId={alter.id} />}
          {tab === "notes" && <NotesTab alterId={alter.id} />}
          {tab === "options" && <OptionsTab alter={alter} />}
        </div>
      </div>
    </motion.div>
  );
}