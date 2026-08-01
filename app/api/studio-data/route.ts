import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET } from "@/lib/r2";
import { colorFor, initialsFor } from "@/lib/activity";

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
// v2.7: normalize a stored cell value to its status id (legacy 0–5 → default ids).
const STATUS_ID_MAP: Record<string, string> = {
  "0": "not_started", "1": "scratch", "2": "tracked", "3": "comped", "4": "done", "5": "na",
  tracking: "tracked",
};
function normStatus(v: string | null): string | null {
  if (v == null) return null;
  return STATUS_ID_MAP[v] ?? v;
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

  const { data: albumsAll } = await supabase
    .from("albums")
    .select("id, title, artist, created_at, share_id, schedule, instruments, section_tags, instrument_tags, statuses, archived, hero_keys")
    .order("created_at", { ascending: true });
  // Archived albums are kept out of the working view; surfaced separately for
  // the Settings → Archived manager.
  const archivedList = (albumsAll ?? [])
    .filter((a) => a.archived === true)
    .map((a) => ({ id: a.id, title: a.title, artist: (a.artist || "").trim() || "Untitled Artist" }));
  const albums = (albumsAll ?? []).filter((a) => a.archived !== true);
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
  let tracks: Array<{
    song_id: string;
    instrument: string;
    status: string;
    assignee: string | null;
    assignees: string[] | null;
  }> = [];
  if (songIds.length) {
    const { data } = await supabase
      .from("song_tracks")
      .select("song_id, instrument, status, assignee, assignees")
      .in("song_id", songIds);
    tracks = data ?? [];
  }
  const cellMap: Record<string, Record<string, string>> = {};
  // Parallel map of who owns each cell: { song_id: { instrument: [names] } }.
  const assignMap: Record<string, Record<string, string[]>> = {};
  for (const t of tracks) {
    if (!cellMap[t.song_id]) cellMap[t.song_id] = {};
    const id = normStatus(t.status);
    if (id != null) cellMap[t.song_id][t.instrument] = id;
    const names =
      Array.isArray(t.assignees) && t.assignees.length
        ? t.assignees.filter(Boolean)
        : t.assignee
          ? [t.assignee]
          : [];
    if (names.length) {
      if (!assignMap[t.song_id]) assignMap[t.song_id] = {};
      assignMap[t.song_id][t.instrument] = names;
    }
  }

  // Audio files (presigned playback URLs)
  const filesBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: files } = await supabase
        .from("song_files")
        .select("id, song_id, name, title, fmt, r2_key, duration, is_master, labels, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      await Promise.all(
        (files ?? []).map(async (f) => {
          const url = await signGet(client, f.r2_key);
          if (!filesBySong[f.song_id]) filesBySong[f.song_id] = [];
          filesBySong[f.song_id].push({
            sid: f.id,
            name: f.name,
            title: f.title ?? "",
            fmt: f.fmt,
            note: "",
            url,
            dur: f.duration ?? null,
            at: f.created_at,
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
  const bankFileIds: string[] = [];
  try {
    if (albumIds.length) {
      const { data: bankFiles } = await supabase
        .from("song_files")
        .select("id, album_id, name, title, fmt, r2_key, duration, labels, created_at, notes, refs")
        .in("album_id", albumIds)
        .is("song_id", null)
        .order("created_at", { ascending: true });
      await Promise.all(
        (bankFiles ?? []).map(async (f) => {
          const url = await signGet(client, f.r2_key);
          bankFileIds.push(f.id);
          const refsArr = Array.isArray(f.refs)
            ? await Promise.all(
                (f.refs as Array<Record<string, unknown>>).map(async (r) =>
                  r && r.type === "file" && typeof r.key === "string"
                    ? { ...r, url: await signGet(client, r.key) }
                    : r,
                ),
              )
            : [];
          if (!bankByAlbum[f.album_id]) bankByAlbum[f.album_id] = [];
          (bankByAlbum[f.album_id] as unknown[]).push({
            sid: f.id,
            name: f.name,
            title: f.title ?? "",
            fmt: f.fmt,
            note: "",
            url,
            dur: f.duration ?? null,
            at: f.created_at,
            labels: Array.isArray(f.labels) ? f.labels : [],
            notes: f.notes ?? "",
            refs: refsArr,
          });
        }),
      );
    }
  } catch {
    /* columns not present yet */
  }

  // Idea-bank comments: attach to a file, not a song (song_id null).
  const bankCommentsByAlbum: Record<string, unknown[]> = {};
  try {
    if (bankFileIds.length) {
      const fileAlbum: Record<string, string> = {};
      for (const alId of Object.keys(bankByAlbum))
        for (const f of bankByAlbum[alId] as Array<{ sid: string }>)
          fileAlbum[f.sid] = alId;
      const { data: bcomments } = await supabase
        .from("song_comments")
        .select("id, file_id, author, color, stamp, body, created_at")
        .is("song_id", null)
        .in("file_id", bankFileIds)
        .order("created_at", { ascending: true });
      for (const c of bcomments ?? []) {
        const alId = fileAlbum[c.file_id as string];
        if (!alId) continue;
        if (!bankCommentsByAlbum[alId]) bankCommentsByAlbum[alId] = [];
        bankCommentsByAlbum[alId].push({
          id: c.id,
          who: c.author,
          color: c.color || colorFor(c.author || "?"),
          stamp: c.stamp || "",
          text: c.body,
          fileSid: c.file_id || null,
          at: c.created_at,
        });
      }
    }
  } catch {
    /* fine if no bank comments */
  }

  // Comments
  const commentsBySong: Record<string, unknown[]> = {};
  try {
    if (songIds.length) {
      const { data: comments } = await supabase
        .from("song_comments")
        .select("id, song_id, file_id, author, color, stamp, body, created_at")
        .in("song_id", songIds)
        .order("created_at", { ascending: true });
      for (const c of comments ?? []) {
        if (!commentsBySong[c.song_id]) commentsBySong[c.song_id] = [];
        commentsBySong[c.song_id].push({
          id: c.id,
          who: c.author,
          color: c.color || colorFor(c.author || "?"),
          stamp: c.stamp || "",
          text: c.body,
          fileSid: c.file_id || null,
          at: c.created_at,
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
    const assign = assignMap[s.id] ?? {};
    if (!songsByAlbum[s.album_id]) songsByAlbum[s.album_id] = [];
    songsByAlbum[s.album_id].push({
      id: s.id,
      t: s.title,
      art: songArtUrl[s.id] ?? null,
      cells,
      assign,
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
          "id, album_id, name, brand, color, sizes, has_sizes, budget, vendor, vendor_link, mockup_key, print_key, mockup_name, print_name, size_qty, total_qty, finalized, position, created_at",
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
            finalized: m.finalized === true,
            mockup,
            print,
            mockupKey: m.mockup_key ?? null,
            printKey: m.print_key ?? null,
            mockupName: m.mockup_name ?? null,
            printName: m.print_name ?? null,
          });
        }),
      );
    }
  } catch {
    /* table not present yet */
  }

  // Artwork/photo/logo pieces (v2.4/v2.5): working set + alternates pool, by kind.
  const mk = (): Record<string, unknown[]> => ({});
  const buckets: Record<string, Record<string, unknown[]>> = {
    artworkMain: mk(), artworkPool: mk(),
    photoMain: mk(), photoPool: mk(),
    logoMain: mk(),
  };
  try {
    if (albumIds.length) {
      const { data: pieces } = await supabase
        .from("artwork_pieces")
        .select("id, album_id, kind, label, r2_key, filename, in_pool, finalized, position, created_at")
        .in("album_id", albumIds)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      await Promise.all(
        (pieces ?? []).map(async (p) => {
          const url = p.r2_key ? await signGet(client, p.r2_key) : null;
          const item = { id: p.id, label: p.label ?? "", img: url, pool: p.in_pool === true, finalized: p.finalized === true, key: p.r2_key ?? null, filename: p.filename ?? null };
          const kind = p.kind === "photo" ? "photo" : p.kind === "logo" ? "logo" : "artwork";
          const key = kind === "logo" ? "logoMain" : `${kind}${p.in_pool ? "Pool" : "Main"}`;
          const bucket = buckets[key];
          if (!bucket[p.album_id]) bucket[p.album_id] = [];
          (bucket[p.album_id] as unknown[]).push(item);
        }),
      );
    }
  } catch {
    /* table not present yet */
  }
  const artMainByAlbum = buckets.artworkMain;
  const artPoolByAlbum = buckets.artworkPool;

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
          at: a.created_at,
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
      statuses: Array.isArray(al.statuses) ? al.statuses : [],
      sectionTags: Array.isArray(al.section_tags) ? al.section_tags : [],
      instrumentTags: Array.isArray(al.instrument_tags) ? al.instrument_tags : [],
      title: al.title,
      year: String(new Date(al.created_at as string).getFullYear()),
      status: "in-progress",
      heroKeys: Array.isArray(al.hero_keys) ? al.hero_keys : ["recording"],
      // Album card thumbnail auto-pulls artwork slot 0 ("Front cover").
      cover: assetMap[al.id]?.artwork?.[0] ?? null,
      members: membersByAlbum[al.id] ?? [],
      songs: songsByAlbum[al.id] ?? [],
      schedule,
      artwork: [...(artMainByAlbum[al.id] ?? []), ...(songArtByAlbum[al.id] ?? [])],
      artworkPool: artPoolByAlbum[al.id] ?? [],
      photos: buckets.photoMain[al.id] ?? [],
      photosPool: buckets.photoPool[al.id] ?? [],
      logos: buckets.logoMain[al.id] ?? [],
      merch: MERCH_LABELS.map((label, i) => ({
        label,
        img: assetMap[al.id]?.merch?.[i] ?? null,
      })),
      merchItems: merchByAlbum[al.id] ?? [],
      bank: bankByAlbum[al.id] ?? [],
      bankComments: bankCommentsByAlbum[al.id] ?? [],
      activity: activityByAlbum[al.id] ?? [],
    });
  }

  const artists = Object.values(artistsMap).map((a) => ({
    ...a,
    sub: `${a.albums.length} album${a.albums.length !== 1 ? "s" : ""}`,
  }));

  // The signed-in user's own avatar, so every "you" avatar across the app
  // (member stack, activity, comments, call bar) is consistent + shows the photo.
  let mePhoto: string | null = null;
  const { data: meProfile } = await supabase
    .from("profiles")
    .select("display_name, photo_key")
    .eq("id", user.id)
    .maybeSingle();
  const meName = meProfile?.display_name || user.email || "You";
  if (meProfile?.photo_key) mePhoto = await signGet(client, meProfile.photo_key);
  const me = {
    name: meName,
    initials: initialsFor(meName),
    color: "#FF4D1C",
    photo: mePhoto,
  };

  return NextResponse.json({ artists, me, archived: archivedList });
}
