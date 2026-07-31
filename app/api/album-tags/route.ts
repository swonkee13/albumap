import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save an album's editable label tag sets (v2): song sections + instruments
// used by the idea/file label chips. Body: { albumId, sectionTags?, instrumentTags? }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  if (!albumId) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  if (!album) return NextResponse.json({ ok: false }, { status: 403 });

  const clean = (arr: unknown): string[] | undefined =>
    Array.isArray(arr)
      ? arr.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()).slice(0, 40)
      : undefined;

  const patch: Record<string, unknown> = {};
  const s = clean(body?.sectionTags);
  const i = clean(body?.instrumentTags);
  if (s) patch.section_tags = s;
  if (i) patch.instrument_tags = i;
  if (!Object.keys(patch).length)
    return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("albums").update(patch).eq("id", albumId);
  if (error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
