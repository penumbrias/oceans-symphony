import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { ArrowLeft, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--foreground))";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

function AlterCard({ alter }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-all"
      style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}
    >
      <div
        className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
        style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}
      >
        {alter.avatar_url ? (
          <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
        ) : (
          <div className="text-sm font-semibold" style={{ color: getContrastColor(bgColor || "") }}>
            {alter.name.charAt(0)}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-foreground truncate">{alter.name}</p>
        {alter.pronouns && <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>}
        {alter.role && <p className="text-xs text-muted-foreground truncate">{alter.role}</p>}
      </div>
    </motion.div>
  );
}

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: allGroups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => base44.entities.Group.list(),
  });

  const { data: allAlters = [] } = useQuery({
    queryKey: ["alters"],
    queryFn: () => base44.entities.Alter.list(),
  });

  const group = allGroups.find((g) => g.id === id);
  const altersInGroup = allAlters.filter((a) =>
    (a.groups || []).some((g) => g.id === id || g.sp_id === id)
  );

  const childGroups = allGroups
    .filter((g) => g.parent && (g.parent === id || g.parent === group?.sp_id))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!group) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <Button onClick={() => navigate(-1)} variant="ghost" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <p className="text-muted-foreground">Group not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Button onClick={() => navigate(-1)} variant="ghost" className="gap-2 mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: group.color ? `${group.color}20` : "hsl(var(--muted))" }}
            >
              <Folder className="w-8 h-8" style={{ color: group.color || "hsl(var(--muted-foreground))" }} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">{group.name}</h1>
              <p className="text-muted-foreground text-sm">
                {altersInGroup.length} member{altersInGroup.length !== 1 ? "s" : ""} · {childGroups.length} subgroup
                {childGroups.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Alters Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">Members</h2>
          {altersInGroup.length === 0 ? (
            <p className="text-muted-foreground text-sm">No members in this group</p>
          ) : (
            <div className="grid gap-3">
              {altersInGroup.map((alter) => (
                <AlterCard key={alter.id} alter={alter} />
              ))}
            </div>
          )}
        </motion.div>

        {/* Subgroups Section */}
        {childGroups.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <h2 className="text-xl font-semibold text-foreground mb-4">Subgroups</h2>
            <div className="grid gap-3">
              {childGroups.map((childGroup) => (
                <button
                  key={childGroup.id}
                  onClick={() => navigate(`/group/${childGroup.id}`)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card hover:bg-muted/30 transition-all text-left"
                  style={{
                    borderLeftColor: childGroup.color || "transparent",
                    borderLeftWidth: childGroup.color ? 3 : 1,
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: childGroup.color ? `${childGroup.color}20` : "hsl(var(--muted))" }}
                  >
                    <Folder className="w-4 h-4" style={{ color: childGroup.color || "hsl(var(--muted-foreground))" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{childGroup.name}</p>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}