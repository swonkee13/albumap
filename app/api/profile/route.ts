import { NextResponse } from "next/server";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@/lib/supabase/server";
import { r2Client, R2_BUCKET, contentTypeForName } from "@/lib/r2";

// The signed-in user's profile for the settings page.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, photo_key, plan")
    .eq("id", user.id)
    .maybeSingle();

  let photo: string | null = null;
  if (profile?.photo_key) {
    try {
      photo = await getSignedUrl(
        r2Client(),
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: profile.photo_key }),
        { expiresIn: 3600 },
      );
    } catch {
      photo = null;
    }
  }

  return NextResponse.json({
    ok: true,
    displayName: profile?.display_name ?? "",
    email: user.email ?? "",
    role: profile?.role ?? "",
    plan: profile?.plan ?? "free",
    photo,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => null);
  const action = body?.action as string | undefined;

  if (action === "upload-url") {
    const name = (body?.name as string | undefined)?.trim();
    if (!name) return NextResponse.json({ ok: false }, { status: 400 });
    const safe = name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
    const key = `profiles/${user.id}/${crypto.randomUUID()}-${safe}`;
    const contentType = contentTypeForName(name);
    const uploadUrl = await getSignedUrl(
      r2Client(),
      new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: 600 },
    );
    return NextResponse.json({ ok: true, uploadUrl, key, contentType });
  }

  const patch: Record<string, unknown> = {};
  if (action === "set-photo") {
    const key = body?.key as string | undefined;
    if (!key) return NextResponse.json({ ok: false }, { status: 400 });
    patch.photo_key = key;
  } else if (action === "update") {
    if ("displayName" in (body ?? {})) patch.display_name = String(body.displayName ?? "");
    if ("role" in (body ?? {})) patch.role = String(body.role ?? "");
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
