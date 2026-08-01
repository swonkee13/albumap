import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

type Status = { id: string; na?: boolean };
const DEFAULT_STATUSES: Status[] = [
  { id: "not_started" }, { id: "scratch" }, { id: "tracked" },
  { id: "comped" }, { id: "done" }, { id: "na", na: true },
];
const LEGACY: Record<string, string> = {
  "0": "not_started", "1": "scratch", "2": "tracked", "3": "comped", "4": "done", "5": "na",
  tracking: "tracked", not_applicable: "na",
};

async function load(shareId: string) {
  try {
    const admin = createAdminClient();
    const { data: album } = await admin
      .from("albums")
      .select("id, title, artist, instruments, statuses")
      .eq("share_id", shareId)
      .maybeSingle();
    if (!album) return null;

    const instrumentCount = Array.isArray(album.instruments)
      ? (album.instruments as string[]).length
      : 0;

    // Progress model: order defines completion; na statuses excluded.
    const statuses: Status[] =
      Array.isArray(album.statuses) && album.statuses.length
        ? (album.statuses as Status[])
        : DEFAULT_STATUSES;
    const nonNA = statuses.filter((s) => !s.na);
    const lastId = nonNA.length ? nonNA[nonNA.length - 1].id : null;
    const progressOf = (rawId: string | null): number | null => {
      if (rawId == null) return 0;
      const id = LEGACY[rawId] ?? rawId;
      const st = statuses.find((s) => s.id === id);
      if (st && st.na) return null;
      let rank = st ? nonNA.findIndex((s) => s.id === id) : 0;
      if (rank < 0) rank = 0;
      return nonNA.length > 1 ? rank / (nonNA.length - 1) : rank === nonNA.length - 1 ? 1 : 0;
    };

    const { data: songs } = await admin
      .from("songs")
      .select("id")
      .eq("album_id", album.id);
    const songIds = (songs ?? []).map((s) => s.id);

    let tracks: Array<{ song_id: string; status: string }> = [];
    if (songIds.length) {
      const { data } = await admin
        .from("song_tracks")
        .select("song_id, status")
        .in("song_id", songIds);
      tracks = data ?? [];
    }

    // Per song: sum of non-N/A progress, and how many parts are N/A (excluded).
    const sumBySong: Record<string, number> = {};
    const naBySong: Record<string, number> = {};
    let partsDone = 0;
    for (const t of tracks) {
      const p = progressOf(t.status);
      if (p === null) {
        naBySong[t.song_id] = (naBySong[t.song_id] ?? 0) + 1;
        continue;
      }
      sumBySong[t.song_id] = (sumBySong[t.song_id] ?? 0) + p;
      if ((LEGACY[t.status] ?? t.status) === lastId) partsDone++;
    }

    const songCount = (songs ?? []).length;
    let totalParts = 0;
    let acc = 0;
    for (const s of songs ?? []) {
      const denom = Math.max(0, instrumentCount - (naBySong[s.id] ?? 0));
      totalParts += denom;
      if (denom > 0) acc += (sumBySong[s.id] ?? 0) / denom;
    }
    const overall = songCount > 0 ? Math.round((acc / songCount) * 100) : 0;

    return {
      title: album.title as string,
      artist: (album.artist as string) || "",
      songCount,
      partsDone,
      totalParts,
      overall,
    };
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ shareId: string }>;
}): Promise<Metadata> {
  const { shareId } = await params;
  const data = await load(shareId);
  if (!data) return { title: "albumap" };
  return {
    title: `${data.title} — ${data.overall}% complete · albumap`,
    description: `${data.artist} is making a record. Follow along.`,
  };
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const data = await load(shareId);

  if (!data) {
    return (
      <div style={shell}>
        <div style={{ color: "#9a9aa2" }}>This share link isn’t active.</div>
      </div>
    );
  }

  const R = 54;
  const C = 2 * Math.PI * R;
  const off = C * (1 - data.overall / 100);

  return (
    <div style={shell}>
      <div style={card}>
        <div style={{ fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9a9aa2", fontWeight: 600 }}>
          Album in production
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", margin: "10px 0 4px" }}>
          {data.title}
        </div>
        <div style={{ color: "#a1a1aa", fontSize: 15 }}>{data.artist}</div>

        <div style={{ position: "relative", width: 160, height: 160, margin: "26px auto 6px" }}>
          <svg width="160" height="160" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="80" cy="80" r={R} stroke="#26262b" strokeWidth="12" fill="none" />
            <circle
              cx="80"
              cy="80"
              r={R}
              stroke="#FF4D1C"
              strokeWidth="12"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={off}
            />
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: "#FF6338" }}>{data.overall}%</span>
          </div>
        </div>
        <div style={{ color: "#9a9aa2", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Album complete
        </div>

        <div style={stats}>
          <div>
            <div style={statN}>{data.songCount}</div>
            <div style={statL}>Songs</div>
          </div>
          <div>
            <div style={statN}>{data.partsDone}/{data.totalParts}</div>
            <div style={statL}>Parts done</div>
          </div>
        </div>

        <div style={{ marginTop: 26, fontSize: 12.5, color: "#6b6b73" }}>
          Made with{" "}
          <span style={{ color: "#f4f4f5", fontWeight: 700 }}>
            album<span style={{ color: "#FF4D1C" }}>map</span>
          </span>
        </div>
      </div>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background:
    "radial-gradient(60% 50% at 50% 0%, rgba(255,77,28,0.12), transparent 70%), #0a0a0b",
  color: "#f4f4f5",
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif",
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "linear-gradient(150deg,#20140f,#141417)",
  border: "1px solid #2a2a30",
  borderRadius: 18,
  padding: "34px 28px",
  textAlign: "center",
  boxShadow: "0 30px 80px rgba(0,0,0,.5)",
};
const stats: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 40,
  marginTop: 24,
};
const statN: React.CSSProperties = { fontSize: 22, fontWeight: 700 };
const statL: React.CSSProperties = {
  fontSize: 11,
  color: "#6b6b73",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginTop: 2,
};
