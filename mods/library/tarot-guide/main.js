// Tarot guide — a library mod for Oceans Symphony (docs/mods.md).
//
// A text-only guide to the 78 cards of a standard (Rider–Waite–Smith style)
// deck: keywords upright and reversed and a short meaning for each. Look
// cards up while reading with your own deck, record the cards you drew, or
// draw here, and keep a journal of readings. No pictures, on purpose: bring
// your own deck.
//
// Saved data:
//   "reading" { spread, question, note, cards: [{ id, reversed, position }],
//               fronting_ids }

symphony.registerPage("tarot", async (root) => {
  const t = symphony.terms;
  const canFront = symphony.permissions.includes("fronting:read");
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
    for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
    return n;
  };

  // ── the deck ─────────────────────────────────────────────────────────────
  // [name, upright, reversed, meaning]
  const MAJOR = [
    ["The Fool", "Beginnings, trust, spontaneity, a leap", "Recklessness, hesitation, holding back", "Stepping into the unknown with an open heart. Something new is starting, and it asks for curiosity more than certainty."],
    ["The Magician", "Skill, focus, willpower, resources", "Scattered energy, untapped talent, trickery", "You have what you need to begin. Bring your tools together and act with intention."],
    ["The High Priestess", "Intuition, mystery, inner knowing, stillness", "Ignoring your gut, secrets, disconnection", "The quiet voice inside knows something. Listen, wait and let the answer surface."],
    ["The Empress", "Nurture, abundance, creativity, the senses", "Neglecting yourself, smothering, creative block", "Growth through care. Tend to your body, your projects and the people you love, and let things bloom."],
    ["The Emperor", "Structure, stability, authority, protection", "Rigidity, control, lack of discipline", "Order and boundaries that keep things safe. Build a steady frame and take responsibility for it."],
    ["The Hierophant", "Tradition, teaching, belonging, shared beliefs", "Questioning convention, breaking rules, going your own way", "Learning from what came before, or from a mentor or community, and deciding what you keep."],
    ["The Lovers", "Connection, love, values, a meaningful choice", "Imbalance, misalignment, a difficult choice", "A bond or a decision that comes from the heart. What do you truly value?"],
    ["The Chariot", "Determination, direction, momentum, will", "Losing direction, pulled two ways, stalled", "Pulling different forces together and moving forward on purpose."],
    ["Strength", "Courage, gentleness, patience, inner strength", "Self-doubt, low energy, harshness", "Quiet strength: meeting fear or wildness with compassion rather than force."],
    ["The Hermit", "Solitude, reflection, inner guidance, rest", "Isolation, loneliness, avoiding inner work", "Stepping back to look inward. A lantern lights one step at a time."],
    ["Wheel of Fortune", "Cycles, change, turning points, luck", "Resisting change, setbacks, feeling stuck", "Things turn. What's up comes down and what's down rises; move with the cycle."],
    ["Justice", "Fairness, truth, cause and effect, accountability", "Unfairness, dishonesty, avoiding responsibility", "Seeing clearly and choosing what's fair. Actions have consequences, kind ones too."],
    ["The Hanged One", "Pause, surrender, new perspective, waiting", "Stalling, resistance, needless sacrifice", "A pause that turns things upside down so you can see them differently. Often called The Hanged Man."],
    ["Death", "Endings, transformation, transition, release", "Resisting change, lingering, stagnation", "Rarely literal. Something is ending so something else can begin; let it go gently."],
    ["Temperance", "Balance, moderation, patience, healing", "Imbalance, excess, hurry", "Blending things in the right measure. Slow, steady and kind wins here."],
    ["The Devil", "Attachment, habits, temptation, shadow", "Release, breaking free, reclaiming power", "Something has a hold. Look at the chain honestly; it's often looser than it feels."],
    ["The Tower", "Sudden change, upheaval, revelation, breaking open", "Avoiding disaster, fear of change, delayed upheaval", "What was built on shaky ground comes down. Hard, but it clears the way for truth."],
    ["The Star", "Hope, healing, renewal, calm", "Discouragement, disconnection, lost faith", "After the storm, a quiet light. Rest, heal and let hope back in."],
    ["The Moon", "Uncertainty, dreams, intuition, the unseen", "Clarity returning, released fears, confusion lifting", "Things aren't fully visible yet. Move carefully and trust feelings, without believing every fear."],
    ["The Sun", "Joy, warmth, success, vitality", "Dimmed joy, temporary clouds, overdoing it", "Simple happiness and clarity. Let yourself be seen and enjoy what's good."],
    ["Judgement", "Awakening, reckoning, calling, forgiveness", "Self-criticism, doubt, ignoring the call", "A moment to rise, reflect on the past with honesty and answer what's calling you."],
    ["The World", "Completion, wholeness, integration, arrival", "Unfinished business, delays, seeking closure", "A cycle comes together. Celebrate how far you've come before the next begins."],
  ];
  const SUITS = {
    Wands: { element: "Fire", about: "energy, passion, creativity and action" },
    Cups: { element: "Water", about: "feelings, relationships and intuition" },
    Swords: { element: "Air", about: "thoughts, words, truth and conflict" },
    Pentacles: { element: "Earth", about: "body, home, money, work and the material world" },
  };
  const RANKS = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Page", "Knight", "Queen", "King"];
  // [upright, reversed, meaning] per suit, in RANKS order.
  const MINOR = {
    Wands: [
      ["Inspiration, a spark, new energy", "Delays, lack of drive, false starts", "A fresh burst of creative fire. An idea wants to be acted on."],
      ["Planning, choices, looking ahead", "Fear of the unknown, indecision", "Holding your world in your hands and choosing where to go next."],
      ["Expansion, progress, foresight", "Obstacles, frustration, delays", "Your ships are coming in. Early efforts start to pay off."],
      ["Celebration, home, community, milestones", "Instability at home, cancelled plans", "A happy, stable moment worth marking with your people."],
      ["Competition, friction, clashing ideas", "Avoiding conflict, finding agreement", "Lots of energy pulling in different directions. Friction can be playful or tiring."],
      ["Recognition, success, confidence", "Self-doubt, needing others' approval", "A win you can be proud of, seen by others."],
      ["Standing your ground, perseverance", "Overwhelm, giving up, feeling outnumbered", "Holding your position with courage when pushed."],
      ["Speed, movement, news, momentum", "Delays, scattered energy, waiting", "Things move fast. Messages arrive and plans take off."],
      ["Resilience, persistence, last stretch", "Exhaustion, defensiveness, paranoia", "Tired but still standing, close to the end."],
      ["Burden, responsibility, overload", "Putting things down, delegating", "Carrying too much. What could you set down or share?"],
      ["Enthusiasm, exploration, curiosity", "Impatience, scattered ideas", "A playful messenger of new adventures."],
      ["Action, adventure, boldness", "Haste, recklessness, frustration", "Charging ahead with passion; watch the speed."],
      ["Confidence, warmth, determination", "Insecurity, jealousy, burnout", "Vibrant, independent and generous with energy."],
      ["Vision, leadership, big-picture thinking", "Impulsiveness, overbearing, high expectations", "A leader who inspires by acting on a vision."],
    ],
    Cups: [
      ["New feelings, love, compassion, openness", "Blocked emotions, emptiness", "An overflowing cup: an open heart and a new emotional start."],
      ["Partnership, mutual care, connection", "Imbalance, disconnection, misunderstanding", "Two people meeting as equals."],
      ["Friendship, celebration, community", "Overindulgence, gossip, isolation", "Joy shared with friends."],
      ["Apathy, contemplation, missed offers", "New awareness, accepting an offer", "Turned inward, not noticing what's being offered."],
      ["Loss, grief, regret", "Acceptance, moving on, forgiveness", "Mourning what spilled, while two cups still stand behind you."],
      ["Nostalgia, childhood, innocence, kindness", "Stuck in the past, moving forward", "Sweet memories and simple kindness."],
      ["Choices, daydreams, illusion", "Clarity, focus, deciding", "Many possibilities; some real, some fantasy."],
      ["Walking away, seeking more, leaving", "Fear of leaving, aimlessness", "Leaving behind something that no longer fills you."],
      ["Contentment, satisfaction, wishes", "Dissatisfaction, materialism", "The \"wish card\": feeling content with what you have."],
      ["Harmony, family, belonging", "Disconnection, broken harmony", "Emotional fulfilment with the people who feel like home."],
      ["Creative ideas, intuition, sensitivity", "Emotional immaturity, blocked creativity", "A gentle messenger of feelings and imagination."],
      ["Romance, charm, following the heart", "Moodiness, unrealistic hopes", "Moving forward led by feelings and ideals."],
      ["Compassion, calm, emotional security", "Self-neglect, codependence", "Deep empathy held with steadiness."],
      ["Emotional balance, diplomacy, generosity", "Moodiness, manipulation, coldness", "Calm in feeling, kind and steady under pressure."],
    ],
    Swords: [
      ["Clarity, breakthrough, truth", "Confusion, chaos, harsh words", "A sharp new idea cuts through the fog."],
      ["Stalemate, difficult choice, avoidance", "Information overload, indecision", "Blindfolded and balanced, putting off a choice."],
      ["Heartbreak, sorrow, painful truth", "Healing, forgiveness, releasing pain", "A painful truth or loss that needs to be felt."],
      ["Rest, recovery, contemplation", "Restlessness, burnout, rushing back", "Lie down a while. Rest is part of the work."],
      ["Conflict, winning at a cost, tension", "Reconciliation, making amends", "A fight where nobody really wins."],
      ["Transition, moving on, calmer waters", "Unfinished business, resistance to change", "Leaving rough waters for somewhere quieter."],
      ["Strategy, secrecy, getting away with something", "Coming clean, conscience", "Acting alone or in secret; is it wise or avoidant?"],
      ["Feeling trapped, restriction, self-limiting thoughts", "Release, new perspective, freedom", "The bindings are looser than they seem."],
      ["Anxiety, worry, sleepless nights", "Hope, reaching out, easing fear", "Fears loudest in the dark. Morning often looks different."],
      ["Rock bottom, painful ending, it's over", "Recovery, rising, the worst has passed", "A hard ending; from here the only way is up."],
      ["Curiosity, new ideas, eagerness to learn", "Hasty words, all talk", "A sharp, curious mind asking questions."],
      ["Ambition, quick action, drive", "Rushing, unfocused, aggressive", "Charging at a goal with words and ideas."],
      ["Clear thinking, honesty, independence", "Coldness, bitterness, harshness", "Perceptive and direct, speaking truth with care."],
      ["Intellect, authority, clear judgement", "Manipulation, cruelty, misuse of power", "Decisions made with a clear, fair mind."],
    ],
    Pentacles: [
      ["A new opportunity, prosperity, grounding", "Missed chance, poor planning", "A seed of something real and lasting."],
      ["Balance, juggling, adaptability", "Overwhelm, disorganisation", "Keeping several things in the air."],
      ["Teamwork, skill, learning", "Lack of teamwork, poor quality", "Building something well, together."],
      ["Security, saving, holding on", "Generosity, letting go, or greed", "Holding tight to what you have; safety or fear?"],
      ["Hardship, insecurity, feeling left out", "Recovery, help arriving", "A hard time, with help nearer than it looks."],
      ["Generosity, giving and receiving, sharing", "Strings attached, debt, one-sided giving", "Resources flowing between people."],
      ["Patience, long-term view, investment", "Impatience, poor returns", "Waiting for slow growth to ripen."],
      ["Skill, dedication, practice", "Perfectionism, lack of focus", "Getting better through steady practice."],
      ["Self-sufficiency, comfort, reward", "Overwork, dependence", "Enjoying what you've grown for yourself."],
      ["Legacy, family, long-term security", "Family conflict, instability", "Lasting wealth of every kind, passed along."],
      ["Ambition, a new skill, study", "Procrastination, lack of progress", "A practical, eager student."],
      ["Hard work, routine, reliability", "Boredom, stuck in a rut", "Slow, steady and dependable progress."],
      ["Nurturing, practicality, comfort", "Self-care neglected, work-home imbalance", "Warm, grounded care for body and home."],
      ["Abundance, security, discipline", "Greed, stubbornness, overwork", "Steady success built on patience."],
    ],
  };

  const DECK = [
    ...MAJOR.map(([name, up, rev, text], i) => ({ id: `major-${i}`, name, group: "Major", number: i, up, rev, text })),
    ...Object.entries(MINOR).flatMap(([suit, cards]) => cards.map(([up, rev, text], i) => ({
      id: `${suit.toLowerCase()}-${i + 1}`, name: `${RANKS[i]} of ${suit}`, group: suit, up, rev, text,
    }))),
  ];
  const card = (id) => DECK.find((c) => c.id === id);

  const SPREADS = {
    one: { name: "One card", positions: ["The card"] },
    ppf: { name: "Past · present · future", positions: ["Past", "Present", "Future"] },
    sao: { name: "Situation · action · outcome", positions: ["Situation", "Action", "Outcome"] },
    mbs: { name: "Mind · body · spirit", positions: ["Mind", "Body", "Spirit"] },
    cross: { name: "Five-card cross", positions: ["Now", "Challenge", "Root", "Advice", "Where it's going"] },
  };

  // ── data ─────────────────────────────────────────────────────────────────
  let readings = [];
  let alters = [];
  const load = async () => { readings = await symphony.data.list("reading"); };
  if (canAlters) { try { alters = await symphony.alters.list(); } catch { alters = []; } }
  const nameOf = (id) => (alters.find((a) => a.id === id) || {}).name || "";
  await load();

  const rand = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; };

  // ── page ─────────────────────────────────────────────────────────────────
  let tab = "cards";
  let group = "All";
  let query = "";
  let openCard = null;
  let spread = "one";
  let reversals = true;
  let drawn = [];    // [{ id, reversed, position }]
  let manual = false;
  const body = el("div");
  root.append(body);

  function tabs() {
    return el("div", { className: "os-tabs", role: "tablist" }, [["cards", "Cards"], ["draw", "Reading"], ["journal", "Journal"]].map(([id, label]) =>
      el("button", { className: "os-chip", role: "tab", textContent: label, "aria-pressed": tab === id ? "true" : "false", onclick: () => { tab = id; render(); } })));
  }

  function cardBlock(c, reversed, position) {
    return el("div", { className: "os-card" },
      position ? el("p", { className: "os-muted", style: "margin:0 0 2px", textContent: position }) : null,
      el("p", { style: "font-weight:600;margin:0", textContent: `${c.name}${reversed ? " (reversed)" : ""}` }),
      el("p", { style: "margin:4px 0 0", textContent: reversed ? c.rev : c.up }),
      el("p", { className: "os-muted", style: "margin:4px 0 0", textContent: c.text }),
      reversed ? el("p", { className: "os-muted", style: "margin:4px 0 0", textContent: `Upright: ${c.up}` }) : null);
  }

  function cardsTab() {
    const search = el("input", { className: "os-input", type: "search", placeholder: "Search cards or meanings…", value: query, "aria-label": "Search cards" });
    search.oninput = () => { query = search.value; drawList(); };
    const filters = el("div", { className: "os-tabs" }, ["All", "Major", ...Object.keys(SUITS)].map((g) =>
      el("button", { className: "os-chip", textContent: g === "Major" ? "Major arcana" : g, "aria-pressed": group === g ? "true" : "false", onclick: () => { group = g; render(); } })));
    const list = el("div");
    function drawList() {
      const q = query.trim().toLowerCase();
      const cards = DECK.filter((c) => (group === "All" || c.group === group)
        && (!q || `${c.name} ${c.up} ${c.rev} ${c.text}`.toLowerCase().includes(q)));
      list.replaceChildren(
        group !== "All" && SUITS[group] ? el("p", { className: "os-muted", style: "margin:0 0 8px", textContent: `${group} · ${SUITS[group].element}: ${SUITS[group].about}.` }) : null,
        group === "Major" ? el("p", { className: "os-muted", style: "margin:0 0 8px", textContent: "The major arcana: the big themes and turning points, from The Fool to The World." }) : null,
        ...cards.map((c) => {
          const open = openCard === c.id;
          return el("div", { className: "os-card", style: "padding:10px 12px" },
            el("button", {
              style: "all:unset;cursor:pointer;display:flex;justify-content:space-between;gap:8px;width:100%",
              "aria-expanded": open ? "true" : "false",
              onclick: () => { openCard = open ? null : c.id; drawList(); },
            }, el("span", { style: "font-weight:600", textContent: c.group === "Major" ? `${c.number} · ${c.name}` : c.name }),
            el("span", { className: "os-muted", textContent: open ? "−" : "+" })),
            open ? el("div", { style: "margin-top:6px" },
              el("p", { style: "margin:0" }, el("strong", { textContent: "Upright: " }), c.up),
              el("p", { style: "margin:4px 0 0" }, el("strong", { textContent: "Reversed: " }), c.rev),
              el("p", { className: "os-muted", style: "margin:6px 0 0", textContent: c.text })) : null);
        }),
        cards.length ? null : el("p", { className: "os-muted", textContent: "No cards match." }));
    }
    drawList();
    return [search, el("div", { style: "height:8px" }), filters, list];
  }

  function drawTab() {
    const sp = SPREADS[spread];
    const spreadSel = el("select", { className: "os-input", "aria-label": "Spread" },
      Object.entries(SPREADS).map(([id, s]) => el("option", { value: id, textContent: s.name, selected: id === spread })));
    spreadSel.onchange = () => { spread = spreadSel.value; drawn = []; render(); };

    const modeRow = el("div", { className: "os-tabs" },
      el("button", { className: "os-chip", textContent: "I drew from my deck", "aria-pressed": manual ? "true" : "false", onclick: () => { manual = true; drawn = []; render(); } }),
      el("button", { className: "os-chip", textContent: "Draw here", "aria-pressed": manual ? "false" : "true", onclick: () => { manual = false; drawn = []; render(); } }));

    const controls = [];
    if (manual) {
      const next = sp.positions[drawn.length];
      if (next) {
        const pick = el("select", { className: "os-input", "aria-label": `Card for ${next}` },
          el("option", { value: "", textContent: `Which card is "${next}"?` }),
          ["Major", ...Object.keys(SUITS)].map((g) => el("optgroup", { label: g === "Major" ? "Major arcana" : g },
            DECK.filter((c) => c.group === g).map((c) => el("option", { value: c.id, textContent: c.name })))));
        const rev = el("input", { type: "checkbox" });
        const add = el("button", { className: "os-button", textContent: "Add card" });
        add.onclick = () => { if (!pick.value) return; drawn.push({ id: pick.value, reversed: rev.checked, position: next }); render(); };
        controls.push(pick, el("div", { className: "os-row", style: "margin-top:8px;justify-content:space-between" },
          el("label", { className: "os-row", style: "cursor:pointer" }, rev, "Reversed"), add));
      }
    } else {
      const rev = el("input", { type: "checkbox", checked: reversals });
      rev.onchange = () => { reversals = rev.checked; };
      const go = el("button", { className: "os-button", textContent: drawn.length ? "Draw again" : "Shuffle and draw" });
      go.onclick = () => {
        const pool = DECK.map((c) => c.id);
        drawn = sp.positions.map((position) => ({ id: pool.splice(rand(pool.length), 1)[0], reversed: reversals && rand(2) === 1, position }));
        render();
      };
      controls.push(el("div", { className: "os-row", style: "justify-content:space-between" },
        el("label", { className: "os-row", style: "cursor:pointer" }, rev, "Include reversed cards"), go));
    }

    const result = drawn.map((d) => cardBlock(card(d.id), d.reversed, sp.positions.length > 1 ? d.position : null));
    let saveBox = null;
    if (drawn.length && drawn.length === sp.positions.length) {
      const question = el("input", { className: "os-input", placeholder: "Your question (optional)" });
      const note = el("textarea", { className: "os-input", rows: 3, placeholder: "What comes up for you? (optional)" });
      const save = el("button", { className: "os-button", textContent: "Save to journal" });
      save.onclick = async () => {
        let fronting_ids = [];
        if (canFront) { try { fronting_ids = (await symphony.fronting.current()).map((f) => f.alter_id); } catch { /* fine */ } }
        await symphony.data.create("reading", { spread, question: question.value.trim(), note: note.value.trim(), cards: drawn, fronting_ids, from_own_deck: manual });
        drawn = [];
        symphony.ui.toast("Reading saved");
        render();
      };
      saveBox = el("div", { className: "os-card" }, el("p", { className: "os-h", textContent: "Keep this reading?" }), question, el("div", { style: "height:6px" }), note,
        el("div", { className: "os-row", style: "margin-top:8px;justify-content:space-between" },
          el("span", { className: "os-muted", textContent: canFront ? `Remembers who was ${t.fronting || "fronting"}` : "" }), save));
    }

    return [
      el("div", { className: "os-card" }, el("label", { className: "os-label", style: "margin-top:0", textContent: "Spread" }), spreadSel,
        el("div", { style: "height:8px" }), modeRow, controls),
      result, saveBox,
    ];
  }

  function journalTab() {
    if (!readings.length) return [el("p", { className: "os-muted", textContent: "No saved readings yet. Draw or record one in the Reading tab." })];
    const list = [...readings].sort((a, b) => (a.created_date < b.created_date ? 1 : -1));
    return list.map((r) => {
      const who = (r.fronting_ids || []).map(nameOf).filter(Boolean).join(", ");
      const positions = (SPREADS[r.spread] || SPREADS.one).positions;
      return el("details", { className: "os-card" },
        el("summary", { style: "cursor:pointer" },
          el("strong", { textContent: r.question || (SPREADS[r.spread] || SPREADS.one).name }),
          el("div", { className: "os-muted", textContent: `${new Date(r.created_date).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })}${who ? ` · ${who}` : ""} · ${(r.cards || []).map((c) => (card(c.id) || {}).name).filter(Boolean).join(", ")}` })),
        (r.cards || []).map((c) => card(c.id) ? cardBlock(card(c.id), c.reversed, positions.length > 1 ? c.position : null) : null),
        r.note ? el("p", { style: "white-space:pre-wrap;margin:6px 0", textContent: r.note }) : null,
        el("button", {
          className: "os-button secondary small", textContent: "Remove reading",
          onclick: async () => {
            if (await symphony.ui.confirm("Remove this reading?", "You can bring it back from Recent changes.", { confirmLabel: "Remove", destructive: true })) {
              await symphony.data.remove("reading", r.id);
            }
          },
        }));
    });
  }

  function render() {
    const content = tab === "cards" ? cardsTab() : tab === "draw" ? drawTab() : journalTab();
    body.replaceChildren(tabs(), ...[content].flat(Infinity).filter(Boolean),
      el("p", { className: "os-muted", style: "margin:4px 2px 0", textContent: "Tarot here is a tool for reflection, not a prediction or advice. Meanings vary between readers; your own sense of a card counts most." }));
  }

  symphony.onDataChange(async () => { await load(); if (tab === "journal") render(); });
  render();
});
