import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { colorFor } from "@/lib/activity";

const NAME_TO_STATE: Record<string, number> = {
  not_started: 0,
  scratch: 1,
  tracking: 1,
  tracked: 2,
  comped: 3,
  done: 4,
  na: 5,
  not_applicable: 5,
};

// States 0–5 (5 = N/A). N/A is excluded from percentages by the client/share page.
function toState(v: string | null): number {
  if (v == null) return 0;
  const n = parseInt(v, 10);
  if (!Number.isNaN(n) && String(n) === v) return Math.max(0, Math.min(5, n));
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
    .select("id, title, artist, created_at, share_id, schedule, instruments, section_tags, instrument_tags")
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
    artwork_key: string | null;
  }> = [];
  if (albumIds.length) {
    const { data } = await supabase
      .from("songs")
      .select("id, title, position, album_id, lyrics, notes, refs, credits, artwork_key")
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
        .select("id, song_id, name, fmt, r2_key, duration, is_master, labels, created_at")
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
            master: f.is_master === true,
            labels: Array.isArray(f.labels) ? f.labels : [],
          });
        }),
      );
      // Pin the master file to the top of each song's list.
      for (const sid of Object.keys(filesBySong)) {
        (filesBySong[sid] as Array<{ master?: boolean }>).sort(
          (a, b) => (b.master ? 1 : 0) - (a.master ? 1 : 0),
        );
      }
    }
  } catch {
    /* table not present yet */
  }

  // Idea bank: album-level audio files not linked to any song (song_id null).
  const bankByAlbum: Record<string, unknown[]> = {};
  try {
    if (albumIds.length) {
      const { data: bankFiles } = await supabase
        .from("song_files")
        .select("id, album_id, name, fmt, r2_key, duration, labels, created_at")
        .in("album_id", albumIds)
        .is("song_id", null)
        .order("created_at", { ascending: true });
      await Promise.all(
        (bankFiles ?? []).map(async (f) => {
          const url = await signGet(client, f.r2_key);
          if (!bankByAlbum[f.album_id]) bankByAlbum[f.album_id] = [];
          (bankByAlbum[f.album_id] as unknown[]).push({
            sid: f.id,
            name: f.name,
            fmt: f.fmt,
            note: "",
            url,
            dur: f.duration ?? null,
            labels: Array.isArray(f.labels) ? f.labels : [],
          });
        }),
      );
    }
  } catch {
    /* columns not present yet */
  }

  // Comments
  const commentsBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: comments } = await supabase
        .from("song_comments")
        .select("song_id, file_id, author, color, stamp, body, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      for (const c of comments ?? []) {
        if (!commentsBySong[c.song_id]) commentsBySong[c.song_id] = [];
        commentsBySong[c.song_id].push({
          who: c.author,
          color: c.color || colorFor(c.author || "?"),
          stamp: c.stamp || "",
          text: c.body,
          fileSid: c.file_id || null,
        });
      }
    }
  } catch {
    /* not present yet */
  }

  // Per-song artwork (signed) + collected per album to append to album artwork.
  const songArtByAlbum: Record<string, unknown[]> = {};
  const songArtUrl: Record<string, string | null> = {};
  await Promise.all(
    songs.map(async (s) => {
      if (!s.artwork_key) return;
      const url = await signGet(client, s.artwork_key);
      songArtUrl[s.id] = url;
      if (url) {
        if (!songArtByAlbum[s.album_id]) songArtByAlbum[s.album_id] = [];
        (songArtByAlbum[s.album_id] as unknown[]).push({
          label: s.title,
          img: url,
          song: true,
          songId: s.id,
        });
      }
    }),
  );

  // Reference lists: sign any file-type references (type:'file' with an r2 key).
  const refsBySong: Record<string, unknown[]> = {};
  await Promise.all(
    songs.map(async (s) => {
      const arr = Array.isArray(s.refs) ? (s.refs as Array<Record<string, unknown>>) : [];
      refsBySong[s.id] = await Promise.all(
        arr.map(async (r) => {
          if (r && r.type === "file" && typeof r.key === "string") {
            const url = await signGet(client, r.key);
            return { ...r, url };
          }
          return r;
        }),
      );
    }),
  );

  // Songs shaped for the UI. cells is a map { instrumentName: state } so it
  // works with per-album dynamic instrument columns (v2).
  const songsByAlbum: Record<string, unknown[]> = {};
  for (const s of songs) {
    const cells = cellMap[s.id] ?? {};
    if (!songsByAlbum[s.album_id]) songsByAlbum[s.album_id] = [];
    songsByAlbum[s.album_id].push({
      id: s.id,
      t: s.title,
      art: songArtUrl[s.id] ?? null,
      cells,
      dur: 210,
      files: filesBySong[s.id] ?? [],
      comments: commentsBySong[s.id] ?? [],
      lyrics: s.lyrics ?? "",
      notes: s.notes ?? "",
      refs: refsBySong[s.id] ?? [],
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

  // Merch items (full records — v2), with signed mockup/print URLs
  const merchByAlbum: Record<string, unknown[]> = {};
  try {
    if (albumIds.length) {
      const { data: items } = await supabase
        .from("merch_items")
        .select(
          "id, album_id, name, brand, color, sizes, has_sizes, budget, vendor, vendor_link, mockup_key, print_key, size_qty, total_qty, position, created_at",
        )
        .in("album_id", albumIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      await Promise.all(
        (items ?? []).map(async (m) => {
          const mockup = m.mockup_key ? await signGet(client, m.mockup_key) : null;
          const print = m.print_key ? await signGet(client, m.print_key) : null;
          if (!merchByAlbum[m.album_id]) merchByAlbum[m.album_id] = [];
          (merchByAlbum[m.album_id] as unknown[]).push({
            id: m.id,
            name: m.name ?? "",
            brand: m.brand ?? "",
            color: m.color ?? "",
            sizes: Array.isArray(m.sizes) ? m.sizes : [],
            hasSizes: m.has_sizes !== false,
            budget: m.budget ?? null,
            vendor: m.vendor ?? "",
            vendorLink: m.vendor_link ?? "",
            sizeQty: m.size_qty && typeof m.size_qty === "object" ? m.size_qty : {},
            totalQty: m.total_qty ?? null,
            mockup,
            print,
          });
        }),
      );
    }
  } catch {
    /* table not present yet */
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
        if ((activityByAlbum[a.album_id] as unknown[]).length >= 50) continue;
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
      instruments: Array.isArray(al.instruments) ? al.instruments : [],
      sectionTags: Array.isArray(al.section_tags) ? al.section_tags : [],
      instrumentTags: Array.isArray(al.instrument_tags) ? al.instrument_tags : [],
      title: al.title,
      year: String(new Date(al.created_at as string).getFullYear()),
      status: "in-progress",
      // Album card thumbnail auto-pulls artwork slot 0 ("Front cover").
      cover: assetMap[al.id]?.artwork?.[0] ?? null,
      members: membersByAlbum[al.id] ?? [],
      songs: songsByAlbum[al.id] ?? [],
      schedule,
      artwork: [
        ...ARTWORK_LABELS.map((label, i) => ({
          label,
          img: assetMap[al.id]?.artwork?.[i] ?? null,
        })),
        ...(songArtByAlbum[al.id] ?? []),
      ],
      merch: MERCH_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.merch?.[i] ?? null,
      })),
      merchItems: merchByAlbum[al.id] ?? [],
      bank: bankByAlbum[al.id] ?? [],
      activity: activityByAlbum[al.id] ?? [],
    });
  }

  const artists = Object.values(artistsMap).map((a) => ({
    ...a,
    sub: `${a.albums.length} album${a.albums.length !== 1 ? "s" : ""}`,
  }));

  return NextResponse.json({ artists });
}
