# albumap.io — Project State

> **This is the single source of truth for where the project stands.** Update it at the end of every work session. Any new Claude conversation should be able to read this file and get fully up to speed without re-explaining anything. Keep it plain-language and current.

_Last updated: 2026-07-31 (v2 → v2.7 change sessions — see the change logs below)_

**v2.7 (latest — recording grid overhaul):** Grid **fits on screen** (`table-layout:fixed`, full width) up to ~12 instruments, then horizontal **scroll with an always-visible styled orange rounded scrollbar** + a "scroll sideways" hint. **Bigger cells** (68px rows, 52px marks). **Customizable statuses (big one):** `albums.statuses` jsonb = an ordered pool of `{id,name,color,icon,na}`; a **Manage statuses** modal (reorder ↑↓, color picker, curated icon set, rename, N/A toggle, add/delete, Simple/Full presets). **Order defines progress** (first=0%, last=100%, evenly spaced); `na:true` statuses are excluded from every %. Cells store the **status id** (stable) in `song_tracks.status`; legacy 0–5 values migrate to default ids (and are normalized on read). New `/api/statuses`; `/api/cell` accepts string ids. **All downstream math recomputes from the album's statuses** — grid, dashboard ring/dots/parts-done, waiting-on, and the server-side share card (`app/share/[shareId]/page.tsx`). **Migrations required — `albums.statuses` + the `song_tracks.status` 0–5→id update (SQL below).**

**v2.6 (latest — 2 items + avatar unification):** **Consistent "you" avatar** — `/api/studio-data` returns a `me` object (name, initials, brand color, signed photo); every avatar that could be the signed-in user (member stack, activity dots, notifications dropdown, per-file comments, waiting-on, call bar/video tiles) now shows the profile photo and a consistent color, with a **name tooltip** on hover (this also resolved the "two accounts" confusion — it was one person drawn two ways). **Sequencer placeholder length** is now chosen up-front (picker opens on "Add placeholder") and editable later via a **clock icon** on the block; clicking the block body just seeks. **Notifications bell shows a green unread dot** (tracked by newest `activity.created_at` vs a per-album last-seen in `localStorage:'albumap:notifseen'`; cleared on open). **Schedule is fully manual now** — the reverse-timeline generator was replaced by an **Add schedule item** form (item, description, date, and **Goal date vs Hard deadline**); the timeline color-codes and labels each (goal = blue, deadline = red), rows are deletable. `/api/schedule` no longer wipes `release_date` on manual edits. **No new DB migrations this batch.**

**v2.5 (latest — 7 items):** Album title on the overview **shrinks to one line** (JS fit, never wraps). Dashboard **Tracklist card is now a mini sequencer** — full-height, duration-proportional blocks with waveforms, including placeholders (uses `buildSeqSongs`). Sequencer **placeholder length picker** — click a placeholder → pills 0:30–5:00 + custom mm:ss; the size updates in the sequencer and dashboard. **Band photos** and **Logos** sections: the artwork system was generalized to `artwork_pieces.kind` (`artwork`|`photo`|`logo`) — photos have a working set + pool like artwork; logos have a single labeled set (no pool) with the same zoom-to-edit modal (label pills + custom, replace, delete). New views `photos`/`logos` in the sidebar + crumbs; dashboard has Photos then Logos sections after Artwork/Merch. **Profile/settings page** (`view:'settings'`, sidebar "Profile & settings"): live name/photo/role editing via `/api/profile`; email shown read-only; membership/billing stubbed ("coming soon"). **Migrations required — `artwork_pieces.kind` and `profiles` role/photo_key/plan (SQL below).**

**v2.4 (latest — 3 items):** **Dashboard is a 2×2** of equal-height cards — Recording (each song shows small grid-colored dots per instrument, a quick heatmap) TL, Songs (names in order + single artwork thumbs) TR, Tracklist BL, Schedule BR; waiting-on + activity still on the right rail. **Edit band + album names** — pencil on artist cards (roster) renames the band across all its albums; pencil on album cards / the albums-page header renames the album (`PATCH /api/album`, `renameArtistFrom/To`). **Album artwork overhaul** — new `artwork_pieces` table (arbitrary items, `label`, `in_pool`, `position`; legacy 5-slot `album_assets` artwork auto-migrated). The Artwork page now has a **"Working art"** set + an **"Art pool"** (alternates); drag pieces between them; click any piece to open it **large** and edit its **label** (preset pills + custom), **replace**, **delete**, or move set↔pool. Uploads via `/api/artwork` (create/update/upload-url/delete); studio-data returns `album.artwork` (working + song singles) and `album.artworkPool`. Song single covers still surface here. **Migration required — new `artwork_pieces` table (SQL below).**

**v2.3 (latest — 6 items):** song **references are now typed** — artist / song / genre / link / file-upload, each with its own icon (data in `songs.refs` jsonb; file refs upload via `/api/ref-upload` to R2 and are signed in studio-data; links open in a new tab). Merch quantity inputs got **custom styled ±steppers** (native spinners hidden via `.no-spin`). **Share modal** now shows a large rounded **album cover** with the **% inside the progress ring**. **"Roster" renamed to "Artists"** everywhere (internal view id stays `roster`). Removed the **global Schedule** sidebar item (schedules are album-level). Added a **notifications bell** in the topbar (album pages) that opens a dropdown of recent activity; activity rows in the bell, on the dashboard, and on the Notifications page are **clickable** and route to the relevant section/song (best-effort keyword+song-title heuristic — section-level, not a per-comment anchor). **No new DB migrations this batch.**

**v2.2 (latest follow-up — 11 tweaks/bugs):** real logo PNG in sidebar (`public/albumap-io-logo.png`); merch size-qty inputs save on `oninput` (debounced) so they persist across size clicks + totals stay live; song-list grid icon is orange; dashboard card renamed "Song ideas"→"Songs"; **add song from the Songs page** + **delete song** from song header or grid row (`DELETE /api/song`, both views sync via shared `al.songs`); roster tile says **"New artist"** (asks artist first); single-song artwork upload moved into the song header between number and title (no description block); **Sequencer "Placeholder" blocks** — draggable 2:30 reserved slots, unique muted color each, removable, sequencer-only, persisted per album in `localStorage:'albumap:seq:<albumId>'` (songs still persist order to `songs.position`; placeholders are layout-only, skipped in playback but count toward runtime/vinyl sides); **per-file comments** — each track has its own comment thread + composer directly beneath it (the combined comments zone was removed); larger merch collapsed rows. **No new DB migrations this batch** — but C9 (per-file comments) needs the v2.1 `song_comments.file_id` column, so run that if you haven't.

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

**Where we are:** **Working product live at https://albumap.vercel.app** — the full album workspace, running on the user's real data, everything below **confirmed working by the user this session.** Stack fully provisioned: Vercel + Supabase (own org `Albumap`, project id `ztfscbfdaqodrylvxtum`, us-east-1) + Cloudflare R2 (bucket `albumap-audio`). Domain not bought yet.

**ARCHITECTURE DECISION (important — read before changing the UI):** The logged-in app IS the approved mockup, served verbatim. `public/studio.html` started as an exact copy of `mockups/00-full-app.html`; the auth-gated `/albums` route renders it full-screen in an iframe (cache-busted `?v=Date.now()`). This guarantees zero visual drift. **studio.html was edited ONLY at the data layer** — the hardcoded demo `artists` array became `let artists=[]` filled by `reloadData()` from `/api/studio-data`, and each interaction (cell click, upload, comment, etc.) calls an API to persist. All rendering/CSS/JS is still the mockup's. Keep it that way: to change data behavior edit the API + the small data-layer hooks; don't rewrite the views.

**Everything wired & persisted (Supabase + R2), all user-confirmed working:**
- Recording grid cells → `/api/cell` (states **0–5** in `song_tracks.status`; **5 = N/A**). Instrument columns are now **per-album & dynamic** (`albums.instruments` text[]) — add/rename/delete via `/api/instruments`. New albums start with **no** columns.
- Create album / add song → `/api/album`, `/api/song`
- **Audio** upload + playback via R2 presigned URLs → `/api/upload-url`, `/api/song-file`; table `song_files`
- Lyrics + notes → `/api/song-meta`; `songs.lyrics/notes`
- Artwork (R2) → `/api/asset-url`, `/api/album-asset`; `album_assets` (artwork slot 0 also feeds album-card covers)
- **Merch is now full records** (v2) → `/api/merch-item` (create/update/upload-url/set-image/delete); table `merch_items` (mockup+print files, budget, brand/style, color, sizes, has_sizes, vendor). The old slot-based `album_assets kind='merch'` path is retired in the UI.
- Band photo/logo (R2) → `/api/artist-photo-url`, `/api/artist-photo`; `artist_photos` (keyed owner+slug)
- Timestamped comments → `/api/comment`; `song_comments` (composer auto-stamps from current playback time)
- Members/invites → `/api/member`; `album_members` (owner seeded on create + backfilled)
- Schedule reverse-timeline generator persists → `/api/schedule`; `albums.schedule`/`release_date`
- References + credits per song → `/api/song-meta`; `songs.refs`/`credits` (jsonb)
- Activity feed → logged server-side across actions; `activity` table; newest-first, relative times
- **Public share page** `/share/[shareId]` — read-only "% complete" card, no login, via service-role admin client (`lib/supabase/admin.ts`); `albums.share_id`; the Share-progress modal link is real

**v2 changes (2026-07-31 change-spec session — 11 items, each its own commit):**
1. **Album-card covers** — album grid cards auto-pull artwork slot 0; `/api/studio-data` sets `album.cover` from it, card falls back to `artwork[0].img` for live update.
2. **Dashboard slots** — a *filled* artwork/merch thumb now navigates to the section page (scrolled + flashed on that item); only *empty* slots upload.
3. **Merch full records** — see above; Songs-page-style expandable list, collapsed row shows brand/color/size-count/budget, grows past 5. New table `merch_items`.
4. **Waveform seek** — precise click-to-seek anywhere (playing or paused), measured off the container rect; removed the "only seek if playing" guard; bars are `pointer-events:none`; paused seek stores `t.seekFrac` and starts there on play; pointer-drag scrubbing added.
5. **SoundCloud comment markers** — timestamped comments render as avatar dots on the waveform (positioned by stamp/duration), hover popover, click-to-seek. NOTE: comments are per-song (not per-file) so markers show on every file's waveform in that song.
6. **Master track** — `song_files.is_master`; exactly one per song, pinned to top with a `MASTER` badge; set via `PATCH /api/song-file` (clears siblings). Sequencer prefers it.
7. **Idea bank + labels** — album-level audio not tied to a song. `song_files.song_id` is now **nullable**, `song_files.album_id` added, RLS broadened (song-path OR album-path). `song_files.labels` text[] = section/instrument tags. Assign-to-song / send-to-bank via `PATCH /api/song-file {assignTo}`. Bank upload path in `/api/upload-url` & `/api/song-file` (`bank:true, albumId`).
8. **Sequencer** — real audio playback (HTMLAudioElement, plays each song's master/most-recent file, skips + hatches "no audio" songs); pointer-based drag with a real lift affordance + insertion edge; the album-order list rows are drag-reorderable by a ≡ grip; order persists via `/api/song-order` (`songs.position`). Placeholder oscillator tones removed.
9. **Recording-grid links** — a grid icon on every song row + a persistent "Recording grid" button in the topbar for any album view; both deep-link and flash the target row (`route.gridSong`).
10. **Grid blank-start + N/A** — covered above. **Cell-cycle decision:** left-click cycles Not started→Scratch→Tracked→Comped→Done→**N/A**→Not started; **right-click toggles N/A** directly. **N/A semantics:** state 5 is excluded from *every* denominator — song %, album ring, parts-done, waiting-on, and the public share card (server-side in `app/share/[shareId]/page.tsx`). Percentages are partial-credit: `sum(min(state,4) for non-N/A)/(non-N/A count × 4)`. `cells` is now an **object map `{instrument: state}`** (was a fixed array).
11. **Artist cards** — removed the non-functional hover play FAB from roster artist cards (kept `.playfab` CSS; album cards unchanged).

**v2.1 changes (follow-up batch — 15 tweaks/bugs, each its own commit):**
- **Waveform bars now fill the container** (`flex:1 1 0`, no max-width, 160 bars) — this fixed both "click-to-seek lands behind" (visual now matches the click math) and "player too small".
- **Comments are per-file** now (`song_comments.file_id`) — markers line up with the right audio file; a comment's popup **auto-reveals for ~2.4s as the playhead passes it** during playback (updProg). Composer attaches to the currently-playing file (or master/first).
- **Sequencer block waves** restyled to match the song-player waveform (centered fine bars).
- **Recording-grid topbar button is orange/solid**; sequencer order-list **song names link to the song** (drag now only via the ≡ grip).
- **Per-song single artwork** (`songs.artwork_key`, `/api/song-art`) — uploaded on the song page, auto-mirrored into Album artwork labeled with the song name (blue "Single" badge; opens the song).
- **Merch:** collapsed row shows big artwork + total qty/brand/budget; expanded has **per-size quantity inputs** (apparel) or a **total** field (non-apparel). `merch_items.size_qty jsonb`, `total_qty int`. Collapsed shows only the total.
- **Editable tag sets** per album (`albums.section_tags`, `instrument_tags`, `/api/album-tags`) via a **Manage tags** modal on the Songs page (and a link in each label palette). Rename migrates existing file labels.
- **Activity** capped to 6 on the dashboard with **View all → Notifications page** (`view:'activity'`); server keeps up to 50.
- **Refresh restores the current view** (route persisted to `localStorage:'albumap:route'`, restored in `reloadData`).
- **Sidebar is a nav tree**: active artist expands to its albums; active album expands to sections (Overview/Grid/Songs/Tracklist/Schedule/Artwork/Merch/Notifications).
- **Logo** replaced with an inline SVG concentric-pin mark (recreated to match the user's logo — swap for the exact raster later by dropping it in `public/` if desired).

**⚠️ Migrations to run in Supabase → SQL Editor** (idempotent; all folded into `supabase/schema.sql`, or just re-run the whole file). v2: `merch_items` table (item 3), `song_files.is_master` (6), `song_files.labels`/`album_id`/nullable `song_id` + broadened RLS (7), backfill existing albums' `instruments` (10). v2.1: `song_comments.file_id`, `songs.artwork_key`, `merch_items.size_qty`+`total_qty`, `albums.section_tags`+`instrument_tags`. Until these run, those features degrade gracefully (studio-data try/catches missing columns) but won't persist — and **comments won't load until `song_comments.file_id` exists**.

**Known limitation (this is the #1 next build):** members are a **display roster only** — inviting adds an avatar / "waiting on" entry but does NOT give that person a login into the album. Real multi-user membership (invited people sign in and edit) is not built yet. Also: brand-new albums start with an empty schedule until the generator is run; band-photo persistence is per artist-name-slug (no artist entity table yet).

**Stack / facts for any new session:**
- **Auth** — email+password signup & login (Supabase), profile auto-created via `handle_new_user` trigger. Email confirmation is OFF (for testing — turn on before real launch). Login at `/login`; `/albums` protected by middleware.
- **Framework** — Next.js 15 (App Router) + TypeScript + Tailwind v4, `@supabase/ssr`. Supabase clients in `lib/supabase/` (`client`, `server`, `admin`=service-role). Middleware refreshes sessions + protects `/albums`, and excludes `.html` so `studio.html` serves directly.
- **DB tables** (all RLS ON, only `authenticated`, rows scoped to album owner): `profiles`, `albums`, `songs`, `song_tracks`, `song_files`, `album_assets`, `artist_photos`, `album_members`, `song_comments`, `activity`, **`merch_items`** (v2). `albums.instruments` (text[]) now holds each album's dynamic grid columns. `song_files` gained `is_master`, `labels`, `album_id`, and a nullable `song_id`. Full idempotent schema in `supabase/schema.sql` — edit it and run in Supabase → SQL Editor to change the DB.
- **File storage** — Cloudflare R2 bucket `albumap-audio` (audio + all images). Browser uploads via presigned PUT; playback/display via presigned GET (1h). Bucket CORS allows GET/PUT/HEAD from `https://albumap.vercel.app`.
- **Vercel env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- **API routes** live under `app/api/*` (one per action); `GET /api/studio-data` returns everything shaped as the mockup's `artists` array (now includes `album.instruments`, object `cells`, `album.cover`, `merchItems`, `bank`, and per-file `master`/`labels`). New in v2: `/api/merch-item`, `/api/instruments`, `/api/song-order`; extended: `/api/song-file` (PATCH master/labels/assignTo; bank uploads), `/api/upload-url` (bank), `/api/album` (blank instruments).
- **Test data to clean up**: throwaway user "Grid Tester" (gridtest.claude+ap1@gmail.com) + album "Test Record" in the DB. Safe to delete. Also an earlier R2 token was pasted in chat then regenerated — the old one is dead.

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
4. [x] Real data wired: roster/albums/songs/grid from Supabase; grid + create/add persist (verified)
5. [x] Audio ideas via Cloudflare R2 — upload + playback (verified)
6. [x] Lyrics, notes, artwork, merch (verified) + band photo, comments, members, schedule, refs, credits, activity, public share page
7. [ ] **NEXT BUILD — real multi-user membership (the big one):** invited people get a login and can see/edit the album they're on. Needs: an `album_members.user_id` link + invite flow (link or email), and **RLS broadened** so members (not just the owner) can read/write their albums' rows across all tables. This is what turns the display roster into true multiplayer — albumap's core value.
8. [ ] Smaller follow-ups when convenient: turn Supabase email confirmation back ON before real launch; delete the "Grid Tester" / "Test Record" test data; give brand-new albums a starter schedule; consider a real artist/band entity so band photos aren't keyed by name-slug.
9. [ ] Use it on a real record with Jordan (the actual launch — the whole point).
10. [ ] Buy domain once the name is decided (trivial to add in Vercel later).

**Where to pick up next session:** the app is a complete, working single-user album workspace on real data. Start item 7 (multiplayer) — that's the highest-value next step and the one thing that's faked right now.

## Parking lot (ideas, not commitments)

- Public shareable grid as the viral wedge
- Reverse-timeline generator as encoded-expertise moat
- Credits/splits as retention (nobody deletes the legal record of their catalog)
- Vinyl side-break calculator (already prototyped in sequencer)
- Creator/YouTube sponsorships in home-recording niche as a channel
- Distributor white-label (DistroKid/CD Baby) as a long-shot big-contract motion
