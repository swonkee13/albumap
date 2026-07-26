import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  }> = [];
  if (albumIds.length) {
    const { data } = await supabase
      .from("songs")
      .select("id, title, position, album_id")
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

  const songsByAlbum: Record<string, unknown[]> = {};
  for (const s of songs) {
    const cells = INSTRUMENTS.map((inst) => cellMap[s.id]?.[inst] ?? 0);
    if (!songsByAlbum[s.album_id]) songsByAlbum[s.album_id] = [];
    songsByAlbum[s.album_id].push({
      id: s.id,
      t: s.title,
      cells,
      dur: 210,
      files: [],
      comments: [],
      lyrics: "",
      notes: "",
      refs: [],
      credits: [],
    });
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
      artwork: ARTWORK_LABELS.map((label) => ({ label, img: null })),
      merch: MERCH_LABELS.map((label) => ({ label, img: null })),
      activity: [],
    });
  }

  const artists = Object.values(artistsMap).map((a) => ({
    ...a,
    sub: `${a.albums.length} album${a.albums.length !== 1 ? "s" : ""}`,
  }));

  return NextResponse.json({ artists });
}
