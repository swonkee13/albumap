import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Create a real album owned by the signed-in user.
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

  const { data, error } = await supabase
    .from("albums")
    .insert({ title, artist, owner_id: user.id })
    .select("id")
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
