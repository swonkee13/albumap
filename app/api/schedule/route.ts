import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Persist an album's generated release schedule + release date.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const albumId = body?.albumId as string | undefined;
  const schedule = body?.schedule;
  const releaseDate =
    typeof body?.releaseDate === "string" && body.releaseDate ? body.releaseDate : null;
  if (!albumId || !Array.isArray(schedule)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Only touch release_date when one is provided (don't wipe it on manual edits).
  const update: Record<string, unknown> = { schedule };
  if (releaseDate) update.release_date = releaseDate;
  const { error } = await supabase.from("albums").update(update).eq("id", albumId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logActivity(
    supabase,
    user,
    albumId,
    releaseDate
      ? `set the release date to <b>${releaseDate}</b>`
      : "updated the release schedule",
  );
  return NextResponse.json({ ok: true });
}
