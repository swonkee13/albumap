export default function Home() {
  return (
    <main className="wrap">
      <span className="badge">
        <span className="dot" />
        Live · scaffold deployed
      </span>

      <h1>
        album<span className="mark">map</span>
      </h1>

      <p className="tag">
        The album production hub. The place a band organizes making a record —
        see the work, share the work, talk about the work, know who&apos;s
        behind.
      </p>

      <div className="steps">
        <span className="chip on">Next.js + Supabase wired</span>
        <span className="chip">Auth</span>
        <span className="chip">Recording grid</span>
        <span className="chip">Audio ideas</span>
        <span className="chip">Comments</span>
        <span className="chip">Activity feed</span>
      </div>

      <footer>v0.1.0 — building v1 core</footer>
    </main>
  );
}
