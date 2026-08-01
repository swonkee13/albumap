import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logActivity, initialsFor } from "@/lib/activity";

// Create a real album owned by the signed-in user, seeding the owner as the
// first "in the studio" member and logging the activity.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const title = (body?.title as string | undefined)?.trim();
  const artist = ((body?.artist as string | undefined) ?? "").trim();
  if (!title) return NextResponse.json({ ok: false }, { status: 400 });

  // New albums start with a blank recording grid (no instrument columns) —
  // the user adds their own via "+ Add instrument" (v2).
  const { data, error } = await supabase
    .from("albums")
    .insert({ title, artist, owner_id: user.id, instruments: [] })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // Seed the owner as an "in" member (best-effort).
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const name = profile?.display_name || user.email || "You";
    await supabase.from("album_members").insert({
      album_id: data.id,
      name,
      initials: initialsFor(name),
      color: "#FF4D1C",
      status: "in",
    });
  } catch {
    // members table may not exist yet
  }

  await logActivity(supabase, user, data.id, `started the album “${title}”`);
  return NextResponse.json({ ok: true, id: data.id });
}

// Rename an album (id + title), or rename a band across all its albums
// ({ renameArtistFrom, renameArtistTo }). RLS keeps this to the user's albums.
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const from = (body?.renameArtistFrom as string | undefined)?.trim();
  const to = (body?.renameArtistTo as string | undefined)?.trim();
  if (typeof from === "string" && to) {
    const { error } = await supabase
      .from("albums")
      .update({ artist: to })
      .eq("owner_id", user.id)
      .eq("artist", from);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  // Archive/restore every album of an artist at once.
  const archiveArtist = body?.archiveArtist as string | undefined;
  if (typeof archiveArtist === "string" && archiveArtist.trim()) {
    const { error } = await supabase
      .from("albums")
      .update({ archived: body?.archived === true })
      .eq("owner_id", user.id)
      .eq("artist", archiveArtist.trim());
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const id = body?.id as string | undefined;
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const patch: Record<string, unknown> = {};
  const title = (body?.title as string | undefined)?.trim();
  const artist = body?.artist as string | undefined;
  if (title) patch.title = title;
  if (artist !== undefined) patch.artist = artist.trim();
  if (typeof body?.archived === "boolean") patch.archived = body.archived;
  if (Array.isArray(body?.heroKeys)) {
    patch.hero_keys = (body.heroKeys as unknown[])
      .filter((k) => typeof k === "string")
      .slice(0, 12);
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await supabase.from("albums").update(patch).eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  if (title) await logActivity(supabase, user, id, `renamed the album to “${title}”`);
  return NextResponse.json({ ok: true });
}

// Permanently delete an album (from the archive, behind a strong client warning).
// Cascades to songs/tracks/files/etc. via FK on delete cascade.
export async function DELETE(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });
  const { error } = await supabase
    .from("albums")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
