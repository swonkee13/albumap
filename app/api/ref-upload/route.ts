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
  const fileId = body?.fileId as string | undefined; // idea-bank file reference
  const name = (body?.name as string | undefined)?.trim();
  if ((!songId && !fileId) || !name)
    return NextResponse.json({ ok: false }, { status: 400 });

  // Ownership check via RLS + build the storage scope.
  let scope: string;
  if (songId) {
    const { data: song } = await supabase
      .from("songs")
      .select("id")
      .eq("id", songId)
      .maybeSingle();
    if (!song) return NextResponse.json({ ok: false }, { status: 403 });
    scope = `refs/${songId}`;
  } else {
    const { data: file } = await supabase
      .from("song_files")
      .select("id")
      .eq("id", fileId)
      .maybeSingle();
    if (!file) return NextResponse.json({ ok: false }, { status: 403 });
    scope = `refs/file/${fileId}`;
  }

  const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  const key = `${scope}/${crypto.randomUUID()}-${safe}`;
  const contentType = contentTypeForName(name);
  const uploadUrl = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: 600 },
  );
  return NextResponse.json({ ok: true, uploadUrl, key, contentType });
}
