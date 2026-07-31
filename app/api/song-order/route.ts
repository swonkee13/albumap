import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Persist a reordered tracklist: write each song's new position. RLS ensures
// the user can only touch songs on albums they own.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const order = body?.order as string[] | undefined;
  if (!albumId || !Array.isArray(order) || !order.length)
    return NextResponse.json({ ok: false }, { status: 400 });

  // Confirm ownership (RLS) before writing.
  const { data: album } = await supabase
    .from("albums")
    .select("id")
    .eq("id", albumId)
    .maybeSingle();
  if (!album) return NextResponse.json({ ok: false }, { status: 403 });

  // Update positions to match the given order (only songs on this album).
  await Promise.all(
    order.map((songId, i) =>
      supabase
        .from("songs")
        .update({ position: i })
        .eq("id", songId)
        .eq("album_id", albumId),
    ),
  );

  await logActivity(supabase, user, albumId, "reordered the tracklist");
  return NextResponse.json({ ok: true });
}
