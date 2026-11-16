// A custom field's title as a person sees it (v0.372.1): the formatted
// title (fancy text, pictures) when the field has one, else the plain name.
// See src/lib/fieldTitle.js for how the two spellings are kept.
//
// Rendered through the same sanitiser the field ANSWERS use (MarkdownText's
// HTML path), so a title can do exactly what an answer can — no more.
import React from "react";
import DOMPurify from "dompurify";
import { richTitleOf } from "@/lib/fieldTitle";

export default function FieldTitle({ field = null, label = "", rich = undefined, as: Tag = "span", className = "" }) {
  const html = rich !== undefined ? rich : richTitleOf(field);
  const plain = label || field?.name || "";
  if (!html) return <Tag className={className}>{plain}</Tag>;
  return (
    <Tag className={`field-title-rich ${className}`} data-field-title-rich=""
      title={plain} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }} />
  );
}
