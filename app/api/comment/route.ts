import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity, colorFor } from "@/lib/activity";

// Post a (optionally timestamped) comment on a song.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  const text = (body?.text as string | undefined)?.trim();
  const stamp = ((body?.stamp as string | undefined) ?? "").trim();
  if (!songId || !text) return NextResponse.json({ ok: false }, { status: 400 });

  // Resolve album + song title for ownership check (RLS) and the activity line.
  const { data: song } = await supabase
    .from("songs")
    .select("id, title, album_id")
    .eq("id", songId)
    .maybeSingle();
  if (!song) return NextResponse.json({ ok: false }, { status: 403 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const author = profile?.display_name || user.email || "Someone";

  const { error } = await supabase.from("song_comments").insert({
    song_id: songId,
    author,
    color: colorFor(author),
    stamp: stamp || null,
    body: text,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logActivity(
    supabase,
    user,
    song.album_id,
    `commented on <b>${song.title}</b>${stamp ? ` at ${stamp}` : ""}`,
  );
  return NextResponse.json({ ok: true });
}
