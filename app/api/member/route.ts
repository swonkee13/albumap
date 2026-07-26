import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity, colorFor, initialsFor } from "@/lib/activity";

// Invite / add a member to an album (owner-managed roster).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const name = (body?.name as string | undefined)?.trim();
  if (!albumId || !name) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("album_members").insert({
    album_id: albumId,
    name,
    initials: initialsFor(name),
    color: colorFor(name),
    status: "pending",
  });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logActivity(supabase, user, albumId, `invited <b>${name}</b>`);
  return NextResponse.json({ ok: true });
}
