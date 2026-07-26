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

**Where we are:** Interactive HTML mockups built and validated (see `/mockups`). No real app code yet. No stack provisioned. No domain bought.

**Mockups built (reference for the real build):**
- `mockups/00-full-app.html` — the unified app: roster → album → dashboard hub, recording grid, merged Songs view (audio + lyrics + notes + comments + references + credits), sequencer, schedule + reverse-timeline generator, artwork, merch, activity feed, waiting-on panel, share modal, video call bar.
- `mockups/01-dashboard.html` — standalone dashboard
- `mockups/02-song-player.html` — standalone drop-in audio player (real waveform decode)
- `mockups/03-sequencer.html` — standalone tracklist sequencer

**Open design notes (tweak later, not blocking):**
- Song expanded view still reads a little dense — consider showing less by default (tabs or collapse the meta boxes).
- Call bar: expanded size is good; make video thumbnails larger and centered in the bar.

## Next actions (in order)

1. [ ] Decide: start real build now, or keep refining mockups?
2. [ ] Set up repo + Vercel + Supabase (+ R2 when files needed) — see `GIT_AND_SETUP.md`
3. [ ] Build v1 core: grid → audio ideas → comments → activity feed
4. [ ] Deploy to free `.vercel.app` URL, use it on a real record with Jordan
5. [ ] Buy domain once name is decided (trivial to add later)

## Parking lot (ideas, not commitments)

- Public shareable grid as the viral wedge
- Reverse-timeline generator as encoded-expertise moat
- Credits/splits as retention (nobody deletes the legal record of their catalog)
- Vinyl side-break calculator (already prototyped in sequencer)
- Creator/YouTube sponsorships in home-recording niche as a channel
- Distributor white-label (DistroKid/CD Baby) as a long-shot big-contract motion
