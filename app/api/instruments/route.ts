import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Manage an album's recording-grid instrument columns (v2).
// Body: { albumId, instruments: string[], rename?: {from,to}, remove?: string }
//   - always writes the new instruments array onto the album
//   - rename: also moves cell data (song_tracks.instrument from → to)
//   - remove: also clears that column's cell data (deletes its song_tracks rows)
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const instruments = body?.instruments as string[] | undefined;
  const rename = body?.rename as { from?: string; to?: string } | undefined;
  const remove = body?.remove as string | undefined;
  if (!albumId || !Array.isArray(instruments))
    return NextResponse.json({ ok: false }, { status: 400 });

  // Confirm ownership (RLS).
  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  if (!album) return NextResponse.json({ ok: false }, { status: 403 });

  const clean = instruments
    .filter((x) => typeof x === "string" && x.trim())
    .map((x) => x.trim())
    .slice(0, 40);

  // Song ids for this album (needed to touch cell data).
  const { data: songs } = await supabase
    .from("songs")
    .select("id")
    .eq("album_id", albumId);
  const songIds = (songs ?? []).map((s) => s.id);

  if (rename?.from && rename?.to && songIds.length) {
    await supabase
      .from("song_tracks")
      .update({ instrument: rename.to })
      .eq("instrument", rename.from)
      .in("song_id", songIds);
  }
  if (remove && songIds.length) {
    await supabase
      .from("song_tracks")
      .delete()
      .eq("instrument", remove)
      .in("song_id", songIds);
  }

  const { error } = await supabase
    .from("albums")
    .update({ instruments: clean })
    .eq("id", albumId);
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, instruments: clean });
}
