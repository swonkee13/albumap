import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Save an album's recording-grid status set (v2.7). Body: { albumId, statuses:[{id,name,color,icon,na}] }
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const raw = body?.statuses;
  if (!albumId || !Array.isArray(raw))
    return NextResponse.json({ ok: false }, { status: 400 });

  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  if (!album) return NextResponse.json({ ok: false }, { status: 403 });

  const statuses = raw
    .filter((s) => s && typeof s.id === "string" && s.id)
    .map((s) => ({
      id: String(s.id).slice(0, 60),
      name: String(s.name ?? "").slice(0, 60),
      color: /^#[0-9a-fA-F]{3,8}$/.test(String(s.color)) ? String(s.color) : "#3a3a42",
      icon: String(s.icon ?? "dot").slice(0, 24),
      na: s.na === true,
    }))
    .slice(0, 20);
  if (!statuses.length) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("albums").update({ statuses }).eq("id", albumId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
