# albumap.io — Project State

> **This is the single source of truth for where the project stands.** Update it at the end of every work session. Any new Claude conversation should be able to read this file and get fully up to speed without re-explaining anything. Keep it plain-language and current.

_Last updated: 2026-07-25_

---

## What this is (one paragraph)

albumap is a SaaS "album production hub" for self-producing / semi-pro bands. It's the place a band organizes making a record: a recording-progress grid (songs × instruments), audio idea/demo uploads that play in place, a drag-to-reorder tracklist sequencer, per-song lyrics/notes/references/credits, a release schedule with a reverse-timeline generator, artwork + merch upload slots, an activity feed, a "waiting on" accountability panel, and an optional in-app video call anchored to the album. It is a pure software product — no commerce attachment, no vendor relationships.

## Who it's for

- **Primary:** self-producing bands that ship albums regularly (semi-pro habits, predictable cadence).
- **Motivating case (not the market):** Scott + Jordan, who have recorded for 27 years and never finished an album due to disorganization. Good north star, not the target customer.

## The core insight / positioning

- The category **does not exist** — nobody searches for "album production hub." This is a **demand-creation** play, not demand-capture. Growth comes from being shown to bands where they gather + a shareable artifact, NOT from SEO/search or paid ads (paid ads don't pencil at a $19 price point).
- The **shareable public progress page** (read-only "62% complete" card) is the single most important growth asset — the thing a band voluntarily posts to Instagram.
- The product's real job beyond features: the **accountability nudge** ("3 things are waiting on Jordan"). That's what makes a band actually finish.

---

## Decisions locked (the "why", so we don't re-litigate)

| Decision | Choice | Why |
|---|---|---|
| Stack | Vercel + Supabase + Cloudflare R2 + GitHub | Same as Clinenest, + R2 for cheap file storage |
| File storage | Cloudflare R2 | Free egress — the thing that makes audio/master storage cheap. ~$0.015/GB storage. |
| Pricing model | Per-**project**, not per-person | A person is free + permanent; you pay for albums you *own*. Owning >1 project → Studio tier. |
| Tiers | Free (1 seat, read-only invites) / Band $19 / Studio $59 / Label $249–499 | Free unlocks on inviting bandmate #2; studio = multi-project; label = roster view |
| Annual billing | Push hard, make monthly the awkward option | Album cycles = monthly churn; annual survives the post-release trough + funds acquisition |
| Free tier gate | Seats, not song count | The whole value is multiplayer; solo users weren't converting anyway |
| Security | Signed expiring URLs + Supabase Row Level Security + download logging | Scraping is a non-threat behind auth; real risks are leaky links, insiders, weak passwords. Make outside access impossible, common accidental leaks impossible, insider leaks traceable. |
| Mobile | Desktop = workbench (real work), phone = dashboard/notifications (view only) | All recording happens at the desk next to the DAW. Build desktop-first, keep the view layer phone-clean. Wrap with Capacitor later (Path 1) — no rebuild needed. |
| Video calls | Song-anchored, lightweight (Whereby-style embed), phase 2 | Don't compete with Evercast/LANDR on real-time DAW audio streaming. Ours is "talk about the song," not "track live." |
| Commerce / vendor attach | NO | Scott's firm preference — pure SaaS, its own vertical. |

## Scope: what's v1 vs later

- **v1 (build first):** recording grid + audio ideas (drop-in player) + timestamped comments + activity feed. That's the core loop: see the work, share the work, talk about the work, know who's behind.
- **Fast-follow (highest strategic value):** public shareable progress page (growth engine) + reverse-timeline generator (moat).
- **Later / when a real band asks:** merch, artwork beyond cover, lyrics, credits/splits, video calls, sequencer polish, watermarking.
- **Guiding risk:** feature sprawl is the main failure mode. "Eight adequate features and nothing exceptional." The grid must be genuinely better than a whiteboard; everything else is table stakes.

## Branding / design

- Name: **albumap.io** (working — not final, domain not yet bought)
- Aesthetic: near-black dark UI (Spotify desktop / DAW-inspired), rounded corners, **bright red-orange accent `#FF4D1C`** (accent-hi `#FF6338`), Poppins for titles, Inter for UI, JetBrains Mono for numbers/timecodes.
- Progress states: grey (not started) → amber `#F5A623` → orange (tracked) → green `#3ECF8E` (done).
- Fake band used in mockups: **Novaway**, album "The West Coast Is Not Our Home."

---

## Current status

**Where we are:** **Real app is live at https://albumap.vercel.app** (deployed from GitHub via Vercel, Supabase connected). Stack provisioned: Vercel + Supabase (own org `Albumap`, project id `ztfscbfdaqodrylvxtum`, region us-east-1). Domain not bought yet. R2 not set up yet.

**ARCHITECTURE DECISION (important):** The logged-in app IS the full mockup, served verbatim. `public/studio.html` is an exact copy of `mockups/00-full-app.html`; the auth-gated `/albums` route renders it full-screen in an iframe. This guarantees zero visual drift from the approved design. All mockup views work (roster, album dashboard, recording grid, songs w/ audio players + lyrics/notes/comments/refs/credits, sequencer w/ drag-reorder + playback, reverse-timeline schedule generator, artwork, merch, share modal, video call bar). Data in the mockup is still its built-in demo data (Novaway etc.), in-memory.

**Plan from here:** wire real functionality into the mockup **view by view** — then audio uploads (Cloudflare R2), comments, activity.

**DONE — real data wired (verified live):** The studio now boots from the user's real Supabase data, not the Novaway demo. API routes: `GET /api/studio-data` (albums→roster shape, 6 fixed parts Drums/Bass/Guitar/Synth/Lead Vox/BGV, cell states 0–4 stored in `song_tracks.status`), `POST /api/cell` (grid persistence — verified saving), `POST /api/album` (New album card), `POST /api/song` (Add song button on grid view). `public/studio.html` edited only at the data layer (demo array → `let artists=[]` + `reloadData()` fetch; `cycleCell` also persists; New album / Add song affordances). Iframe is cache-busted (`?v=Date.now()`) so latest studio.html always loads. Still demo-only (no backend yet): members, schedule, artwork, merch, comments, lyrics, notes, refs, credits, activity, audio files.

**What's real underneath (built, ready to reconnect):**
- **Auth / profiles** — email+password signup & login (Supabase), profile row auto-created via `handle_new_user` trigger. Email confirmation currently OFF (for testing). Login at `/login`; `/albums` is protected by middleware.
- **DB schema** — `profiles`, `albums`, `songs`, `song_tracks` with full RLS (only `authenticated`, rows scoped to owner). In `supabase/schema.sql`. (The interim minimal album/song/grid UI that used these was removed in favor of the mockup; the tables + schema remain and will be reconnected.)
- **Security** — every table has RLS ON, only `authenticated` role granted, rows scoped to the album owner.

**Stack notes for any new session:**
- Next.js 15 (App Router) + TypeScript + Tailwind v4, `@supabase/ssr`. Supabase clients in `lib/supabase/`. Middleware refreshes sessions + protects `/albums`.
- Env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- To change the DB: edit `supabase/schema.sql` and run it in Supabase → SQL Editor (idempotent).
- Left in the DB from a live test: a throwaway user "Grid Tester" (gridtest.claude+ap1@gmail.com) + album "Test Record". Safe to delete anytime.

**Still to build for a complete v1 core:** audio ideas (needs Cloudflare R2) → timestamped comments → activity feed. Then visual polish toward the mockup (left sidebar/roster, album cover art, tabbed album views).

**Mockups built (reference for the real build):**
- `mockups/00-full-app.html` — the unified app: roster → album → dashboard hub, recording grid, merged Songs view (audio + lyrics + notes + comments + references + credits), sequencer, schedule + reverse-timeline generator, artwork, merch, activity feed, waiting-on panel, share modal, video call bar.
- `mockups/01-dashboard.html` — standalone dashboard
- `mockups/02-song-player.html` — standalone drop-in audio player (real waveform decode)
- `mockups/03-sequencer.html` — standalone tracklist sequencer

**Open design notes (tweak later, not blocking):**
- Song expanded view still reads a little dense — consider showing less by default (tabs or collapse the meta boxes).
- Call bar: expanded size is good; make video thumbnails larger and centered in the bar.

## Next actions (in order)

**→ Full step-by-step launch checklist now lives in `LAUNCH.md`.** Decision made: move to the real build. Summary of the path:

1. [x] Create Vercel + Supabase accounts, connect repo, first live deploy
2. [x] Auth + profiles + DB schema + Row Level Security
3. [x] Full mockup live as the studio app behind login (all views, exact)
4. [x] Real data wired: roster/albums/songs/grid read from Supabase; grid + create-album + add-song persist (verified live)
5. [ ] **Next:** Audio ideas — set up Cloudflare R2 (bucket + keys → Vercel env), real upload + playback in the song player (drop zone in the Songs view)
6. [ ] Timestamped comments on audio
7. [ ] Activity feed
8. [ ] Use it on a real record with Jordan (the actual launch)
9. [ ] Buy domain once name is decided (trivial to add later)

## Parking lot (ideas, not commitments)

- Public shareable grid as the viral wedge
- Reverse-timeline generator as encoded-expertise moat
- Credits/splits as retention (nobody deletes the legal record of their catalog)
- Vinyl side-break calculator (already prototyped in sequencer)
- Creator/YouTube sponsorships in home-recording niche as a channel
- Distributor white-label (DistroKid/CD Baby) as a long-shot big-contract motion
