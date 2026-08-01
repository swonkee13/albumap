import { NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, contentTypeForName } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

// Album artwork pieces (v2.4). Actions:
//   upload-url → presigned PUT for an image
//   create     → insert a piece {label,key,inPool}, return id
//   update     → patch label / in_pool / r2_key on a piece
// DELETE ?id   → remove the piece (+ its R2 object)
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  const KINDS: Record<string, string> = { artwork: "art", photo: "photo", logo: "logo" };
  const kind = (body?.kind as string | undefined) && KINDS[body.kind as string] ? (body.kind as string) : "artwork";

  if (action === "upload-url") {
    const albumId = body?.albumId as string | undefined;
    const name = (body?.name as string | undefined)?.trim();
    if (!albumId || !name) return NextResponse.json({ ok: false }, { status: 400 });
    const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).maybeSingle();
    if (!album) return NextResponse.json({ ok: false }, { status: 403 });
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const key = `${KINDS[kind]}/${albumId}/${crypto.randomUUID()}-${safe}`;
    const contentType = contentTypeForName(name);
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return NextResponse.json({ ok: true, uploadUrl, key, contentType });
  }

  if (action === "create") {
    const albumId = body?.albumId as string | undefined;
    if (!albumId) return NextResponse.json({ ok: false }, { status: 400 });
    const { data: album } = await supabase.from("albums").select("id").eq("id", albumId).maybeSingle();
    if (!album) return NextResponse.json({ ok: false }, { status: 403 });
    const { count } = await supabase
      .from("artwork_pieces")
      .select("id", { count: "exact", head: true })
      .eq("album_id", albumId);
    const { data, error } = await supabase
      .from("artwork_pieces")
      .insert({
        album_id: albumId,
        kind,
        label: (body?.label as string | undefined) ?? "",
        r2_key: (body?.key as string | undefined) ?? null,
        in_pool: body?.inPool === true,
        position: count ?? 0,
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logActivity(supabase, user, albumId, "added album artwork");
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (action === "update") {
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ ok: false }, { status: 400 });
    const patch: Record<string, unknown> = {};
    if ("label" in (body ?? {})) patch.label = String(body.label ?? "");
    if ("inPool" in (body ?? {})) patch.in_pool = body.inPool === true;
    if ("finalized" in (body ?? {})) patch.finalized = body.finalized === true;
    if (body?.key) patch.r2_key = body.key;
    if (!Object.keys(patch).length) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await supabase.from("artwork_pieces").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const { data: row } = await supabase
    .from("artwork_pieces")
    .select("id, r2_key")
    .eq("id", id)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false }, { status: 404 });
  await supabase.from("artwork_pieces").delete().eq("id", id);
  if (row.r2_key) {
    try {
      await r2Client().send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: row.r2_key }));
    } catch {
      /* orphaned object ages out */
    }
  }
  return NextResponse.json({ ok: true });
}
