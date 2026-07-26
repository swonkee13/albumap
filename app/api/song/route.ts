import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Add a real song to one of the user's albums.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const title = (body?.title as string | undefined)?.trim();
  if (!albumId || !title) return NextResponse.json({ ok: false }, { status: 400 });

  const { count } = await supabase
    .from("songs")
    .select("id", { count: "exact", head: true })
    .eq("album_id", albumId);

  const { data, error } = await supabase
    .from("songs")
    .insert({ album_id: albumId, title, position: count ?? 0 })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logActivity(supabase, user, albumId, `added the song <b>${title}</b>`);
  return NextResponse.json({ ok: true, id: data.id });
}
