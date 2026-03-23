import React, { useState, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";

export default function MentionTextarea({ value = "", onChange, alters = [], placeholder, className, rows }) {
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const ref = useRef(null);

  const filteredAlters = alters.filter(
    (a) =>
      !a.is_archived &&
      (a.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        (a.alias && a.alias.toLowerCase().includes(mentionQuery.toLowerCase())))
  );

  const insertMention = (alter) => {
    const lastAt = value.lastIndexOf("@");
    const before = lastAt !== -1 ? value.slice(0, lastAt) : value;
    onChange(before + `@${alter.alias || alter.name} `);
    setShowMentions(false);
    setMentionQuery("");
    setTimeout(() => ref.current?.focus(), 0);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    const lastAt = val.lastIndexOf("@");
    if (lastAt !== -1 && lastAt === val.length - 1) {
      setShowMentions(true);
      setMentionQuery("");
    } else if (lastAt !== -1 && !val.slice(lastAt + 1).includes(" ")) {
      setShowMentions(true);
      setMentionQuery(val.slice(lastAt + 1));
    } else {
      setShowMentions(false);
    }
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        placeholder={placeholder || "Type a note… use @ to mention an alter"}
        className={className}
        rows={rows}
      />
      {showMentions && filteredAlters.length > 0 && (
        <div
          className="absolute z-50 left-0 right-0 bg-popover border border-border rounded-xl shadow-lg max-h-40 overflow-y-auto"
          style={{ bottom: "calc(100% + 4px)" }}
        >
          {filteredAlters.slice(0, 8).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => insertMention(a)}
              className="flex items-center gap-2 w-full px-3 py-2 hover:bg-muted/50 text-left text-sm"
            >
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: a.color || "#8b5cf6" }}
              >
                {a.name?.charAt(0)}
              </div>
              <span>{a.name}</span>
              {a.alias && <span className="text-muted-foreground text-xs">({a.alias})</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}