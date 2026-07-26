import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save (upsert) an album artwork/merch slot's uploaded image key.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const kind = body?.kind as string | undefined;
  const slot = body?.slot as number | undefined;
  const key = body?.key as string | undefined;
  if (!albumId || (kind !== "artwork" && kind !== "merch") || typeof slot !== "number" || !key) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // RLS guards ownership through the album_assets policy.
  const { error } = await supabase
    .from("album_assets")
    .upsert(
      { album_id: albumId, kind, slot, r2_key: key },
      { onConflict: "album_id,kind,slot" },
    );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
