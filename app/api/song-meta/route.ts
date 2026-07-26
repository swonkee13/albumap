import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Persist a song's lyrics and/or notes.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  if (!songId) return NextResponse.json({ ok: false }, { status: 400 });

  const patch: Record<string, string> = {};
  if (typeof body.lyrics === "string") patch.lyrics = body.lyrics;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  // RLS ensures the update only touches a song in an album this user owns.
  const { error } = await supabase.from("songs").update(patch).eq("id", songId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
