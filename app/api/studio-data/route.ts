import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET } from "@/lib/r2";

// The 6 parts the mockup's recording grid renders, in order.
const INSTRUMENTS = ["Drums", "Bass", "Guitar", "Synth", "Lead Vox", "BGV"];

// Map any legacy text statuses to the mockup's 0–4 cell states.
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

// Returns the signed-in user's real albums/songs/grid, shaped exactly like the
// mockup's in-memory `artists` array so the existing UI renders it unchanged.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ artists: [] }, { status: 401 });

  const { data: albumsData } = await supabase
    .from("albums")
    .select("id, title, artist, created_at")
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
  }> = [];
  if (albumIds.length) {
    const { data } = await supabase
      .from("songs")
      .select("id, title, position, album_id, lyrics, notes")
      .in("album_id", albumIds)
      .order("position", { ascending: true });
    songs = data ?? [];
  }

  const songIds = songs.map((s) => s.id);
  let tracks: Array<{ song_id: string; instrument: string; status: string }> =
    [];
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

  // Audio files per song, each with a short-lived presigned playback URL.
  // Resilient: if the table or R2 env isn't set up yet, files stay empty.
  const filesBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: files } = await supabase
        .from("song_files")
        .select("id, song_id, name, fmt, r2_key, duration, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      if (files && files.length) {
        const client = r2Client();
        await Promise.all(
          files.map(async (f) => {
            let url: string | null = null;
            try {
              url = await getSignedUrl(
                client,
                new GetObjectCommand({ Bucket: R2_BUCKET, Key: f.r2_key }),
                { expiresIn: 3600 },
              );
            } catch {
              url = null;
            }
            if (!filesBySong[f.song_id]) filesBySong[f.song_id] = [];
            filesBySong[f.song_id].push({
              sid: f.id, // server id (UUID); the mockup assigns its own numeric id
              name: f.name,
              fmt: f.fmt,
              note: "",
              url,
              dur: f.duration ?? null,
            });
          }),
        );
      }
    }
  } catch {
    // song_files table not present yet — leave files empty.
  }

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
      comments: [],
      lyrics: s.lyrics ?? "",
      notes: s.notes ?? "",
      refs: [],
      credits: [],
    });
  }

  // Album artwork/merch images (presigned GET), resilient if not set up yet.
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
      if (assets && assets.length) {
        const client = r2Client();
        await Promise.all(
          assets.map(async (a) => {
            let url: string | null = null;
            try {
              url = await getSignedUrl(
                client,
                new GetObjectCommand({ Bucket: R2_BUCKET, Key: a.r2_key }),
                { expiresIn: 3600 },
              );
            } catch {
              url = null;
            }
            if (!url) return;
            if (!assetMap[a.album_id]) {
              assetMap[a.album_id] = { artwork: {}, merch: {} };
            }
            const target =
              a.kind === "merch"
                ? assetMap[a.album_id].merch
                : assetMap[a.album_id].artwork;
            target[a.slot] = url;
          }),
        );
      }
    }
  } catch {
    // album_assets table not present yet — leave images null.
  }

  // Group albums under their artist/band name to form the roster.
  const artistsMap: Record<string, Record<string, unknown> & { albums: unknown[] }> =
    {};
  for (const al of albums) {
    const artistName = (al.artist || "").trim() || "Untitled Artist";
    const aid = slug(artistName);
    if (!artistsMap[aid]) {
      artistsMap[aid] = {
        id: aid,
        name: artistName,
        type: "Band",
        photo: null,
        sub: "",
        albums: [],
      };
    }
    artistsMap[aid].albums.push({
      id: al.id,
      title: al.title,
      year: String(new Date(al.created_at as string).getFullYear()),
      status: "in-progress",
      cover: null,
      members: [],
      songs: songsByAlbum[al.id] ?? [],
      schedule: [],
      artwork: ARTWORK_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.artwork?.[i] ?? null,
      })),
      merch: MERCH_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.merch?.[i] ?? null,
      })),
      activity: [],
    });
  }

  const artists = Object.values(artistsMap).map((a) => ({
    ...a,
    sub: `${a.albums.length} album${a.albums.length !== 1 ? "s" : ""}`,
  }));

  return NextResponse.json({ artists });
}
