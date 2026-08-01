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
  const fileId = (body?.fileId as string | undefined) || null;
  const text = (body?.text as string | undefined)?.trim();
  const stamp = ((body?.stamp as string | undefined) ?? "").trim();
  // A comment targets a song (per-song files) OR just a file (idea-bank files).
  if ((!songId && !fileId) || !text)
    return NextResponse.json({ ok: false }, { status: 400 });

  // Resolve album + a label for the activity line (song title, else file name).
  let albumForComment: string | null = null;
  let label = "an idea";
  if (songId) {
    const { data: song } = await supabase
      .from("songs")
      .select("id, title, album_id")
      .eq("id", songId)
      .maybeSingle();
    if (!song) return NextResponse.json({ ok: false }, { status: 403 });
    albumForComment = song.album_id;
    label = song.title;
  } else if (fileId) {
    const { data: file } = await supabase
      .from("song_files")
      .select("id, name, title, album_id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) return NextResponse.json({ ok: false }, { status: 403 });
    albumForComment = file.album_id;
    label = (file.title || file.name || "an idea") as string;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const author = profile?.display_name || user.email || "Someone";

  const { data: inserted, error } = await supabase
    .from("song_comments")
    .insert({
      song_id: songId ?? null,
      file_id: fileId,
      author,
      color: colorFor(author),
      stamp: stamp || null,
      body: text,
    })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  if (albumForComment) {
    await logActivity(
      supabase,
      user,
      albumForComment,
      `commented on <b>${label}</b>${stamp ? ` at ${stamp}` : ""}`,
    );
  }
  return NextResponse.json({ ok: true, id: inserted.id });
}

// Edit a comment's text. RLS restricts this to comments on the owner's albums.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const text = (body?.text as string | undefined)?.trim();
  if (!id || !text) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase
    .from("song_comments")
    .update({ body: text })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// Delete a comment by id (RLS-scoped to the owner's albums).
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("song_comments").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
