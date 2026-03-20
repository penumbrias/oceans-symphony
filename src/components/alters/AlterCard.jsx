import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { User } from "lucide-react";

function getContrastColor(hex) {
  if (!hex) return "white";
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function AlterCard({ alter, index }) {
  const hasColor = alter.color && alter.color.length > 3;
  const bgColor = hasColor ? alter.color : null;
  const textColor = hasColor ? getContrastColor(alter.color) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
    >
      <Link to={`/alter/${alter.id}`}>
        <div
          className="group relative rounded-2xl overflow-hidden border border-border/50 bg-card hover:shadow-xl transition-all duration-500 hover:-translate-y-1"
        >
          {/* Color accent bar */}
          <div
            className="h-24 relative overflow-hidden"
            style={{
              background: bgColor
                ? `linear-gradient(135deg, ${bgColor}, ${bgColor}88)`
                : "linear-gradient(135deg, hsl(265 60% 55%), hsl(320 50% 60%))",
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-card/30 to-transparent" />
          </div>

          {/* Avatar */}
          <div className="relative px-5 -mt-10">
            <div
              className="w-20 h-20 rounded-2xl border-4 border-card overflow-hidden shadow-lg"
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
                  color: textColor || "hsl(var(--muted-foreground))",
                }}
              >
                <User className="w-8 h-8" />
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="px-5 pb-5 pt-3">
            <h3 className="font-semibold text-foreground text-base group-hover:text-primary transition-colors">
              {alter.name}
            </h3>
            {alter.pronouns && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {alter.pronouns}
              </p>
            )}
            {alter.role && (
              <span
                className="inline-block mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: bgColor ? `${bgColor}18` : "hsl(var(--accent))",
                  color: bgColor || "hsl(var(--accent-foreground))",
                }}
              >
                {alter.role}
              </span>
            )}
            {alter.description && (
              <p className="text-sm text-muted-foreground mt-2.5 line-clamp-2 leading-relaxed">
                {alter.description}
              </p>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}