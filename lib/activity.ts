import type { createClient } from "@/lib/supabase/server";

type SB = Awaited<ReturnType<typeof createClient>>;

// Small palette so avatars/dots are stable and colorful per person.
const PALETTE = [
  "#FF4D1C",
  "#2E8B8B",
  "#B4644A",
  "#4EA8E8",
  "#B06BFF",
  "#3ECF8E",
  "#F5A623",
  "#FF6B9D",
];

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function initialsFor(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

// Best-effort activity log. Never throws — if the table isn't there yet or the
// insert fails, the caller's main action still succeeds.
export async function logActivity(
  supabase: SB,
  user: { id: string; email?: string | null },
  albumId: string,
  body: string,
): Promise<void> {
  try {
    let actor = user.email || "Someone";
    const { data } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (data?.display_name) actor = data.display_name;
    await supabase.from("activity").insert({ album_id: albumId, actor, body });
  } catch {
    // swallow — activity is non-critical
  }
}
