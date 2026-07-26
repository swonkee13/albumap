import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAlbum, signOut } from "./actions";

export default async function AlbumsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, artist")
    .order("created_at", { ascending: false });

  const who = profile?.display_name || user.email;

  return (
    <div className="app">
      <div className="topbar">
        <Link href="/" className="brand">
          album<span className="mark">map</span>
        </Link>
        <div className="who">
          <span>{who}</span>
          <form action={signOut}>
            <button className="btn btn-sm btn-ghost" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>

      <p className="section-title">Your albums</p>

      {albums && albums.length > 0 ? (
        <div className="grid-albums">
          {albums.map((a) => (
            <Link key={a.id} href={`/albums/${a.id}`} className="album-card">
              <h3>{a.title}</h3>
              <div className="artist">{a.artist || "—"}</div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="empty">
          No albums yet. Start your first record below.
        </p>
      )}

      <div className="card" style={{ maxWidth: 560 }}>
        <p className="section-title">Start a new album</p>
        <form action={createAlbum} className="inline-form">
          <label className="field" style={{ flex: "1 1 200px" }}>
            <span>Album title</span>
            <input
              className="input"
              name="title"
              placeholder="The West Coast Is Not Our Home"
              required
            />
          </label>
          <label className="field" style={{ flex: "1 1 160px" }}>
            <span>Artist / band</span>
            <input className="input" name="artist" placeholder="Novaway" />
          </label>
          <button className="btn btn-primary" type="submit">
            Create album
          </button>
        </form>
      </div>
    </div>
  );
}
