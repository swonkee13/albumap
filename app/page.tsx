import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="wrap">
      <span className="badge">
        <span className="dot" />
        Live · v1 core
      </span>

      <h1>
        album<span className="mark">map</span>
      </h1>

      <p className="tag">
        The album production hub. The place a band organizes making a record —
        see the work, share the work, talk about the work, know who&apos;s
        behind.
      </p>

      <div className="row">
        {user ? (
          <Link href="/albums" className="btn btn-primary">
            Go to your albums
          </Link>
        ) : (
          <>
            <Link href="/login" className="btn btn-primary">
              Create a profile
            </Link>
            <Link href="/login" className="btn btn-ghost">
              Log in
            </Link>
          </>
        )}
      </div>

      <footer className="mono">v0.1.0 — grid · songs · albums</footer>
    </main>
  );
}
