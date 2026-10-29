// What the Media widget can show (v0.295.0): pictures and GIFs (any image
// the app can load — stored pictures, library assets, links) and videos by
// link. Video links never load anything until the person taps play (a
// third-party player contacts that site), and YouTube plays through its
// no-cookie host.

const VIDEO_FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)(\?|#|$)/i;

export function parseVideoLink(raw) {
  const url = String(raw || "").trim();
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let yt = null;
  if (host === "youtu.be") yt = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    yt = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?#]+)/) || [])[1] || null;
  }
  if (yt && /^[\w-]{6,20}$/.test(yt)) {
    return {
      provider: "youtube", site: "YouTube",
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0`,
      watchUrl: `https://www.youtube.com/watch?v=${yt}`,
    };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = (u.pathname.match(/(\d{5,})/) || [])[1];
    if (id) {
      return { provider: "vimeo", site: "Vimeo", embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`, watchUrl: `https://vimeo.com/${id}` };
    }
  }
  if (VIDEO_FILE_RE.test(u.pathname)) return { provider: "file", site: host, fileUrl: url, watchUrl: url };
  return null;
}

// A widget's items, cleaned: [{ src, kind: "image" | "video", caption }].
export function mediaItemsOf(settings) {
  const raw = Array.isArray(settings?.items) ? settings.items : [];
  return raw
    .filter((it) => it && typeof it.src === "string" && it.src.trim())
    .map((it) => ({
      src: it.src, kind: it.kind === "video" ? "video" : "image", caption: typeof it.caption === "string" ? it.caption : "",
      // Where the picture sits in its box (v0.314.0, src/lib/imageFraming.js).
      ...(it.frame && typeof it.frame === "object" ? { frame: it.frame } : {}),
    }));
}

export const MEDIA_FOCUS = {
  center: "center", top: "center top", bottom: "center bottom", left: "left center", right: "right center",
};

// The picture's own transform: rotation in degrees and mirroring.
export function mediaTransform(settings) {
  const deg = Number(settings?.rotate) || 0;
  const sx = settings?.flipX ? -1 : 1;
  const sy = settings?.flipY ? -1 : 1;
  if (!deg && sx === 1 && sy === 1) return undefined;
  return `rotate(${deg}deg) scale(${sx}, ${sy})`;
}
