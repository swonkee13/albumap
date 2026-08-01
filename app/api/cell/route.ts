import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Persist one recording-grid cell (song × instrument).
//   state      → the status id (string; legacy numbers accepted)
//   assignees  → array of band-member names responsible for this part
//   assignee   → legacy single name (still accepted; folded into assignees)
// Any field absent from the body is left untouched (Postgres upsert only SETs
// the columns provided). `changedName`/`added` drive a precise activity line;
// `silent` suppresses it (used for bulk column/song assigns).
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

  // Normalize whichever assignee shape was sent into a clean string[].
  let assignees: string[] | null = null;
  if (body != null && Array.isArray(body.assignees)) {
    assignees = Array.from(
      new Set(
        body.assignees
          .map((n: unknown) => String(n ?? "").trim())
          .filter((n: string) => n.length),
      ),
    );
  } else if (body != null && "assignee" in body) {
    const a = body.assignee != null ? String(body.assignee).trim() : "";
    assignees = a ? [a] : [];
  }
  const hasAssignees = assignees !== null;

  if (!songId || !instrument || (!hasState && !hasAssignees)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    song_id: songId,
    instrument,
    updated_at: new Date().toISOString(),
  };
  if (hasState) payload.status = String(state);
  if (hasAssignees) payload.assignees = assignees;

  // RLS ensures the song belongs to an album this user owns.
  const { error } = await supabase
    .from("song_tracks")
    .upsert(payload, { onConflict: "song_id,instrument" });
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Assignment changes are worth a notification (best-effort — never blocks the
  // save). Only when a specific member was toggled and not a bulk/silent write.
  const changedName = body?.changedName ? String(body.changedName).trim() : "";
  if (hasAssignees && changedName && !body?.silent) {
    try {
      const { data: song } = await supabase
        .from("songs")
        .select("title, album_id")
        .eq("id", songId)
        .maybeSingle();
      if (song?.album_id) {
        const line = body?.added
          ? `assigned <b>${instrument}</b> on ${song.title} to <b>${changedName}</b>`
          : `removed <b>${changedName}</b> from <b>${instrument}</b> on ${song.title}`;
        await logActivity(supabase, user, song.album_id, line);
      }
    } catch {
      // activity is non-critical
    }
  }

  return NextResponse.json({ ok: true });
}
