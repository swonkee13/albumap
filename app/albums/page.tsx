import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The full albumap studio — served as your exact mockup (public/studio.html),
// behind login. Real data / audio / R2 get wired into it view by view.
export default async function StudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cache-bust so the latest studio.html always loads while we iterate.
  const v = Date.now();

  return (
    <iframe
      src={`/studio.html?v=${v}`}
      title="albumap studio"
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}
