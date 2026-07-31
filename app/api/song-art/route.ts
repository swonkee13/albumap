import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, contentTypeForName } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

// Single per-song artwork (v2). action:
//   upload-url → presigned PUT for the image
//   set        → save the R2 key onto songs.artwork_key
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;
  const songId = body?.songId as string | undefined;
  if (!songId) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: song } = await supabase
    .from("songs")
    .select("id, title, album_id")
    .eq("id", songId)
    .maybeSingle();
  if (!song) return NextResponse.json({ ok: false }, { status: 403 });

  if (action === "upload-url") {
    const name = (body?.name as string | undefined)?.trim();
    if (!name) return NextResponse.json({ ok: false }, { status: 400 });
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const key = `songart/${songId}/${crypto.randomUUID()}-${safe}`;
    const contentType = contentTypeForName(name);
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return NextResponse.json({ ok: true, uploadUrl, key, contentType });
  }

  if (action === "set") {
    const key = body?.key as string | undefined;
    if (!key) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await supabase
      .from("songs")
      .update({ artwork_key: key })
      .eq("id", songId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logActivity(supabase, user, song.album_id, `added artwork for <b>${song.title}</b>`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}
