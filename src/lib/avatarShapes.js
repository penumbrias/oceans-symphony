// Avatar icon shapes (v0.194.2) — real rendered shapes for the pinned bar
// (and anywhere else later): radius-based ones keep a normal border;
// clip-path ones draw their "ring" as a padded backing layer in the same
// shape (a border would be clipped off).
export const AVATAR_SHAPES = [
  { id: "circle",    label: "Circle" },
  { id: "squircle",  label: "Squircle" },
  { id: "square",    label: "Square" },
  { id: "diamond",   label: "Diamond" },
  { id: "hexagon",   label: "Hexagon" },
  { id: "star",      label: "Star" },
  { id: "heart",     label: "Heart" },
  { id: "trapezoid", label: "Trapezoid" },
];

const CLIPS = {
  diamond: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
  hexagon: "polygon(25% 4%, 75% 4%, 99% 50%, 75% 96%, 25% 96%, 1% 50%)",
  star: "polygon(50% 2%, 61% 36%, 98% 36%, 68% 58%, 79% 94%, 50% 72%, 21% 94%, 32% 58%, 2% 36%, 39% 36%)",
  heart: "polygon(50% 96%, 16% 62%, 3% 42%, 3% 26%, 12% 12%, 26% 6%, 40% 10%, 50% 22%, 60% 10%, 74% 6%, 88% 12%, 97% 26%, 97% 42%, 84% 62%)",
  trapezoid: "polygon(18% 4%, 82% 4%, 100% 96%, 0% 96%)",
};
const RADII = { circle: "50%", squircle: "30%", square: "12%" };

export function isClipShape(shape) { return !!CLIPS[shape]; }

// Styles for the two layers: `ring` (the backing/ring layer — give it the
// ring colour as background and `padding: ringWidth`) and `inner` (clips
// the picture). Radius shapes return a borderRadius instead of a clip.
export function shapeLayerStyles(shape = "circle") {
  if (CLIPS[shape]) {
    return { ring: { clipPath: CLIPS[shape] }, inner: { clipPath: CLIPS[shape] } };
  }
  const r = RADII[shape] || RADII.circle;
  return { ring: { borderRadius: r }, inner: { borderRadius: r } };
}
