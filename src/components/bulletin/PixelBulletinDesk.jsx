import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import BulletinBoard from "./BulletinBoard";
import MentionAlertBanner from "./MentionAlertBanner";
import PinnedPollCard from "./PinnedPollCard";
import { SignpostHelpText } from "./BulletinComposer";
import { flattenGroupTree } from "@/lib/groupTree";
import { isSubsystem } from "@/lib/subsystemUtils";
import { usePixelDesk } from "@/lib/uiLook";
import "@/styles/pixel/social.css";

// The Bulletins page in the pixel look (the "Bulletin board, desktop"
// mockup): boards on the left (the main board, then every group's and
// subsystem's own board), the open board in the middle, and on the right
// the mention alerts, pinned polls and how signing works. Each board is
// the same BulletinBoard a group's profile shows (groupId), so nothing
// here writes anything of its own. On a phone the panels stack.
const DAY_MS = 24 * 60 * 60 * 1000;

export default function PixelBulletinDesk({ alters, currentAlterId, frontingAlterIds, highlightId, boardOnly }) {
  const desk = usePixelDesk();
  const [boardId, setBoardId] = useState(null); // null = the main board
  const [boardSearch, setBoardSearch] = useState("");
  const [jumpId, setJumpId] = useState(null);

  const { data: groups = [] } = useQuery({ queryKey: ["groups"], queryFn: () => base44.entities.Group.list() });
  const { data: bulletins = [] } = useQuery({
    queryKey: ["bulletins", "all"],
    queryFn: () => base44.entities.Bulletin.list("-created_date"),
  });
  const { data: pinnedPolls = [] } = useQuery({
    queryKey: ["polls", "pinned_in_board"],
    queryFn: () => base44.entities.Poll.filter({ pinned_to_dashboard: true }, "-created_date"),
  });

  // A post reached from a link opens on its own board.
  useEffect(() => {
    if (!highlightId) return;
    const b = bulletins.find((x) => x.id === highlightId);
    if (b) setBoardId(b.group_id || null);
  }, [highlightId, bulletins]);

  // Posts from the last day, per board.
  const fresh = useMemo(() => {
    const since = Date.now() - DAY_MS;
    const m = {};
    for (const b of bulletins) {
      const t = new Date(b.created_date || b.timestamp || 0).getTime();
      if (t >= since) m[b.group_id || "_main"] = (m[b.group_id || "_main"] || 0) + 1;
    }
    return m;
  }, [bulletins]);

  const tree = useMemo(() => flattenGroupTree(groups.filter((g) => !g.is_archived), { sort: "order" }), [groups]);
  const q = boardSearch.trim().toLowerCase();
  const match = (g) => !q || (g.name || "").toLowerCase().includes(q);
  const groupBoards = tree.filter((g) => !isSubsystem(g) && match(g));
  const subBoards = tree.filter((g) => isSubsystem(g) && match(g));
  const current = boardId ? groups.find((g) => g.id === boardId) : null;
  const boardTitle = current ? current.name || "Board" : "Main board";

  const row = (id, name, color, depth = 0) => {
    const n = fresh[id || "_main"] || 0;
    const sel = (boardId || null) === (id || null);
    return (
      <button key={id || "_main"} type="button" className={`pxb-brow${sel ? " sel" : ""}`} aria-pressed={sel}
        style={{ paddingLeft: 6 + depth * 16 }} onClick={() => setBoardId(id || null)}>
        <span className="pxb-sq" style={{ background: color || "var(--px-text-2)" }} />
        <span className="pxb-bname">{name}</span>
        {n > 0 && <span className="pxb-bnum">{sel ? `${n} new` : n}</span>}
      </button>
    );
  };

  const standalonePolls = boardId ? [] : pinnedPolls.filter((p) => !p.bulletin_id);
  const jump = (id) => { setJumpId(id); setTimeout(() => setJumpId(null), 5000); };

  return (
    <div className={`pxb-desk${desk ? " pxb-desk-wide" : ""}`} data-tour="bulletins-page">
      <aside className="pxb-panel pxb-boards" aria-label="Boards">
        <div className="pxb-ttl"><span>Boards</span>{current && <Link className="pxb-ttl-dim" to={`/group/${current.id}`}>open group</Link>}</div>
        <div className="pxb-boards-search">
          <input className="pxb-search" type="search" placeholder="Search boards..." aria-label="Search boards"
            value={boardSearch} onChange={(e) => setBoardSearch(e.target.value)} />
        </div>
        <div className="pxb-boards-list">
          <div className="pxb-bhead">Boards</div>
          {(!q || "main board".includes(q)) && row(null, "Main board", "var(--color-primary)")}
          {groupBoards.length > 0 && <div className="pxb-bhead">Group boards</div>}
          {groupBoards.map((g) => row(g.id, g.name || "Group", g.color, g._depth))}
          {subBoards.length > 0 && <div className="pxb-bhead">Subsystem boards</div>}
          {subBoards.map((g) => row(g.id, g.name || "Subsystem", g.color, g._depth))}
        </div>
      </aside>

      <main className="pxb-main">
        <BulletinBoard
          key={boardId || "_main"}
          alters={alters}
          currentAlterId={currentAlterId}
          frontingAlterIds={frontingAlterIds}
          highlightBulletinId={jumpId || highlightId}
          pageMode
          groupId={boardId}
          boardOnly={boardOnly}
          pixel
          boardTitle={boardTitle}
          newPostTourAnchor="bulletins-new-post"
        />
      </main>

      <aside className="pxb-aside">
        <MentionAlertBanner bulletins={bulletins} currentAlterId={currentAlterId} alters={alters} onJumpToBulletin={jump} pixel />
        {standalonePolls.map((p) => <PinnedPollCard key={p.id} poll={p} currentAlterId={currentAlterId} pixel />)}
        <details className="pxb-panel pxb-side-sec pxb-sign" open={desk}>
          <summary className="pxb-ttl"><span>Signing your posts</span><span className="pxb-ttl-dim">{desk ? "" : "show"}</span></summary>
          <div className="pxb-side-body pxb-help"><SignpostHelpText /></div>
        </details>
      </aside>
    </div>
  );
}
