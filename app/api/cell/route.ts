import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Persist one recording-grid cell (song × instrument → 0–4 state).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  const instrument = body?.instrument as string | undefined;
  // v2.7: state is the status id (string). Numbers still accepted (legacy).
  const state = body?.state;
  if (!songId || !instrument || (typeof state !== "string" && typeof state !== "number")) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // RLS ensures the song belongs to an album this user owns.
  const { error } = await supabase.from("song_tracks").upsert(
    {
      song_id: songId,
      instrument,
      status: String(state),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "song_id,instrument" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
