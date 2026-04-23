import React, { useState, useRef } from "react";
import { Upload, Check } from "lucide-react";
import { isLocalMode } from "@/lib/storageMode";
import { saveLocalImage, createLocalImageUrl } from "@/lib/localImageStorage";

/**
 * Shows a small amber "⚠️ Fix image" pill when:
 *   - isLocalMode() is true, AND
 *   - value is a string starting with "data:"
 *
 * On file pick, compresses and saves to localImageStorage,
 * then calls onFixed(localImageUrl).
 *
 * Props:
 *   value       – current field value (checked for data: prefix)
 *   onFixed     – callback(newLocalImageUrl: string)
 *   maxWidth    – compression max width (default 400 for avatars, pass 1200 for backgrounds)
 *   quality     – compression quality (default 0.85)
 *   label       – optional display label override
 *   className   – optional extra classes
 */
export default function LocalImageFixer({
  value,
  onFixed,
  maxWidth = 400,
  quality = 0.85,
  label,
  className = "",
}) {
  const fileRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [fixed, setFixed] = useState(false);

  // Only render in local mode when value is a raw data: URL
  if (!isLocalMode() || !value?.startsWith("data:")) return null;

  const compressImage = (file) =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = url;
    });

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setLoading(true);
    try {
      const dataUrl = await compressImage(file);
      const imageId = `fixed-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      await saveLocalImage(imageId, dataUrl);
      const localUrl = createLocalImageUrl(imageId);
      setFixed(true);
      onFixed(localUrl);
      // Brief green flash then hide (value will no longer start with data:)
      setTimeout(() => setFixed(false), 1500);
    } catch {
      // silently fail — user can try again
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={loading}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-colors
          ${fixed
            ? "bg-green-500/15 border-green-500/40 text-green-600 dark:text-green-400"
            : "bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/25"
          } ${className}`}
      >
        {fixed ? (
          <><Check className="w-3 h-3" /> Fixed!</>
        ) : loading ? (
          <><span className="w-3 h-3 animate-spin inline-block border-2 border-current border-t-transparent rounded-full" /> Fixing…</>
        ) : (
          <><Upload className="w-3 h-3" /> {label ?? "⚠️ Fix image"}</>
        )}
      </button>
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFile} />
    </>
  );
}