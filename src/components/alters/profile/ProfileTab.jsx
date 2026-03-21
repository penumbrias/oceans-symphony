import React from "react";
import { User, Tag, Users } from "lucide-react";

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

export default function ProfileTab({ alter }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textOnColor = hasColor ? getContrastColor(alter.color) : null;

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex justify-center">
        <div
          className="w-32 h-32 rounded-2xl border-4 border-border overflow-hidden shadow-xl"
          style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}
        >
          {alter.avatar_url ? (
            <img src={alter.avatar_url} alt={alter.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ color: textOnColor || "hsl(var(--muted-foreground))" }}>
              <User className="w-14 h-14" />
            </div>
          )}
        </div>
      </div>

      {/* Fields */}
      <div className="space-y-4">
        <FieldRow label="Name" value={alter.name} />
        <FieldRow label="Pronouns" value={alter.pronouns} />
        <FieldRow label="Description" value={alter.description} multiline />
        {hasColor && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Color</p>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20">
              <div className="w-6 h-6 rounded-md shadow-sm" style={{ backgroundColor: bgColor }} />
              <span className="text-sm font-mono text-muted-foreground">{alter.color}</span>
            </div>
          </div>
        )}
      </div>

      {/* Groups */}
      {alter.groups && alter.groups.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-3">
            <Users className="w-3.5 h-3.5" /> Groups
          </p>
          <div className="flex flex-wrap gap-2">
            {alter.groups.map((group) => (
              <span
                key={group.id}
                className="px-3 py-1 rounded-full text-xs font-medium border"
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

      {/* Tags */}
      {alter.tags && alter.tags.length > 0 && (
        <div>
          <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-3">
            <Tag className="w-3.5 h-3.5" /> Tags
          </p>
          <div className="flex flex-wrap gap-2">
            {alter.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 rounded-full text-xs bg-muted/50 text-muted-foreground border border-border/40">
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, value, multiline }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">{label}</p>
      <div className={`px-3 py-2.5 rounded-xl border border-border/50 bg-muted/20 min-h-[2.5rem] ${multiline ? "min-h-[5rem]" : ""}`}>
        <p className="text-sm text-foreground whitespace-pre-wrap">{value || ""}</p>
      </div>
    </div>
  );
}