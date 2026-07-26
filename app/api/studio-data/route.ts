import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { colorFor } from "@/lib/activity";

const INSTRUMENTS = ["Drums", "Bass", "Guitar", "Synth", "Lead Vox", "BGV"];

const NAME_TO_STATE: Record<string, number> = {
  not_started: 0,
  scratch: 1,
  tracking: 1,
  tracked: 2,
  comped: 3,
  done: 4,
};

function toState(v: string | null): number {
  if (v == null) return 0;
  const n = parseInt(v, 10);
  if (!Number.isNaN(n) && String(n) === v) return Math.max(0, Math.min(4, n));
  return NAME_TO_STATE[v] ?? 0;
}

function slug(s: string): string {
  const out = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return out || "untitled";
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.round((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  return `${d} days ago`;
}

const ARTWORK_LABELS = [
  "Front cover",
  "Inside / gatefold",
  "Back cover",
  "Vinyl label",
  "Insert / lyric sheet",
];
const MERCH_LABELS = [
  "Tour tee — front",
  "Tour tee — back",
  "Vinyl jacket",
  "Longsleeve",
  "Poster (18×24)",
];

async function signGet(
  client: ReturnType<typeof r2Client>,
  key: string,
): Promise<string | null> {
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }),
      { expiresIn: 3600 },
    );
  } catch {
    return null;
  }
}

// Returns the signed-in user's real studio, shaped exactly like the mockup's
// in-memory `artists` array so the existing UI renders it unchanged.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ artists: [] }, { status: 401 });

  const { data: albumsData } = await supabase
    .from("albums")
    .select("id, title, artist, created_at, share_id, schedule")
    .order("created_at", { ascending: true });
  const albums = albumsData ?? [];
  const albumIds = albums.map((a) => a.id);

  let songs: Array<{
    id: string;
    title: string;
    position: number;
    album_id: string;
    lyrics: string | null;
    notes: string | null;
    refs: unknown;
    credits: unknown;
  }> = [];
  if (albumIds.length) {
    const { data } = await supabase
      .from("songs")
      .select("id, title, position, album_id, lyrics, notes, refs, credits")
      .in("album_id", albumIds)
      .order("position", { ascending: true });
    songs = data ?? [];
  }
  const songIds = songs.map((s) => s.id);

  const client = r2Client();

  // Grid cells
  let tracks: Array<{ song_id: string; instrument: string; status: string }> = [];
  if (songIds.length) {
    const { data } = await supabase
      .from("song_tracks")
      .select("song_id, instrument, status")
      .in("song_id", songIds);
    tracks = data ?? [];
  }
  const cellMap: Record<string, Record<string, number>> = {};
  for (const t of tracks) {
    if (!cellMap[t.song_id]) cellMap[t.song_id] = {};
    cellMap[t.song_id][t.instrument] = toState(t.status);
  }

  // Audio files (presigned playback URLs)
  const filesBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: files } = await supabase
        .from("song_files")
        .select("id, song_id, name, fmt, r2_key, duration, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      await Promise.all(
        (files ?? []).map(async (f) => {
          const url = await signGet(client, f.r2_key);
          if (!filesBySong[f.song_id]) filesBySong[f.song_id] = [];
          filesBySong[f.song_id].push({
            sid: f.id,
            name: f.name,
            fmt: f.fmt,
            note: "",
            url,
            dur: f.duration ?? null,
          });
        }),
      );
    }
  } catch {
    /* table not present yet */
  }

  // Comments
  const commentsBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: comments } = await supabase
        .from("song_comments")
        .select("song_id, author, color, stamp, body, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      for (const c of comments ?? []) {
        if (!commentsBySong[c.song_id]) commentsBySong[c.song_id] = [];
        commentsBySong[c.song_id].push({
          who: c.author,
          color: c.color || colorFor(c.author || "?"),
          stamp: c.stamp || "",
          text: c.body,
        });
      }
    }
  } catch {
    /* not present yet */
  }

  // Songs shaped for the UI
  const songsByAlbum: Record<string, unknown[]> = {};
  for (const s of songs) {
    const cells = INSTRUMENTS.map((inst) => cellMap[s.id]?.[inst] ?? 0);
    if (!songsByAlbum[s.album_id]) songsByAlbum[s.album_id] = [];
    songsByAlbum[s.album_id].push({
      id: s.id,
      t: s.title,
      cells,
      dur: 210,
      files: filesBySong[s.id] ?? [],
      comments: commentsBySong[s.id] ?? [],
      lyrics: s.lyrics ?? "",
      notes: s.notes ?? "",
      refs: Array.isArray(s.refs) ? s.refs : [],
      credits: Array.isArray(s.credits) ? s.credits : [],
    });
  }

  // Album artwork/merch images
  const assetMap: Record<
    string,
    { artwork: Record<number, string>; merch: Record<number, string> }
  > = {};
  try {
    if (albumIds.length) {
      const { data: assets } = await supabase
        .from("album_assets")
        .select("album_id, kind, slot, r2_key")
        .in("album_id", albumIds);
      await Promise.all(
        (assets ?? []).map(async (a) => {
          const url = await signGet(client, a.r2_key);
          if (!url) return;
          if (!assetMap[a.album_id]) assetMap[a.album_id] = { artwork: {}, merch: {} };
          const target =
            a.kind === "merch" ? assetMap[a.album_id].merch : assetMap[a.album_id].artwork;
          target[a.slot] = url;
        }),
      );
    }
  } catch {
    /* not present yet */
  }

  // Members
  const membersByAlbum: Record<string, unknown[]> = {};
  try {
    if (albumIds.length) {
      const { data: members } = await supabase
        .from("album_members")
        .select("album_id, name, initials, color, status, created_at")
        .in("album_id", albumIds)
        .order("created_at", { ascending: true });
      for (const m of members ?? []) {
        if (!membersByAlbum[m.album_id]) membersByAlbum[m.album_id] = [];
        membersByAlbum[m.album_id].push({
          name: m.name,
          initials: m.initials || "?",
          color: m.color || colorFor(m.name || "?"),
          status: m.status || "pending",
        });
      }
    }
  } catch {
    /* not present yet */
  }

  // Activity
  const activityByAlbum: Record<string, unknown[]> = {};
  try {
    if (albumIds.length) {
      const { data: acts } = await supabase
        .from("activity")
        .select("album_id, actor, body, created_at")
        .in("album_id", albumIds)
        .order("created_at", { ascending: false })
        .limit(60);
      for (const a of acts ?? []) {
        if (!activityByAlbum[a.album_id]) activityByAlbum[a.album_id] = [];
        if ((activityByAlbum[a.album_id] as unknown[]).length >= 12) continue;
        activityByAlbum[a.album_id].push({
          who: a.actor || "Someone",
          color: colorFor(a.actor || "?"),
          text: a.body,
          time: relTime(a.created_at),
        });
      }
    }
  } catch {
    /* not present yet */
  }

  // Band photos, keyed by artist slug
  const photoBySlug: Record<string, string> = {};
  try {
    const { data: photos } = await supabase
      .from("artist_photos")
      .select("slug, r2_key");
    await Promise.all(
      (photos ?? []).map(async (p) => {
        const url = await signGet(client, p.r2_key);
        if (url) photoBySlug[p.slug] = url;
      }),
    );
  } catch {
    /* not present yet */
  }

  // Group albums under their artist/band name to form the roster.
  const artistsMap: Record<
    string,
    Record<string, unknown> & { albums: unknown[] }
  > = {};
  for (const al of albums) {
    const artistName = (al.artist || "").trim() || "Untitled Artist";
    const aid = slug(artistName);
    if (!artistsMap[aid]) {
      artistsMap[aid] = {
        id: aid,
        name: artistName,
        type: "Band",
        photo: photoBySlug[aid] ?? null,
        sub: "",
        albums: [],
      };
    }
    const schedule = Array.isArray(al.schedule) ? al.schedule : [];
    artistsMap[aid].albums.push({
      id: al.id,
      shareId: al.share_id ?? null,
      title: al.title,
      year: String(new Date(al.created_at as string).getFullYear()),
      status: "in-progress",
      cover: null,
      members: membersByAlbum[al.id] ?? [],
      songs: songsByAlbum[al.id] ?? [],
      schedule,
      artwork: ARTWORK_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.artwork?.[i] ?? null,
      })),
      merch: MERCH_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.merch?.[i] ?? null,
      })),
      activity: activityByAlbum[al.id] ?? [],
    });
  }

  const artists = Object.values(artistsMap).map((a) => ({
    ...a,
    sub: `${a.albums.length} album${a.albums.length !== 1 ? "s" : ""}`,
  }));

  return NextResponse.json({ artists });
}
