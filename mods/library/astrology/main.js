// Astrology — a library mod for Oceans Symphony (docs/mods.md).
//
// Four tabs: today's sky, saved birth charts (for anyone, optionally linked
// to one of the person's alters), and guides to the signs and to the planets
// and houses. All positions are worked out on the device; nothing is looked
// up online. It's for reflection and fun, not prediction or advice.
//
// Maths (tropical zodiac, geocentric):
//   • Planets: JPL's "approximate positions of the planets" (Standish),
//     Keplerian elements valid 1800–2050, good to well under a degree, moved
//     to the equinox of date with general precession.
//   • Moon: the main terms of its longitude (Astronomical Almanac), ~0.3°.
//   • Rising sign and midheaven from local sidereal time; houses are
//     whole-sign houses counted from the rising sign.
//
// Saved data:
//   "chart" { name, date "YYYY-MM-DD", time "HH:MM" | "", utc_offset (hours),
//             place, lat, lng, alter_id }

symphony.registerPage("sky", async (root) => {
  const t = symphony.terms;
  const canAlters = symphony.permissions.includes("alters:read");

  // ── tiny DOM helpers ─────────────────────────────────────────────────────
  const el = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "style") n.style.cssText = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k);
    return n;
  };

  // ── maths ────────────────────────────────────────────────────────────────
  const D2R = Math.PI / 180;
  const norm = (x) => ((x % 360) + 360) % 360;
  const julian = (d) => d.valueOf() / 86400000 + 2440587.5;
  const centuries = (d) => (julian(d) - 2451545) / 36525;

  // [a, e, I, L, long. perihelion, long. node] at J2000, and per century.
  const ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593], [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255], [0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418]],
    earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0], [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0]],
    mars: [[1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891], [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909], [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448], [-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503], [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574], [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
    pluto: [[39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684], [-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942, -0.01183482]],
  };

  function helio(name, T) {
    const [b, r] = ELEMENTS[name];
    const a = b[0] + r[0] * T, e = b[1] + r[1] * T, I = (b[2] + r[2] * T) * D2R;
    const L = b[3] + r[3] * T, peri = b[4] + r[4] * T, node = b[5] + r[5] * T;
    const w = (peri - node) * D2R, O = node * D2R;
    let M = norm(L - peri); if (M > 180) M -= 360;
    const Mr = M * D2R;
    let E = Mr + e * Math.sin(Mr);
    for (let i = 0; i < 12; i++) E -= (E - e * Math.sin(E) - Mr) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I);
    return [
      (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
      (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    ];
  }
  const precession = (T) => 1.396971 * T;

  function moonLon(date) {
    const d = julian(date) - 2451545;
    const L = 218.316 + 13.176396 * d, Mm = (134.963 + 13.064993 * d) * D2R, Ms = (357.529 + 0.98560028 * d) * D2R;
    const D = (297.85 + 12.190749 * d) * D2R, F = (93.272 + 13.22935 * d) * D2R;
    const s = Math.sin;
    return norm(L + 6.289 * s(Mm) - 1.274 * s(Mm - 2 * D) + 0.658 * s(2 * D) + 0.214 * s(2 * Mm) - 0.186 * s(Ms)
      - 0.114 * s(2 * F) - 0.059 * s(2 * Mm - 2 * D) - 0.057 * s(Mm - 2 * D + Ms) + 0.053 * s(Mm + 2 * D)
      + 0.046 * s(2 * D - Ms) + 0.041 * s(Mm - Ms) - 0.035 * s(D) - 0.031 * s(Mm + Ms) - 0.015 * s(2 * F - 2 * D)
      + 0.011 * s(Mm - 4 * D));
  }

  function lonOf(body, date) {
    if (body === "moon") return moonLon(date);
    const T = centuries(date);
    const [ex, ey] = helio("earth", T);
    if (body === "sun") return norm(Math.atan2(-ey, -ex) / D2R + precession(T));
    const [px, py] = helio(body, T);
    return norm(Math.atan2(py - ey, px - ex) / D2R + precession(T));
  }
  function isRetro(body, date) {
    if (body === "sun" || body === "moon") return false;
    const a = lonOf(body, date), b = lonOf(body, new Date(date.valueOf() + 86400000));
    let diff = b - a; if (diff > 180) diff -= 360; if (diff < -180) diff += 360;
    return diff < 0;
  }

  // Rising sign (ascendant) and midheaven for a moment and place.
  function angles(date, lat, lng) {
    const d = julian(date) - 2451545, T = d / 36525;
    const lst = norm(280.46061837 + 360.98564736629 * d + lng) * D2R;
    const eps = (23.4393 - 0.013 * T) * D2R, phi = lat * D2R;
    const asc = norm(Math.atan2(Math.cos(lst), -(Math.sin(lst) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))) / D2R);
    const mc = norm(Math.atan2(Math.sin(lst), Math.cos(lst) * Math.cos(eps)) / D2R);
    return { asc, mc };
  }

  // ── reference content ────────────────────────────────────────────────────
  const VS = "︎"; // keep zodiac glyphs as text, not emoji
  const SIGNS = [
    { name: "Aries", glyph: "♈", dates: "Mar 21 – Apr 19", element: "Fire", mode: "Cardinal", ruler: "Mars", keys: "Initiative, courage, directness, impatience", text: "The spark that starts things. Aries energy goes first, acts on instinct and likes a clear challenge, and can rush or flare up quickly." },
    { name: "Taurus", glyph: "♉", dates: "Apr 20 – May 20", element: "Earth", mode: "Fixed", ruler: "Venus", keys: "Steadiness, comfort, senses, stubbornness", text: "Slow and sure. Taurus energy values safety, good food, beauty and what can be touched, and doesn't like to be hurried." },
    { name: "Gemini", glyph: "♊", dates: "May 21 – Jun 20", element: "Air", mode: "Mutable", ruler: "Mercury", keys: "Curiosity, talk, versatility, restlessness", text: "Quick and many-sided. Gemini energy wants to learn, chat and connect ideas, and gets bored with routine." },
    { name: "Cancer", glyph: "♋", dates: "Jun 21 – Jul 22", element: "Water", mode: "Cardinal", ruler: "Moon", keys: "Care, home, memory, protectiveness", text: "The shell and what it shelters. Cancer energy nurtures, remembers and protects its people, and feels deeply." },
    { name: "Leo", glyph: "♌", dates: "Jul 23 – Aug 22", element: "Fire", mode: "Fixed", ruler: "Sun", keys: "Warmth, creativity, pride, play", text: "Big-hearted and expressive. Leo energy wants to shine, create and be seen for who it is, and is generous with its warmth." },
    { name: "Virgo", glyph: "♍", dates: "Aug 23 – Sep 22", element: "Earth", mode: "Mutable", ruler: "Mercury", keys: "Care in the details, usefulness, health, analysis", text: "Practical devotion. Virgo energy notices what needs tending, likes to be useful and to make things work, and can be hard on itself." },
    { name: "Libra", glyph: "♎", dates: "Sep 23 – Oct 22", element: "Air", mode: "Cardinal", ruler: "Venus", keys: "Balance, fairness, partnership, harmony", text: "The scales. Libra energy seeks fairness, beauty and good company, weighs every side, and can find choosing hard." },
    { name: "Scorpio", glyph: "♏", dates: "Oct 23 – Nov 21", element: "Water", mode: "Fixed", ruler: "Pluto (and Mars)", keys: "Depth, intensity, loyalty, transformation", text: "Still waters. Scorpio energy wants the truth under the surface, bonds fiercely, and knows how to change and begin again." },
    { name: "Sagittarius", glyph: "♐", dates: "Nov 22 – Dec 21", element: "Fire", mode: "Mutable", ruler: "Jupiter", keys: "Adventure, meaning, honesty, freedom", text: "The archer aiming far. Sagittarius energy looks for meaning, travel and big ideas, and says what it thinks." },
    { name: "Capricorn", glyph: "♑", dates: "Dec 22 – Jan 19", element: "Earth", mode: "Cardinal", ruler: "Saturn", keys: "Ambition, structure, patience, responsibility", text: "The climb. Capricorn energy builds things that last, takes the long view, and carries responsibility seriously." },
    { name: "Aquarius", glyph: "♒", dates: "Jan 20 – Feb 18", element: "Air", mode: "Fixed", ruler: "Uranus (and Saturn)", keys: "Originality, community, independence, ideals", text: "The water-bearer for everyone. Aquarius energy thinks differently, cares about the group and the future, and guards its independence." },
    { name: "Pisces", glyph: "♓", dates: "Feb 19 – Mar 20", element: "Water", mode: "Mutable", ruler: "Neptune (and Jupiter)", keys: "Imagination, empathy, dreams, sensitivity", text: "The ocean. Pisces energy dreams, feels what others feel, and drifts between worlds; it needs gentleness and good boundaries." },
  ];
  const BODIES = [
    ["sun", "Sun", "☉", "Identity, vitality, what you're growing into."],
    ["moon", "Moon", "☽", "Feelings, needs, comfort and how you care for yourself."],
    ["mercury", "Mercury", "☿", "Thinking, talking, learning and getting around."],
    ["venus", "Venus", "♀", "Love, pleasure, values, beauty and what you're drawn to."],
    ["mars", "Mars", "♂", "Drive, action, desire, anger and courage."],
    ["jupiter", "Jupiter", "♃", "Growth, luck, generosity, faith and big pictures."],
    ["saturn", "Saturn", "♄", "Structure, limits, time, lessons and commitment."],
    ["uranus", "Uranus", "♅", "Change, surprise, freedom and breaking patterns."],
    ["neptune", "Neptune", "♆", "Dreams, intuition, longing, art and dissolving edges."],
    ["pluto", "Pluto", "♇", "Power, endings and rebirth, what's hidden and deep."],
  ];
  const HOUSES = [
    "Self, body, first impressions", "Money, belongings, self-worth", "Siblings, neighbours, everyday talk and learning",
    "Home, family, roots", "Creativity, play, romance, children", "Daily routines, work, health habits",
    "Partners, close one-to-one relationships", "Shared resources, intimacy, change", "Travel, beliefs, higher learning",
    "Career, reputation, direction in life", "Friends, groups, hopes", "Rest, the hidden, endings, the inner world",
  ];
  const ELEMENT_TEXT = {
    Fire: "Fire signs (Aries, Leo, Sagittarius) are energetic, warm and spontaneous.",
    Earth: "Earth signs (Taurus, Virgo, Capricorn) are grounded, practical and steady.",
    Air: "Air signs (Gemini, Libra, Aquarius) are mental, social and curious.",
    Water: "Water signs (Cancer, Scorpio, Pisces) are emotional, intuitive and deep.",
  };
  const MODE_TEXT = {
    Cardinal: "Cardinal signs start things.", Fixed: "Fixed signs keep things going.", Mutable: "Mutable signs adapt and change things.",
  };

  const signOf = (lon) => SIGNS[Math.floor(norm(lon) / 30)];
  const degIn = (lon) => { const x = norm(lon) % 30; return `${Math.floor(x)}°${String(Math.floor((x % 1) * 60)).padStart(2, "0")}′`; };
  const glyph = (s) => s.glyph + VS;

  // ── places (for rising signs) ────────────────────────────────────────────
  const CITIES = [
    ["Auckland", -36.85, 174.76], ["Amsterdam", 52.37, 4.9], ["Athens", 37.98, 23.73], ["Atlanta", 33.75, -84.39],
    ["Bangkok", 13.76, 100.5], ["Berlin", 52.52, 13.4], ["Bogotá", 4.71, -74.07], ["Boston", 42.36, -71.06],
    ["Buenos Aires", -34.6, -58.38], ["Cairo", 30.04, 31.24], ["Cape Town", -33.92, 18.42], ["Chicago", 41.88, -87.63],
    ["Dallas", 32.78, -96.8], ["Delhi", 28.61, 77.21], ["Denver", 39.74, -104.99], ["Dublin", 53.35, -6.26],
    ["Hong Kong", 22.32, 114.17], ["Honolulu", 21.31, -157.86], ["Istanbul", 41.01, 28.98], ["Jakarta", -6.21, 106.85],
    ["Johannesburg", -26.2, 28.05], ["Lagos", 6.52, 3.38], ["Lima", -12.05, -77.04], ["London", 51.51, -0.13],
    ["Los Angeles", 34.05, -118.24], ["Madrid", 40.42, -3.7], ["Manila", 14.6, 120.98], ["Melbourne", -37.81, 144.96],
    ["Mexico City", 19.43, -99.13], ["Miami", 25.76, -80.19], ["Montréal", 45.5, -73.57], ["Moscow", 55.76, 37.62],
    ["Mumbai", 19.08, 72.88], ["Nairobi", -1.29, 36.82], ["New York", 40.71, -74.01], ["Paris", 48.86, 2.35],
    ["Perth", -31.95, 115.86], ["Phoenix", 33.45, -112.07], ["Rome", 41.9, 12.5], ["San Francisco", 37.77, -122.42],
    ["São Paulo", -23.55, -46.63], ["Seattle", 47.61, -122.33], ["Seoul", 37.57, 126.98], ["Singapore", 1.35, 103.82],
    ["Stockholm", 59.33, 18.07], ["Sydney", -33.87, 151.21], ["Tokyo", 35.68, 139.69], ["Toronto", 43.65, -79.38],
    ["Vancouver", 49.28, -123.12],
  ];

  // ── data ─────────────────────────────────────────────────────────────────
  let charts = [];
  let alters = [];
  const load = async () => { charts = await symphony.data.list("chart"); };
  if (canAlters) { try { alters = (await symphony.alters.list()).filter((a) => !a.archived); } catch { alters = []; } }
  const alterName = (id) => (alters.find((a) => a.id === id) || {}).name || "";
  await load();

  // The moment a chart describes, in UTC. No time → local noon.
  function chartMoment(c) {
    const [y, m, d] = c.date.split("-").map(Number);
    const [hh, mm] = (c.time || "12:00").split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, d, hh, mm) - (Number(c.utc_offset) || 0) * 3600000);
  }

  // ── page ─────────────────────────────────────────────────────────────────
  let tab = "sky";
  let openChart = null; // a chart id, "new", or null
  let openSign = null;
  const body = el("div");
  root.append(body);

  function tabs() {
    const TABS = [["sky", "Today's sky"], ["charts", "Charts"], ["signs", "Signs"], ["planets", "Planets & houses"]];
    return el("div", { className: "os-tabs", role: "tablist" }, TABS.map(([id, label]) => el("button", {
      className: "os-chip", role: "tab", textContent: label, "aria-pressed": tab === id ? "true" : "false",
      onclick: () => { tab = id; openChart = null; render(); },
    })));
  }

  function positionRows(date, opts = {}) {
    return BODIES.map(([id, name, g]) => {
      const lon = lonOf(id, date);
      const s = signOf(lon);
      const retro = isRetro(id, date);
      const house = opts.asc != null ? ((Math.floor(lon / 30) - Math.floor(opts.asc / 30) + 12) % 12) + 1 : null;
      const uncertain = id === "moon" && opts.moonRange;
      return el("div", { className: "os-row", style: "justify-content:space-between;padding:5px 0;border-top:1px solid var(--color-muted,#B6D4E3)" },
        el("span", { className: "os-row", style: "gap:8px" },
          el("span", { style: "width:1.4em;text-align:center;font-size:1.1em", textContent: g + VS, "aria-hidden": "true" }),
          el("span", { textContent: name })),
        el("span", { style: "text-align:right" },
          el("span", { textContent: uncertain ? opts.moonRange : `${glyph(s)} ${s.name} ${degIn(lon)}` }),
          retro ? el("span", { title: "Retrograde", style: "margin-left:6px;color:var(--color-primary,#3B82F6);font-weight:600", textContent: "℞" + VS }) : null,
          house ? el("span", { className: "os-muted", textContent: ` · house ${house}` }) : null));
    });
  }

  function skyTab() {
    const now = new Date();
    const sun = signOf(lonOf("sun", now)), moon = signOf(lonOf("moon", now));
    // When does the moon change sign next?
    let ingress = null;
    const startIdx = Math.floor(lonOf("moon", now) / 30);
    for (let h = 1; h <= 72; h++) {
      const at = new Date(now.valueOf() + h * 3600000);
      if (Math.floor(lonOf("moon", at) / 30) !== startIdx) { ingress = { at, sign: signOf(lonOf("moon", at)) }; break; }
    }
    const elong = norm(lonOf("moon", now) - lonOf("sun", now));
    const phase = elong < 12 || elong > 348 ? "New moon" : Math.abs(elong - 180) < 12 ? "Full moon"
      : Math.abs(elong - 90) < 12 ? "First quarter" : Math.abs(elong - 270) < 12 ? "Last quarter"
        : elong < 90 ? "Waxing crescent" : elong < 180 ? "Waxing gibbous" : elong < 270 ? "Waning gibbous" : "Waning crescent";
    const retros = BODIES.filter(([id]) => isRetro(id, now)).map(([, name]) => name);
    return [
      el("div", { className: "os-card" },
        el("p", { style: "font-size:1.2em;font-weight:600;margin:0", textContent: `Sun in ${sun.name}, Moon in ${moon.name}` }),
        el("p", { className: "os-muted", style: "margin:2px 0 0", textContent: `${phase}${ingress ? ` · the moon moves into ${ingress.sign.name} ${ingress.at.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}` : ""}` }),
        el("p", { style: "margin:8px 0 0", textContent: retros.length ? `Retrograde now: ${retros.join(", ")}.` : "No planets are retrograde right now." })),
      el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Where everything is" }), positionRows(now),
        el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: "℞ means retrograde: from Earth, the planet looks like it's moving backwards for a while." })),
    ];
  }

  function chartSummary(c) {
    const m = chartMoment(c);
    const sun = signOf(lonOf("sun", m));
    let moonText = signOf(lonOf("moon", m)).name;
    if (!c.time) {
      const a = signOf(lonOf("moon", new Date(m.valueOf() - 12 * 3600000))).name;
      const b = signOf(lonOf("moon", new Date(m.valueOf() + 12 * 3600000))).name;
      if (a !== b) moonText = `${a} or ${b}`;
    }
    const rising = c.time && Number.isFinite(c.lat) && Number.isFinite(c.lng) ? signOf(angles(m, c.lat, c.lng).asc).name : null;
    return `☉${VS} ${sun.name} · ☽${VS} ${moonText}${rising ? ` · ↑ ${rising}` : ""}`;
  }

  function chartsTab() {
    if (openChart === "new" || (openChart && openChart.startsWith("edit:"))) return [chartForm(openChart === "new" ? null : charts.find((c) => c.id === openChart.slice(5)))];
    if (openChart) {
      const c = charts.find((x) => x.id === openChart);
      if (c) return [chartView(c)];
      openChart = null;
    }
    const list = [...charts].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return [
      el("div", { className: "os-row", style: "justify-content:space-between;margin-bottom:8px" },
        el("span", { className: "os-muted", textContent: canAlters ? `Charts for anyone, including your ${t.alters || "alters"}.` : "Charts for anyone you like." }),
        el("button", { className: "os-button small", textContent: "New chart", onclick: () => { openChart = "new"; render(); } })),
      list.length ? list.map((c) => el("button", {
        className: "os-card", style: "display:block;width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer",
        onclick: () => { openChart = c.id; render(); },
      }, el("div", { style: "font-weight:600", textContent: c.name || "Unnamed" }),
        el("div", { className: "os-muted", textContent: `${new Date(c.date + "T12:00").toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}${c.alter_id && alterName(c.alter_id) ? ` · ${alterName(c.alter_id)}` : ""}` }),
        el("div", { style: "margin-top:4px", textContent: chartSummary(c) })))
        : el("p", { className: "os-muted", textContent: "No charts yet. A date is enough for sun signs; add a time and place for the moon and rising sign." }),
    ];
  }

  function chartView(c) {
    const m = chartMoment(c);
    const hasPlace = c.time && Number.isFinite(c.lat) && Number.isFinite(c.lng);
    const ang = hasPlace ? angles(m, c.lat, c.lng) : null;
    let moonRange = null;
    if (!c.time) {
      const a = signOf(lonOf("moon", new Date(m.valueOf() - 12 * 3600000))), b = signOf(lonOf("moon", new Date(m.valueOf() + 12 * 3600000)));
      if (a !== b) moonRange = `${a.name} or ${b.name}`;
    }
    const sun = signOf(lonOf("sun", m));
    const remove = async () => {
      if (await symphony.ui.confirm(`Remove ${c.name || "this chart"}?`, "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
        await symphony.data.remove("chart", c.id);
        openChart = null;
      }
    };
    return el("div", {},
      el("button", { className: "os-button secondary small", textContent: "‹ All charts", onclick: () => { openChart = null; render(); } }),
      el("div", { className: "os-card", style: "margin-top:8px" },
        el("p", { style: "font-size:1.2em;font-weight:600;margin:0", textContent: c.name || "Unnamed" }),
        el("p", { className: "os-muted", style: "margin:2px 0 0", textContent: [
          new Date(c.date + "T12:00").toLocaleDateString([], { year: "numeric", month: "long", day: "numeric" }),
          c.time ? `${c.time} (UTC${Number(c.utc_offset) >= 0 ? "+" : ""}${Number(c.utc_offset) || 0})` : "time unknown",
          c.place || "", c.alter_id ? alterName(c.alter_id) : "",
        ].filter(Boolean).join(" · ") }),
        el("p", { style: "margin:8px 0 0", textContent: `${sun.name} sun: ${sun.keys.toLowerCase()}.` }),
        ang ? el("p", { style: "margin:4px 0 0", textContent: `Rising sign ${signOf(ang.asc).name} ${degIn(ang.asc)} · Midheaven ${signOf(ang.mc).name} ${degIn(ang.mc)}` }) : null),
      el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Planets" }), positionRows(m, { asc: ang ? ang.asc : null, moonRange }),
        !c.time ? el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: "Without a birth time the moon's sign may be uncertain, and there's no rising sign or houses." }) : null,
        ang ? el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: "Houses are whole-sign houses: the rising sign is the 1st house." }) : null),
      el("div", { className: "os-row" },
        el("button", { className: "os-button secondary", textContent: "Edit", onclick: () => { openChart = "edit:" + c.id; render(); } }),
        el("button", { className: "os-button secondary", textContent: "Remove", onclick: remove })));
  }

  function chartForm(c) {
    const name = el("input", { className: "os-input", placeholder: "Name", value: c ? c.name || "" : "" });
    const date = el("input", { className: "os-input", type: "date", value: c ? c.date : "" });
    const time = el("input", { className: "os-input", type: "time", value: c ? c.time || "" : "" });
    const defaultOffset = (d) => (d ? -new Date(d + "T12:00").getTimezoneOffset() / 60 : -new Date().getTimezoneOffset() / 60);
    const offset = el("input", { className: "os-input", inputMode: "decimal", value: c ? String(c.utc_offset ?? 0) : String(defaultOffset()) });
    date.onchange = () => { if (!c) offset.value = String(defaultOffset(date.value)); };
    const city = el("select", { className: "os-input", "aria-label": "Nearest city" },
      el("option", { value: "", textContent: "Pick the nearest city…" }), CITIES.map(([n]) => el("option", { value: n, textContent: n })));
    const place = el("input", { className: "os-input", placeholder: "Place name", value: c ? c.place || "" : "" });
    const lat = el("input", { className: "os-input", inputMode: "decimal", placeholder: "Latitude", value: c && Number.isFinite(c.lat) ? String(c.lat) : "" });
    const lng = el("input", { className: "os-input", inputMode: "decimal", placeholder: "Longitude", value: c && Number.isFinite(c.lng) ? String(c.lng) : "" });
    city.onchange = () => { const x = CITIES.find(([n]) => n === city.value); if (x) { place.value = x[0]; lat.value = String(x[1]); lng.value = String(x[2]); } };
    const alterSel = canAlters && alters.length ? el("select", { className: "os-input", "aria-label": `Linked ${t.alter || "alter"}` },
      el("option", { value: "", textContent: "Nobody" }),
      alters.map((a) => el("option", { value: a.id, textContent: a.name || a.alias || "?", selected: c && c.alter_id === a.id }))) : null;

    const save = el("button", { className: "os-button", textContent: "Save chart" });
    save.onclick = async () => {
      if (!date.value) { symphony.ui.toast("A chart needs at least a date."); return; }
      const la = lat.value.trim() === "" ? null : Number(lat.value), lo = lng.value.trim() === "" ? null : Number(lng.value);
      if ((la != null && (!Number.isFinite(la) || Math.abs(la) > 90)) || (lo != null && (!Number.isFinite(lo) || Math.abs(lo) > 180))) {
        symphony.ui.toast("Latitude is between -90 and 90, longitude between -180 and 180."); return;
      }
      const off = Number(offset.value);
      const fields = {
        name: name.value.trim() || (alterSel && alterSel.value ? alterName(alterSel.value) : "Unnamed"),
        date: date.value, time: time.value || "", utc_offset: Number.isFinite(off) ? off : 0,
        place: place.value.trim(), lat: la, lng: lo, alter_id: alterSel ? alterSel.value || null : (c ? c.alter_id || null : null),
      };
      const saved = c ? await symphony.data.update("chart", c.id, fields) : await symphony.data.create("chart", fields);
      openChart = saved.id;
      symphony.ui.toast("Chart saved");
    };
    const label = (text) => el("label", { className: "os-label", textContent: text });
    return el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: c ? "Edit chart" : "New chart" }),
      label("Name"), name,
      alterSel ? [label(`Linked ${t.alter || "alter"} (optional)`), alterSel] : null,
      label("Birth date"), date,
      label("Birth time (optional, for the moon and rising sign)"), time,
      label("UTC offset at that time, in hours (e.g. -5 or 5.5)"), offset,
      label("Birth place (optional, for the rising sign)"), city, el("div", { style: "height:6px" }), place,
      el("div", { className: "os-row", style: "margin-top:6px" }, el("div", { style: "flex:1;min-width:110px" }, lat), el("div", { style: "flex:1;min-width:110px" }, lng)),
      el("div", { className: "os-row", style: "margin-top:12px" }, save,
        el("button", { className: "os-button secondary", textContent: "Cancel", onclick: () => { openChart = c ? c.id : null; render(); } })));
  }

  function signsTab() {
    return [
      el("div", { className: "os-card" },
        Object.values(ELEMENT_TEXT).map((x) => el("p", { style: "margin:0 0 4px", textContent: x })),
        el("p", { className: "os-muted", style: "margin:6px 0 0", textContent: Object.values(MODE_TEXT).join(" ") })),
      SIGNS.map((s) => {
        const open = openSign === s.name;
        return el("div", { className: "os-card" },
          el("button", {
            style: "all:unset;cursor:pointer;display:flex;justify-content:space-between;width:100%;gap:8px",
            "aria-expanded": open ? "true" : "false",
            onclick: () => { openSign = open ? null : s.name; render(); },
          }, el("span", { style: "font-weight:600", textContent: `${glyph(s)}  ${s.name}` }), el("span", { className: "os-muted", textContent: s.dates })),
          open ? el("div", { style: "margin-top:6px" },
            el("p", { className: "os-muted", style: "margin:0", textContent: `${s.element} · ${s.mode} · ruled by ${s.ruler}` }),
            el("p", { style: "margin:6px 0 0", textContent: s.text }),
            el("p", { className: "os-muted", style: "margin:6px 0 0", textContent: s.keys })) : null);
      }),
    ];
  }

  function planetsTab() {
    return [
      el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Planets" }),
        BODIES.map(([, name, g, text]) => el("div", { className: "os-row", style: "align-items:flex-start;padding:5px 0;flex-wrap:nowrap" },
          el("span", { style: "width:1.4em;text-align:center;font-size:1.1em", textContent: g + VS, "aria-hidden": "true" }),
          el("span", {}, el("strong", { textContent: name }), " ", el("span", { textContent: text })))),
        el("p", { className: "os-muted", style: "margin:6px 0 0", textContent: "A planet's sign shows the style it works in; its house shows the area of life." })),
      el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Houses" }),
        HOUSES.map((h, i) => el("div", { style: "padding:3px 0" }, el("strong", { textContent: `${i + 1}. ` }), h))),
    ];
  }

  function render() {
    const content = tab === "sky" ? skyTab() : tab === "charts" ? chartsTab() : tab === "signs" ? signsTab() : planetsTab();
    body.replaceChildren(tabs(), ...[content].flat(Infinity).filter(Boolean),
      el("p", { className: "os-muted", style: "margin:4px 2px 0", textContent: "For reflection and fun, not prediction or advice. Positions are worked out on this device and are close, not exact." }));
  }

  symphony.onDataChange(async () => { await load(); render(); });
  render();
});
