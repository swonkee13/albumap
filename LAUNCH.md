# Launch Steps — mockups → live app

> Plain-English, exact, in order. The goal of "launch" here = a real, logged-in web app at a `yourname.vercel.app` URL that you and Jordan can use on an actual record. Domain comes later.
>
> **Reality check:** right now the repo has only HTML mockups — no app. So launching = *build the v1 core, then deploy it.* There's no shortcut from mockups to a working product. The good news: the stack is all free to start, and Claude Code writes the code + runs Git/deploy for you. You do the account clicks; Claude does the building.

_Last updated: 2026-07-25_

---

## The 6 things ONLY you can do (everything else is Claude's job)

These need a human signed into a browser. Claude cannot create accounts, click OAuth "Authorize," or paste secret keys into dashboards for you.

1. Create a **Vercel** account and connect the `albumap` GitHub repo.
2. Create a **Supabase** account + project, and copy its keys.
3. Paste those keys into **Vercel → Settings → Environment Variables**.
4. (Later, when audio upload lands) Create a **Cloudflare R2** bucket + keys.
5. Click "Authorize/Connect" on any sign-in prompts.
6. Decide the stuff only you can decide (name, when to buy the domain).

Everything below that isn't in this list, you hand to Claude: *"scaffold the app," "build the grid," "wire up auth," "commit and push."*

---

## Phase 1 — Accounts & connections (you, ~30 min)

1. **Vercel** — go to vercel.com, "Sign up with GitHub." Import the `albumap` repo. (Nothing to deploy yet — that's fine, it'll deploy the moment Claude pushes the scaffold in Phase 2.)
2. **Supabase** — go to supabase.com, create a new project called `albumap`. Pick a region near you, set a strong DB password (save it in your password manager). When it finishes provisioning, open **Project Settings → API** and copy these three values somewhere safe for the next phase:
   - Project URL
   - `anon` public key
   - `service_role` secret key (this one is sensitive — never commit it, never paste it in chat)

Don't touch Cloudflare R2 yet. It's only needed once audio uploads exist (Phase 4).

---

## Phase 2 — Scaffold + first deploy (Claude does it, you click once)

Say to Claude: **"Scaffold a Next.js app in this repo, add Supabase, commit and push."**

Claude will: create the Next.js project, add the `.gitignore` entries for `node_modules/ .env* .vercel/`, install the Supabase client, make a placeholder home page, commit, and push. Vercel auto-deploys on that push.

Your one action: open Vercel, watch the deploy go green, click the `albumap-xxxx.vercel.app` URL. **If you see the placeholder page live, the whole pipeline works** — this is the milestone that de-risks everything.

---

## Phase 3 — Auth + database (Claude builds, you paste keys)

1. **You:** in Vercel → Settings → Environment Variables, add the three Supabase values from Phase 1 (Claude will tell you the exact variable names to use, e.g. `NEXT_PUBLIC_SUPABASE_URL`). Redeploy.
2. Say to Claude: **"Build email/password login and the database schema for projects, songs, and members, with Row Level Security so a user only sees albums they belong to."**
3. Claude writes the schema + RLS policies and the auth pages. You run the one-liner Claude gives you (or paste the SQL into Supabase's SQL editor — Claude will hand you exactly what to paste).

Milestone: you can sign up, log in, and you're the owner of an empty album.

---

## Phase 4 — Build the v1 core loop (Claude, in small chunks)

This is the actual product. Build in this order — each is a "commit this" chunk, and each one is usable before the next exists:

1. **Recording grid** — songs × instruments, click a cell to cycle grey → amber → orange → green. This is the one that must beat a whiteboard.
2. **Audio ideas** — drop an audio file on a song, it plays in place. (This is where **Cloudflare R2** comes in — do Phase 1's R2 step now: create a bucket, copy keys, paste into Vercel env vars. Claude wires the signed-upload/playback.)
3. **Timestamped comments** — leave a note pinned to a spot in the audio.
4. **Activity feed** — "Scott marked Drums done on *Track 3*," "Jordan left a comment."

That's the core loop from PROJECT_STATE.md: *see the work, share the work, talk about the work, know who's behind.*

---

## Phase 5 — Use it for real (the actual launch)

Put a real record into it with Jordan. Not a test album — a real one. Using it yourselves is the only validation that matters before building anything from the fast-follow / parking lot.

---

## What comes after (not now)

- **Public shareable progress page** — the growth engine (fast-follow, highest strategic value).
- **Reverse-timeline generator** — the moat.
- **Domain** — buy once the name's locked, add in Vercel → Settings → Domains in ~10 min, zero disruption.
- Everything else lives in PROJECT_STATE.md's parking lot. Guard against feature sprawl — that's the named failure mode.

---

## Cost to launch

**$0.** GitHub, Vercel, Supabase, and Cloudflare R2 all have free tiers that comfortably cover you + Jordan on one record. The only money is the domain later (~$10–40/yr for `.io`), and only when you choose to buy it.
