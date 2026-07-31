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
  const name = (body?.name as string | undefined)?.trim();
  const key = body?.key as string | undefined;
  const size = (body?.size as number | undefined) ?? null;
  const duration = (body?.duration as number | undefined) ?? null;
  if (!songId || !name || !key) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("song_files")
    .insert({
      song_id: songId,
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
    const { data: song } = await supabase
      .from("songs")
      .select("title, album_id")
      .eq("id", songId)
      .maybeSingle();
    if (song) {
      await logActivity(
        supabase,
        user,
        song.album_id,
        `uploaded <b>${name}</b> to ${song.title}`,
      );
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
  if (!id || typeof master !== "boolean")
    return NextResponse.json({ ok: false }, { status: 400 });

  const { data: row } = await supabase
    .from("song_files")
    .select("id, song_id")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });

  if (master && row.song_id) {
    // Un-flag every other file on this song first (RLS-scoped to owner).
    await supabase
      .from("song_files")
      .update({ is_master: false })
      .eq("song_id", row.song_id);
  }
  const { error } = await supabase
    .from("song_files")
    .update({ is_master: master })
    .eq("id", id);
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
