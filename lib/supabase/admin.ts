import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Server-only. Used solely by the public
// read-only share page to read an album's progress by its share_id.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
