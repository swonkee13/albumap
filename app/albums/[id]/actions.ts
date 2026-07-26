"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addSong(albumId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const { count } = await supabase
    .from("songs")
    .select("id", { count: "exact", head: true })
    .eq("album_id", albumId);

  const { error } = await supabase.from("songs").insert({
    album_id: albumId,
    title,
    position: count ?? 0,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/albums/${albumId}`);
}
