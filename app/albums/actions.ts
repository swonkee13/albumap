"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createAlbum(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const title = String(formData.get("title") ?? "").trim();
  const artist = String(formData.get("artist") ?? "").trim();
  if (!title) return;

  const { data, error } = await supabase
    .from("albums")
    .insert({ title, artist, owner_id: user.id })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/albums");
  redirect(`/albums/${data.id}`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
