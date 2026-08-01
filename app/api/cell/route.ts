import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Persist one recording-grid cell (song × instrument).
//   state    → the status id (string; legacy numbers accepted)
//   assignee → band member name responsible for this part (null = unassign)
// Either field may be sent on its own; a field that's absent from the body is
// left untouched (Postgres upsert only SETs the columns provided).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const songId = body?.songId as string | undefined;
  const instrument = body?.instrument as string | undefined;
  const state = body?.state;
  const hasState = typeof state === "string" || typeof state === "number";
  const hasAssignee = body != null && "assignee" in body;
  const assignee =
    hasAssignee && body.assignee != null && String(body.assignee).trim()
      ? String(body.assignee).trim()
      : null;

  if (!songId || !instrument || (!hasState && !hasAssignee)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    song_id: songId,
    instrument,
    updated_at: new Date().toISOString(),
  };
  if (hasState) payload.status = String(state);
  if (hasAssignee) payload.assignee = assignee;

  // RLS ensures the song belongs to an album this user owns.
  const { error } = await supabase
    .from("song_tracks")
    .upsert(payload, { onConflict: "song_id,instrument" });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Assignment changes are worth a notification. Look up the album + song title
  // (best-effort — never block the save on it).
  if (hasAssignee && !body?.silent) {
    try {
      const { data: song } = await supabase
        .from("songs")
        .select("title, album_id")
        .eq("id", songId)
        .maybeSingle();
      if (song?.album_id) {
        const line = assignee
          ? `assigned <b>${instrument}</b> on ${song.title} to <b>${assignee}</b>`
          : `cleared the assignee for <b>${instrument}</b> on ${song.title}`;
        await logActivity(supabase, user, song.album_id, line);
      }
    } catch {
      // activity is non-critical
    }
  }

  return NextResponse.json({ ok: true });
}
