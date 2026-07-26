import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../actions";
import { addSong } from "./actions";
import Grid, { type Song } from "./Grid";

type Status = "not_started" | "tracking" | "tracked" | "done";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: album } = await supabase
    .from("albums")
    .select("id, title, artist, instruments")
    .eq("id", id)
    .maybeSingle();

  if (!album) notFound();

  const { data: songsData } = await supabase
    .from("songs")
    .select("id, title")
    .eq("album_id", id)
    .order("position", { ascending: true });

  const songs: Song[] = songsData ?? [];

  // Load existing grid cell statuses for these songs.
  const initial: Record<string, Status> = {};
  if (songs.length > 0) {
    const { data: tracks } = await supabase
      .from("song_tracks")
      .select("song_id, instrument, status")
      .in(
        "song_id",
        songs.map((s) => s.id),
      );
    for (const t of tracks ?? []) {
      initial[`${t.song_id}::${t.instrument}`] = t.status as Status;
    }
  }

  const instruments: string[] = album.instruments ?? [
    "Drums",
    "Bass",
    "Guitar",
    "Vocals",
    "Keys",
  ];

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="brand">
          album<span className="mark">map</span>
        </Link>
        <div className="who">
          <form action={signOut}>
            <button className="btn btn-sm btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <div className="album-head">
        <Link href="/albums" className="back">
          ← All albums
        </Link>
        <h2>{album.title}</h2>
        <div className="artist">{album.artist || "—"}</div>
      </div>

      <div className="card" style={{ marginBottom: 26, maxWidth: 520 }}>
        <p className="section-title">Add a song</p>
        <form action={addSong.bind(null, album.id)} className="inline-form">
          <label className="field" style={{ flex: "1 1 240px" }}>
            <span>Song title</span>
            <input
              className="input"
              name="title"
              placeholder="Coastline"
              required
            />
          </label>
          <button className="btn btn-primary" type="submit">
            Add song
          </button>
        </form>
      </div>

      <p className="section-title">Recording grid</p>
      <Grid songs={songs} instruments={instruments} initial={initial} />
    </div>
  );
}
