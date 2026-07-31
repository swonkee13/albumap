import { NextResponse } from "next/server";
import {
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, contentTypeForName } from "@/lib/r2";
import { logActivity } from "@/lib/activity";

// Full merch records (v2). One route, several actions:
//   create      → insert a blank item under an album, return its id
//   update      → patch editable fields on an item
//   upload-url  → presigned PUT for a mockup or print-ready image
//   set-image   → save the uploaded R2 key onto the item
// DELETE ?id=   → remove the item (+ its R2 objects)

const EDITABLE = [
  "name",
  "brand",
  "color",
  "sizes",
  "has_sizes",
  "budget",
  "vendor",
  "vendor_link",
  "size_qty",
  "total_qty",
] as const;

async function ownsAlbum(
  supabase: Awaited<ReturnType<typeof createClient>>,
  albumId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  return !!data;
}

// Resolve the album for a merch item (also proves ownership via RLS).
async function albumForItem(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
): Promise<{ id: string; album_id: string; mockup_key: string | null; print_key: string | null } | null> {
  const { data } = await supabase
    .from("merch_items")
    .select("id, album_id, mockup_key, print_key")
    .eq("id", itemId)
    .maybeSingle();
  return data ?? null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  // --- create -------------------------------------------------------------
  if (action === "create") {
    const albumId = body?.albumId as string | undefined;
    if (!albumId || !(await ownsAlbum(supabase, albumId)))
      return NextResponse.json({ ok: false }, { status: 400 });
    const { count } = await supabase
      .from("merch_items")
      .select("id", { count: "exact", head: true })
      .eq("album_id", albumId);
    const { data, error } = await supabase
      .from("merch_items")
      .insert({ album_id: albumId, position: count ?? 0 })
      .select("id")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logActivity(supabase, user, albumId, "added a merch item");
    return NextResponse.json({ ok: true, id: data.id });
  }

  const id = body?.id as string | undefined;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  // --- update -------------------------------------------------------------
  if (action === "update") {
    const patch: Record<string, unknown> = {};
    for (const k of EDITABLE) {
      if (k in (body ?? {})) patch[k] = body[k];
    }
    if (!Object.keys(patch).length)
      return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await supabase.from("merch_items").update(patch).eq("id", id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // --- upload-url (presigned PUT for a mockup/print image) ----------------
  if (action === "upload-url") {
    const which = body?.which === "print" ? "print" : "mockup";
    const name = (body?.name as string | undefined)?.trim();
    if (!name) return NextResponse.json({ ok: false }, { status: 400 });
    const item = await albumForItem(supabase, id);
    if (!item) return NextResponse.json({ ok: false }, { status: 403 });
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const key = `merch/${item.album_id}/${id}-${which}-${crypto.randomUUID()}-${safe}`;
    const contentType = contentTypeForName(name);
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return NextResponse.json({ ok: true, uploadUrl, key, contentType });
  }

  // --- set-image ----------------------------------------------------------
  if (action === "set-image") {
    const which = body?.which === "print" ? "print_key" : "mockup_key";
    const key = body?.key as string | undefined;
    if (!key) return NextResponse.json({ ok: false }, { status: 400 });
    const { error } = await supabase
      .from("merch_items")
      .update({ [which]: key })
      .eq("id", id);
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

  const item = await albumForItem(supabase, id);
  if (!item) return NextResponse.json({ ok: false }, { status: 404 });

  await supabase.from("merch_items").delete().eq("id", id);
  const client = r2Client();
  for (const key of [item.mockup_key, item.print_key]) {
    if (!key) continue;
    try {
      await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch {
      // orphaned object ages out — not fatal
    }
  }
  return NextResponse.json({ ok: true });
}
