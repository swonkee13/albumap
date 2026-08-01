import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, fmtForName } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

// Record a finished upload's metadata (the file bytes are already in R2).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  const albumId = body?.albumId as string | undefined;
  const bank = body?.bank === true;
  const name = (body?.name as string | undefined)?.trim();
  const key = body?.key as string | undefined;
  const size = (body?.size as number | undefined) ?? null;
  const duration = (body?.duration as number | undefined) ?? null;
  if (!name || !key || (!songId && !(bank && albumId))) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Resolve the album this file belongs to (for both song-linked and bank files).
  let albumForFile = albumId ?? null;
  if (songId && !albumForFile) {
    const { data: song } = await supabase
      .from("songs")
      .select("album_id")
      .eq("id", songId)
      .maybeSingle();
    albumForFile = song?.album_id ?? null;
  }

  const { data, error } = await supabase
    .from("song_files")
    .insert({
      song_id: songId ?? null,
      album_id: albumForFile,
      name,
      fmt: fmtForName(name),
      r2_key: key,
      size,
      duration,
      uploaded_by: user.id,
    })
    .select("id, name, fmt")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  try {
    if (songId) {
      const { data: song } = await supabase
        .from("songs")
        .select("title, album_id")
        .eq("id", songId)
        .maybeSingle();
      if (song)
        await logActivity(supabase, user, song.album_id, `uploaded <b>${name}</b> to ${song.title}`);
    } else if (albumForFile) {
      await logActivity(supabase, user, albumForFile, `added <b>${name}</b> to the idea bank`);
    }
  } catch {
    // non-critical
  }

  return NextResponse.json({ ok: true, id: data.id, fmt: data.fmt });
}

// Set (or clear) the per-song master flag. Setting a master first clears any
// other master on the same song so exactly one file is ever flagged.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = body?.id as string | undefined;
  const master = body?.master;
  const labels = body?.labels as string[] | undefined;
  const assignTo = body?.assignTo as string | undefined; // songId, or "bank"
  const title = body?.title as string | undefined; // human file title
  const name = body?.name as string | undefined; // rename the underlying filename
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: row } = await supabase
    .from("song_files")
    .select("id, song_id, album_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (typeof master === "boolean") {
    if (master && row.song_id) {
      // Un-flag every other file on this song first (RLS-scoped to owner).
      await supabase.from("song_files").update({ is_master: false }).eq("song_id", row.song_id);
    }
    patch.is_master = master;
  }

  if (Array.isArray(labels)) {
    patch.labels = labels.filter((l) => typeof l === "string").slice(0, 24);
  }

  if (typeof title === "string") {
    const t = title.trim().slice(0, 200);
    patch.title = t || null;
  }

  if (typeof name === "string") {
    const n = name.trim().slice(0, 200);
    if (n) patch.name = n;
  }

  // Idea-bank files carry their own notes + references.
  if ("notes" in (body ?? {})) {
    const n = body.notes == null ? null : String(body.notes).slice(0, 5000);
    patch.notes = n || null;
  }
  if (Array.isArray(body?.refs)) {
    patch.refs = body.refs.slice(0, 40);
  }

  if (typeof assignTo === "string") {
    if (assignTo === "bank") {
      // Send back to the album's idea bank: detach from song, keep album link.
      patch.song_id = null;
      patch.is_master = false;
      if (row.album_id) patch.album_id = row.album_id;
    } else {
      // Assign to a song (must be owned; resolve its album).
      const { data: song } = await supabase
        .from("songs")
        .select("album_id")
        .eq("id", assignTo)
        .maybeSingle();
      if (!song) return NextResponse.json({ ok: false, error: "song not found" }, { status: 400 });
      patch.song_id = assignTo;
      patch.album_id = song.album_id;
    }
  }

  if (!Object.keys(patch).length)
    return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("song_files").update(patch).eq("id", id);
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

// Delete a file: remove the DB row (RLS-guarded) and the R2 object.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: row } = await supabase
    .from("song_files")
    .select("id, r2_key")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });

  await supabase.from("song_files").delete().eq("id", id);
  try {
    await r2Client().send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }),
    );
  } catch {
    // row is gone; orphaned object will age out — not fatal
  }
  return NextResponse.json({ ok: true });
}
