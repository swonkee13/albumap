import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save (upsert) a band photo key for the owner + artist slug.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const slug = (body?.slug as string | undefined)?.trim();
  const key = body?.key as string | undefined;
  if (!slug || !key) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase
    .from("artist_photos")
    .upsert(
      { owner_id: user.id, slug, r2_key: key },
      { onConflict: "owner_id,slug" },
    );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
