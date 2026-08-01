import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, contentTypeForName } from "@/lib/r2";

// Presigned PUT for a song reference file (any type — audio, image, pdf…).
// The key is saved into songs.refs by the client via /api/song-meta.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  const name = (body?.name as string | undefined)?.trim();
  if (!songId || !name) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: song } = await supabase
    .from("songs")
    .select("id")
    .eq("id", songId)
    .maybeSingle();
  if (!song) return NextResponse.json({ ok: false }, { status: 403 });

  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const key = `refs/${songId}/${crypto.randomUUID()}-${safe}`;
  const contentType = contentTypeForName(name);
  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  return NextResponse.json({ ok: true, uploadUrl, key, contentType });
}
