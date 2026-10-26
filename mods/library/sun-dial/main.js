// Sun dial — a library mod for Oceans Symphony (docs/mods.md).
//
// Draws today's daylight as a 24-hour dial: midnight at the bottom, midday at
// the top, the lit arc from sunrise to sunset, and a hand for "now". Sun times
// are worked out on the device from the place the person picks (no location
// permission, no internet). Saved data: one "place" record { name, lat, lng }.
//
// The sun maths follows the widely used formulas from Astronomical Algorithms
// (Meeus), as in the SunCalc library. Times are good to a minute or two.

symphony.registerPage("dial", async (root) => {
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
  const SVGNS = "http://www.w3.org/2000/svg";
  const svg = (tag, attrs = {}, ...kids) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    for (const k of kids) if (k) n.append(k);
    return n;
  };

  // ── sun maths ────────────────────────────────────────────────────────────
  const rad = Math.PI / 180;
  const dayMs = 86400000, J1970 = 2440588, J2000 = 2451545;
  const toJulian = (d) => d.valueOf() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d) => toJulian(d) - J2000;
  const e = rad * 23.4397;
  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    return M + C + rad * 102.9372 + Math.PI;
  };
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L));
  const rightAscension = (L) => Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));

  function sunAltitude(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat, d = toDays(date);
    const M = solarMeanAnomaly(d), L = eclipticLongitude(M);
    const dec = declination(L), ra = rightAscension(L);
    const H = rad * (280.16 + 360.9856235 * d) - lw - ra;
    return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / rad;
  }

  // Times the sun crosses `angle` degrees (rise, set) on the day of `date`.
  function sunTimes(date, lat, lng) {
    const lw = rad * -lng, phi = rad * lat;
    const noonish = new Date(date); noonish.setHours(12, 0, 0, 0);
    const d = toDays(noonish);
    const J0 = 0.0009;
    const n = Math.round(d - J0 - lw / (2 * Math.PI));
    const ds = J0 + lw / (2 * Math.PI) + n;
    const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L);
    const transit = (x) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const Jnoon = transit(ds);
    const at = (angle) => {
      const cosw = (Math.sin(rad * angle) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
      if (cosw > 1) return { never: "below" };   // sun stays below this angle all day
      if (cosw < -1) return { never: "above" };  // stays above all day
      const w = Math.acos(cosw);
      const Jset = transit(J0 + (w + lw) / (2 * Math.PI) + n);
      return { rise: fromJulian(Jnoon - (Jset - Jnoon)), set: fromJulian(Jset) };
    };
    return {
      noon: fromJulian(Jnoon),
      sun: at(-0.833),        // sunrise / sunset
      civil: at(-6),          // first light / last light
      golden: at(6),          // golden hour ends (morning) / starts (evening)
    };
  }

  // ── places ───────────────────────────────────────────────────────────────
  const CITIES = [
    ["Auckland", -36.85, 174.76], ["Amsterdam", 52.37, 4.9], ["Athens", 37.98, 23.73],
    ["Atlanta", 33.75, -84.39], ["Bangkok", 13.76, 100.5], ["Berlin", 52.52, 13.4],
    ["Bogotá", 4.71, -74.07], ["Boston", 42.36, -71.06], ["Buenos Aires", -34.6, -58.38],
    ["Cairo", 30.04, 31.24], ["Cape Town", -33.92, 18.42], ["Chicago", 41.88, -87.63],
    ["Dallas", 32.78, -96.8], ["Delhi", 28.61, 77.21], ["Denver", 39.74, -104.99],
    ["Dublin", 53.35, -6.26], ["Edinburgh", 55.95, -3.19], ["Helsinki", 60.17, 24.94],
    ["Hong Kong", 22.32, 114.17], ["Honolulu", 21.31, -157.86], ["Istanbul", 41.01, 28.98],
    ["Jakarta", -6.21, 106.85], ["Johannesburg", -26.2, 28.05], ["Lagos", 6.52, 3.38],
    ["Lima", -12.05, -77.04], ["Lisbon", 38.72, -9.14], ["London", 51.51, -0.13],
    ["Los Angeles", 34.05, -118.24], ["Madrid", 40.42, -3.7], ["Manila", 14.6, 120.98],
    ["Melbourne", -37.81, 144.96], ["Mexico City", 19.43, -99.13], ["Miami", 25.76, -80.19],
    ["Montréal", 45.5, -73.57], ["Moscow", 55.76, 37.62], ["Mumbai", 19.08, 72.88],
    ["Nairobi", -1.29, 36.82], ["New York", 40.71, -74.01], ["Oslo", 59.91, 10.75],
    ["Paris", 48.86, 2.35], ["Perth", -31.95, 115.86], ["Phoenix", 33.45, -112.07],
    ["Reykjavík", 64.15, -21.94], ["Rome", 41.9, 12.5], ["San Francisco", 37.77, -122.42],
    ["São Paulo", -23.55, -46.63], ["Seattle", 47.61, -122.33], ["Seoul", 37.57, 126.98],
    ["Singapore", 1.35, 103.82], ["Stockholm", 59.33, 18.07], ["Sydney", -33.87, 151.21],
    ["Tokyo", 35.68, 139.69], ["Toronto", 43.65, -79.38], ["Vancouver", 49.28, -123.12],
    ["Warsaw", 52.23, 21.01], ["Wellington", -41.29, 174.78],
  ];

  const places = await symphony.data.list("place");
  let place = places[places.length - 1] || null;

  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtDur = (ms) => {
    const mins = Math.max(0, Math.round(ms / 60000));
    const h = Math.floor(mins / 60), m = mins % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
  };

  // ── the dial ─────────────────────────────────────────────────────────────
  // Angle for a time of day: midnight at the bottom, noon at the top,
  // morning on the left — like the sun's path across a south-facing sky.
  const minutesOf = (d) => d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
  const angleFor = (mins) => (mins / 1440) * 2 * Math.PI + Math.PI / 2;
  const C = 150, R = 118;
  const pt = (mins, r) => {
    const a = angleFor(mins);
    return [C + r * Math.cos(a), C + r * Math.sin(a)];
  };
  function arc(fromMins, toMins, r) {
    let span = toMins - fromMins;
    if (span < 0) span += 1440;
    const [x1, y1] = pt(fromMins, r), [x2, y2] = pt(fromMins + span, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${span > 720 ? 1 : 0} 1 ${x2} ${y2}`;
  }

  function drawDial(now, times) {
    const s = svg("svg", { viewBox: "0 0 300 300", width: "100%", role: "img", style: "max-width:320px;display:block;margin:0 auto" });
    s.append(svg("circle", { cx: C, cy: C, r: R, fill: "none", "stroke-width": 22, style: "stroke:var(--color-muted,#B6D4E3);opacity:.55" }));
    const band = (t, width, opacity) => {
      if (t.never === "above") s.append(svg("circle", { cx: C, cy: C, r: R, fill: "none", "stroke-width": width, style: `stroke:#f5b942;opacity:${opacity}` }));
      else if (t.rise) s.append(svg("path", { d: arc(minutesOf(t.rise), minutesOf(t.set), R), fill: "none", "stroke-width": width, "stroke-linecap": "butt", style: `stroke:#f5b942;opacity:${opacity}` }));
    };
    band(times.civil, 22, 0.3);
    band(times.sun, 22, 0.75);
    for (let h = 0; h < 24; h++) {
      const [x1, y1] = pt(h * 60, R - 16), [x2, y2] = pt(h * 60, R - (h % 6 === 0 ? 26 : 20));
      s.append(svg("line", { x1, y1, x2, y2, "stroke-width": h % 6 === 0 ? 2 : 1, style: "stroke:var(--color-text-secondary,#64748B)" }));
      if (h % 6 === 0) {
        const [tx, ty] = pt(h * 60, R - 40);
        const label = new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });
        const t = svg("text", { x: tx, y: ty + 4, "text-anchor": "middle", "font-size": 12, style: "fill:var(--color-text-secondary,#64748B)" });
        t.textContent = label;
        s.append(t);
      }
    }
    const nm = minutesOf(now);
    const [hx, hy] = pt(nm, R - 10);
    s.append(svg("line", { x1: C, y1: C, x2: hx, y2: hy, "stroke-width": 3, "stroke-linecap": "round", style: "stroke:var(--color-primary,#3B82F6)" }));
    s.append(svg("circle", { cx: C, cy: C, r: 5, style: "fill:var(--color-primary,#3B82F6)" }));
    const [sx, sy] = pt(nm, R);
    const up = times.sun.never === "above" || (times.sun.rise && now >= times.sun.rise && now <= times.sun.set);
    s.append(svg("circle", { cx: sx, cy: sy, r: 10, "stroke-width": 2, style: `fill:${up ? "#f5b942" : "var(--color-bg,#fff)"};stroke:var(--color-text-primary,#1E293B)` }));
    const title = svg("title");
    title.textContent = `It's ${fmtTime(now)}. ${up ? "The sun is up." : "The sun is down."}`;
    s.prepend(title);
    return s;
  }

  // ── the page ─────────────────────────────────────────────────────────────
  const body = el("div");
  root.append(body);
  let timer = null;

  function placePicker(onDone) {
    const select = el("select", { className: "os-input", "aria-label": "Nearest city" },
      el("option", { value: "", textContent: "Pick the nearest city…" }),
      CITIES.map(([n]) => el("option", { value: n, textContent: n })));
    const lat = el("input", { className: "os-input", inputMode: "decimal", placeholder: "Latitude, e.g. 51.5", value: place ? String(place.lat) : "" });
    const lng = el("input", { className: "os-input", inputMode: "decimal", placeholder: "Longitude, e.g. -0.13", value: place ? String(place.lng) : "" });
    const name = el("input", { className: "os-input", placeholder: "Name (optional)", value: place ? place.name || "" : "" });
    select.onchange = () => {
      const c = CITIES.find(([n]) => n === select.value);
      if (c) { name.value = c[0]; lat.value = String(c[1]); lng.value = String(c[2]); }
    };
    const save = el("button", { className: "os-button", textContent: "Use this place" });
    save.onclick = async () => {
      const la = Number(lat.value), lo = Number(lng.value);
      if (!Number.isFinite(la) || Math.abs(la) > 90 || !Number.isFinite(lo) || Math.abs(lo) > 180) {
        symphony.ui.toast("Latitude is between -90 and 90, longitude between -180 and 180.");
        return;
      }
      const fields = { name: name.value.trim() || `${la.toFixed(2)}, ${lo.toFixed(2)}`, lat: la, lng: lo };
      place = place ? await symphony.data.update("place", place.id, fields) : await symphony.data.create("place", fields);
      onDone();
    };
    return el("div", { className: "os-card" },
      el("p", { className: "os-h", textContent: "Where are you?" }),
      el("p", { className: "os-muted", textContent: "Sun times are worked out on this device from the place you pick. A nearby city is close enough; nothing is looked up online." }),
      el("label", { className: "os-label", textContent: "Nearest city" }), select,
      el("label", { className: "os-label", textContent: "Or exact numbers" }),
      el("div", { className: "os-row" }, el("div", { style: "flex:1;min-width:120px" }, lat), el("div", { style: "flex:1;min-width:120px" }, lng)),
      el("label", { className: "os-label", textContent: "Name" }), name,
      el("div", { className: "os-row", style: "margin-top:10px" }, save,
        place ? el("button", { className: "os-button secondary", textContent: "Cancel", onclick: onDone }) : null));
  }

  function row(label, value) {
    return el("div", { className: "os-row", style: "justify-content:space-between;padding:4px 0" },
      el("span", { className: "os-muted", textContent: label }), el("span", { textContent: value }));
  }

  function render() {
    clearInterval(timer);
    if (!place) { body.replaceChildren(placePicker(render)); return; }
    const now = new Date();
    const times = sunTimes(now, place.lat, place.lng);
    const alt = sunAltitude(now, place.lat, place.lng);
    const t = times.sun;
    let headline;
    if (t.never === "above") headline = "The sun doesn't set here today.";
    else if (t.never === "below") headline = "The sun doesn't rise here today.";
    else if (now < t.rise) headline = `Sunrise in ${fmtDur(t.rise - now)}`;
    else if (now <= t.set) headline = `${fmtDur(t.set - now)} of daylight left`;
    else headline = `The sun set ${fmtDur(now - t.set)} ago`;

    const details = el("div", { className: "os-card" },
      t.rise ? row("Sunrise", fmtTime(t.rise)) : null,
      row("Sun highest", fmtTime(times.noon)),
      t.set ? row("Sunset", fmtTime(t.set)) : null,
      t.rise ? row("Daylight today", fmtDur(t.set - t.rise)) : null,
      times.civil.rise ? row("First light", fmtTime(times.civil.rise)) : null,
      times.civil.set ? row("Last light", fmtTime(times.civil.set)) : null,
      times.golden.set && t.set ? row("Evening golden hour", `${fmtTime(times.golden.set)} – ${fmtTime(t.set)}`) : null,
      row("Sun height now", `${Math.round(alt)}°${alt < 0 ? " (below the horizon)" : ""}`));

    body.replaceChildren(
      el("div", { className: "os-card", style: "text-align:center" },
        el("p", { style: "font-size:1.6em;font-weight:600;margin:0", textContent: fmtTime(now) }),
        el("p", { className: "os-muted", style: "margin:2px 0 8px", textContent: headline }),
        drawDial(now, times),
        el("p", { className: "os-muted", style: "margin:8px 0 0", textContent: "Gold is daylight, the paler band is twilight." })),
      details,
      el("div", { className: "os-row", style: "justify-content:space-between" },
        el("span", { className: "os-muted", textContent: place.name }),
        el("button", { className: "os-button secondary small", textContent: "Change place", onclick: () => { clearInterval(timer); body.replaceChildren(placePicker(render)); } })));
    timer = setInterval(render, 60000);
  }

  symphony.onDataChange(async () => {
    const list = await symphony.data.list("place");
    place = list[list.length - 1] || null;
  });
  render();
});
