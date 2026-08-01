import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET } from "@/lib/r2";

// Presigned GET that forces a download (Content-Disposition: attachment) with the
// real filename — for handing merch/artwork/photo/logo files to bandmates/vendors.
// Ownership is checked via the album id encoded in the key's second segment
// (merch/<albumId>/…, art|photo|logo/<albumId>/…, assets/<albumId>/…).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const key = (body?.key as string | undefined)?.trim();
  const name = ((body?.name as string | undefined) || "download").trim();
  if (!key) return NextResponse.json({ ok: false }, { status: 400 });

  const albumId = key.split("/")[1];
  if (!albumId) return NextResponse.json({ ok: false }, { status: 400 });
  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  if (!album) return NextResponse.json({ ok: false }, { status: 403 });

  const safe = name.replace(/["\\\r\n]/g, "_").slice(0, 200) || "download";
  try {
    const url = await getSignedUrl(
      r2Client(),
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${safe}"`,
      }),
      { expiresIn: 600 },
    );
    return NextResponse.json({ ok: true, url });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
