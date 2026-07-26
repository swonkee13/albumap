"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      if (data.session) {
        // Email confirmation is off — we're logged in.
        router.push("/albums");
        router.refresh();
      } else {
        setNotice(
          "Account created. Check your email to confirm, then log in.",
        );
        setMode("login");
        setLoading(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/albums");
      router.refresh();
    }
  }

  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <Link href="/" className="brand" style={{ display: "block", marginBottom: 20 }}>
          album<span className="mark">map</span>
        </Link>

        <h2 style={{ margin: "0 0 20px", fontSize: 20 }}>
          {mode === "login" ? "Log in" : "Create your profile"}
        </h2>

        {error && <div className="msg msg-err">{error}</div>}
        {notice && <div className="msg msg-ok">{notice}</div>}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label className="field">
              <span>Your name</span>
              <input
                className="input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Scott"
                required
              />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@band.com"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={6}
              required
            />
          </label>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 6 }}
          >
            {loading
              ? "…"
              : mode === "login"
                ? "Log in"
                : "Create profile"}
          </button>
        </form>

        <div className="switch">
          {mode === "login" ? (
            <>
              New here?{" "}
              <span className="link" onClick={() => setMode("signup")}>
                Create a profile
              </span>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <span className="link" onClick={() => setMode("login")}>
                Log in
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
