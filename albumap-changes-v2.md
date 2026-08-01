# albumap — Change Spec v2 (11 fixes)

> Paste-ready for Claude Code. Work through these in order (they're sorted so earlier items don't conflict with later ones). Commit after each numbered item with the message given. Test each acceptance check before moving on.

---

## 1. Album cards should show the cover artwork

**Where:** Artist → albums page (the album grid cards), and anywhere else an album thumbnail shows (sidebar library, breadcrumbs if applicable).

**Change:** The album card thumbnail should automatically pull the image stored in the album's artwork slot 0 ("Cover"). If no cover is uploaded yet, keep the current letter-placeholder fallback.

**Acceptance:** Upload a cover in Album artwork slot 1 → navigate to the artist's albums page → the album card shows that image. Delete/replace the cover → card updates.

**Commit:** `feat: album cards pull cover art from artwork slot 0`

---

## 2. Filled dashboard slots navigate, don't re-upload

**Where:** Dashboard → Album artwork row and Merch row.

**Change:** When a slot is EMPTY, clicking uploads (current behavior — keep). When a slot is FILLED, clicking navigates to that section's full page (artwork page / merch page), ideally scrolled/anchored to that item. Re-upload/replace only happens on the full page, not from the dashboard.

**Acceptance:** Click a filled artwork thumb on dashboard → lands on Artwork page. Click an empty slot → file picker opens. Same for merch.

**Commit:** `fix: filled dashboard slots navigate to section page instead of re-upload`

---

## 3. Merch items become full records (Songs-page-style list)

**Where:** Merch "View all" page.

**Change:** Rebuild as an expandable list exactly like the Songs page pattern:

- **Collapsed row shows:** item name, brand + style, color, size count (e.g. "5 sizes"), budget. Small mockup thumbnail if present.
- **Expanded row shows:**
  - Two image slots side by side: **Mockup** and **Print-ready / full-res artwork** (separate uploads, both stored on the item)
  - Inputs: **Budget** ($), **Brand & style** (e.g. "Gildan 5000" / "Bella+Canvas 3001"), **Item color**, **Sizes** (multi: S–3XL toggle chips or similar; only show when apparel — a "has sizes" toggle is fine), **Vendor** (name + optional link/contact)
- Data persists to the database like song fields do.
- Keep an "Add merch item" button (list can grow past 5).

**Acceptance:** Create an item, fill every field, upload both images, refresh page → all persisted. Collapsed row shows color/brand/style/size-count/budget correctly.

**Commit:** `feat: merch items as full records with mockup+print files, budget, brand, color, sizes, vendor`

---

## 4. Waveform click-to-seek must be precise

**Where:** Song audio player (Songs page).

**Bug:** Clicking a specific point on the waveform doesn't seek there; only coarse/forward seeking works.

**Change:** Clicking ANY point on the waveform seeks to exactly that proportion of the track — backward or forward — with these behaviors:
- Works while playing (jumps immediately).
- Works while paused: store the seek position, start from there on play, and visually fill the waveform to that point.
- Position math must use the waveform container's bounding rect, not individual bars (bars/gaps must not swallow clicks — likely cause: `pointer-events` on bars or a guard like "only seek if this track is currently playing"). Remove any such guard.
- Also support click-drag scrubbing along the waveform if cheap to add.

**Acceptance:** Play a track, click at ~25%, ~75%, then back at ~10% → playhead lands exactly there each time. Do the same while paused, then press play → starts from clicked point.

**Commit:** `fix: precise click-to-seek anywhere on waveform, playing or paused`

---

## 5. SoundCloud-style comments on the waveform

**Where:** Song audio player.

**Change:** Timestamped comments render as small avatar markers ON the waveform at their timestamp position (like classic SoundCloud). Hover (or tap) a marker → tooltip/popover with author + comment text. Clicking a marker seeks to that timestamp. Adding a comment: a button (or clicking the waveform in "comment mode") captures current playback time and opens a small input; the new comment appears as a marker immediately. Keep the existing comments list below as the full thread.

**Acceptance:** Existing comments show as avatars at correct positions along the waveform. Hover shows text. Add a comment mid-playback → marker appears at that timestamp and persists after refresh.

**Commit:** `feat: soundcloud-style avatar comment markers on waveform`

---

## 6. Master track designation

**Where:** Song audio files list.

**Change:** Each song can have exactly ONE file flagged as **Master** — "the current most-complete version." UI: a "Set as master" action on each file row (star/flag); the master row pins to the top of the song's file list with a clear `MASTER` badge (accent color). Setting a new master un-flags the old one. The master is what other surfaces should prefer (see item 8 — sequencer plays masters).

**Acceptance:** Flag a file → badge + pinned top + persisted. Flag a different file → flag moves. 

**Commit:** `feat: per-song master track designation`

---

## 7. Idea bank (unassigned ideas) + part/instrument labels

**Where:** Songs page.

**Change:**
- Add an **Idea bank** section (top or bottom of Songs page): audio uploads NOT linked to any song. Same player/waveform treatment.
- Every idea (banked or song-linked) supports **labels**: song-section tags (Chorus, Verse, Bridge, Intro, Outro, Hook) and/or instrument tags (Guitar, Bass, Drums, Synth, Vox...). Multi-select chips; filterable is a bonus, not required.
- Banked ideas can be **assigned to a song** later (move action → pick song), and song ideas can be sent back to the bank.

**Acceptance:** Upload to bank, tag it "Bridge + Guitar," refresh → persists. Assign it to a song → appears under that song with tags intact.

**Commit:** `feat: idea bank with part/instrument labels and assign-to-song`

---

## 8. Sequencer: real playback + real drag feel + draggable list

**Where:** Tracklist sequencer.

**Three changes:**

**(a) Real audio playback.** Kill the placeholder tones. Play button plays the actual audio through the sequence: for each song use its **Master** file (item 6), else its most recent file, else skip it (visually mark skipped songs as "no audio"). Playhead and per-block highlight track real playback position. Clicking the timeline seeks within the real audio (jump to the right song + offset).

**(b) Drag affordance.** Dragging currently looks like dragging a static image (browser ghost) — unclear anything is happening. Replace or augment native HTML5 drag with a proper visual: the dragged block lifts (scale up slightly, shadow, follows cursor or a styled drag-image), the gap/insertion point is obvious, cursor is `grabbing`. Add a short visible instruction line near the timeline: "Drag any block — or any row below — to reorder the album."

**(c) The album-order list below is ALSO drag-reorderable.** Drag rows with a visible grab handle (≡) to reorder; timeline and list stay in sync both directions.

**Acceptance:** With masters set on 2+ songs, press play → actual songs play in order, playhead moves correctly, seeking works. Dragging a block visibly lifts and shows insertion point. Dragging a list row reorders and the timeline updates.

**Commit:** `feat: sequencer plays real masters; proper drag UX; list rows draggable`

---

## 9. Recording grid reachable from every song

**Where:** Songs page (+ anywhere songs are listed).

**Change:** Each song row/header on the Songs page gets a visible "Grid" link/button (small grid icon) that opens the Recording grid, ideally highlighting/scrolling to that song's row. Also add "Recording grid" as a persistent link somewhere always available inside an album (e.g. next to the section nav or breadcrumb area) so it's never a single-entry-point feature.

**Acceptance:** From any song on the Songs page, one click reaches the grid. 

**Commit:** `feat: recording grid links from every song + persistent album nav entry`

---

## 10. Grid: blank start, custom instruments, N/A state

**Where:** Recording grid.

**Changes:**
- **Blank start:** new albums begin with NO instrument columns. An "+ Add instrument" button adds columns (free-text name, e.g. "Pedal steel"); columns can be renamed and deleted (delete confirms, and clears that column's cell data).
- **N/A state:** add a "Not applicable" state to the cell cycle (distinct look — e.g. dimmed with a dash or ⃠). Semantics: **N/A cells are ignored entirely in every calculation** — they don't count toward or against song %, album %, parts-done counts, or "waiting on" totals. A song with 4 real parts done-out-of-done and 2 N/A = 100%.
- Cell cycle order suggestion: Not started → Scratch → Tracked → Comped → Done → N/A → back to Not started. (Or put N/A behind a right-click/long-press if the cycle feels long — implementer's call, note it in PROJECT_STATE.)
- Recompute all % displays (dashboard ring, song rows, share card) with N/A excluded from denominators.

**Acceptance:** New album → empty grid → add 3 instruments → mark cells including some N/A → percentages match hand math with N/A excluded. Delete an instrument → column gone everywhere.

**Commit:** `feat: grid blank-start with custom instruments and N/A state excluded from all percentages`

---

## 11. Remove phantom play button on artist cards

**Where:** Roster/Artists page (and artist card anywhere the hover-play appears).

**Change:** Delete the hover play button overlay on artist avatars/cards. It plays nothing and shouldn't exist. (Keep hover styling like the lift/border if present — just remove the play FAB.)

**Acceptance:** Hovering an artist card shows no play button.

**Commit:** `fix: remove non-functional play button from artist cards`

---

## After all 11: update PROJECT_STATE.md

Add to the status section: what changed, the N/A semantics decision, master-track concept, idea bank, and merch record schema. Commit: `docs: update PROJECT_STATE for v2 changes`.
