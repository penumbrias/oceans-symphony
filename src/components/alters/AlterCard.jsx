import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { User, ChevronRight } from "lucide-react";

function getContrastColor(hex) {
  if (!hex) return "hsl(var(--muted-foreground))";
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
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}>
      
      <Link to={`/alter/${alter.id}`}>
        <div className="bg-card pt-2 pr-4 pb-2 pl-3 rounded-xl flex items-center gap-3 border border-border/50 hover:bg-muted/30 hover:border-border transition-all cursor-pointer group"

        style={{ borderLeftColor: bgColor || "transparent", borderLeftWidth: bgColor ? 3 : 1 }}>
          
          {/* Avatar */}
          <div
            className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center border border-border/40"
            style={{ backgroundColor: bgColor || "hsl(var(--muted))" }}>
            
            {alter.avatar_url ?
            <img
              src={alter.avatar_url}
              alt={alter.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextSibling.style.display = "flex";
              }} /> :

            null}
            <div
              className="w-full h-full items-center justify-center"
              style={{
                display: alter.avatar_url ? "none" : "flex",
                color: textColor || "hsl(var(--muted-foreground))"
              }}>
              
              <User className="w-5 h-5" />
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-foreground group-hover:text-primary transition-colors truncate">
              {alter.name}
            </p>
            {alter.pronouns &&
            <p className="text-xs text-muted-foreground truncate">{alter.pronouns}</p>
            }
          </div>

          {alter.role &&
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: bgColor ? `${bgColor}20` : "hsl(var(--muted))",
              color: bgColor || "hsl(var(--muted-foreground))"
            }}>
            
              {alter.role}
            </span>
          }

          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </div>
      </Link>
    </motion.div>);

}