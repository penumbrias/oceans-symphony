import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, Hash, Tag, Users, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import AlterEditModal from "@/components/alters/AlterEditModal";

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
  const [showEdit, setShowEdit] = useState(false);

  const { data: alter, isLoading } = useQuery({
    queryKey: ["alter", alterId],
    queryFn: async () => {
      const all = await base44.entities.Alter.list();
      return all.find((a) => String(a.id) === String(alterId)) || null;
    },
    enabled: !!alterId,
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
        <Link to="/">
          <Button variant="outline" className="mt-4">
            Go back
          </Button>
        </Link>
      </div>
    );
  }

  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textOnColor = hasColor ? getContrastColor(alter.color) : null;

  const customFieldEntries = alter.custom_fields
    ? Object.entries(alter.custom_fields).filter(
        ([_, val]) => val && String(val).trim()
      )
    : [];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Back + Edit */}
      <div className="flex items-center justify-between mb-6">
        <Link to="/">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -ml-2">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to System
          </Button>
        </Link>
        <Button size="sm" variant="outline" onClick={() => setShowEdit(true)} className="gap-1.5">
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </Button>
      </div>

      {/* Hero banner */}
      <div className="rounded-2xl overflow-hidden border border-border/50 bg-card">
        <div
          className="h-40 sm:h-52 relative"
          style={{
            background: bgColor
              ? `linear-gradient(135deg, ${bgColor}, ${bgColor}88, ${bgColor}44)`
              : "linear-gradient(135deg, hsl(265 60% 55%), hsl(320 50% 60%), hsl(265 60% 75%))",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-card/50 to-transparent" />
        </div>

        <div className="relative px-6 sm:px-8 pb-8">
          {/* Avatar */}
          <div className="-mt-16 mb-4">
            <div
              className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl border-4 border-card overflow-hidden shadow-xl"
              style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}
            >
              {alter.avatar_url ? (
                <img
                  src={alter.avatar_url}
                  alt={alter.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.style.display = "none";
                    e.target.nextSibling.style.display = "flex";
                  }}
                />
              ) : null}
              <div
                className="w-full h-full items-center justify-center"
                style={{
                  display: alter.avatar_url ? "none" : "flex",
                  color: textOnColor || "hsl(var(--muted-foreground))",
                }}
              >
                <User className="w-12 h-12" />
              </div>
            </div>
          </div>

          {/* Name and info */}
          <div className="space-y-4">
            <div>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
                {alter.name}
              </h1>
              {alter.pronouns && (
                <p className="text-muted-foreground mt-1 text-sm">
                  {alter.pronouns}
                </p>
              )}
            </div>

            {alter.role && (
              <span
                className="inline-block px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: bgColor
                    ? `${bgColor}18`
                    : "hsl(var(--accent))",
                  color: bgColor || "hsl(var(--accent-foreground))",
                }}
              >
                {alter.role}
              </span>
            )}

            {alter.description && (
              <div className="pt-2">
                <p className="text-foreground/80 leading-relaxed whitespace-pre-wrap max-w-2xl">
                  {alter.description}
                </p>
              </div>
            )}

            {/* Tags */}
            {alter.tags && alter.tags.length > 0 && (
              <div className="pt-4 border-t border-border/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" />
                  Tags
                </h3>
                <div className="flex flex-wrap gap-2">
                  {alter.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground border border-border/40"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Groups */}
            {alter.groups && alter.groups.length > 0 && (
              <div className="pt-4 border-t border-border/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" />
                  Groups
                </h3>
                <div className="flex flex-wrap gap-2">
                  {alter.groups.map((group) => (
                    <span
                      key={group.id}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border"
                      style={{
                        backgroundColor: group.color ? `${group.color}18` : "hsl(var(--muted))",
                        borderColor: group.color ? `${group.color}40` : "hsl(var(--border))",
                        color: group.color || "hsl(var(--foreground))",
                      }}
                    >
                      {group.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Custom fields */}
            {customFieldEntries.length > 0 && (
              <div className="pt-4 border-t border-border/50">
                <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                  <Hash className="w-3.5 h-3.5" />
                  Custom Fields
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {customFieldEntries.map(([key, value]) => (
                    <div
                      key={key}
                      className="bg-muted/30 rounded-xl px-4 py-3"
                    >
                      <p className="text-xs text-muted-foreground capitalize">
                        {key.replace(/_/g, " ")}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        {String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Color swatch */}
            {hasColor && (
              <div className="pt-4 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2">Color</p>
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg shadow-sm border border-border/30"
                    style={{ backgroundColor: bgColor }}
                  />
                  <span className="text-sm text-muted-foreground font-mono">
                    {alter.color}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <AlterEditModal
        alter={alter}
        open={showEdit}
        onClose={() => setShowEdit(false)}
        mode="edit"
      />
    </motion.div>
  );
}