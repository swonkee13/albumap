# albumap.io — starter kit

This folder is the clean starting point for the albumap project. Drop the whole thing into `~/Documents/albumap` on your Mac, point Claude Code at it, and put it under Git (see `GIT_AND_SETUP.md`).

## What's in here

- **PROJECT_STATE.md** — the single source of truth. Where the project stands, every locked decision and *why*, scope (v1 vs later), current status, next actions. **Update this at the end of every session.** Any new Claude conversation should read this first to get caught up.
- **GIT_AND_SETUP.md** — plain-English Git cheat sheet + how to set everything up through Claude Desktop (no terminal), and when to stand up Vercel / Supabase / R2 / the domain.
- **mockups/** — the interactive HTML prototypes we built. These are *reference* for the real build, not the app itself:
  - `00-full-app.html` — the unified app (start here; it's the whole vision in one file)
  - `01-dashboard.html` — standalone dashboard
  - `02-song-player.html` — standalone drop-in audio player (decodes real waveforms)
  - `03-sequencer.html` — standalone tracklist sequencer

## How to work from here

1. Put this folder under Git and push to GitHub (GIT_AND_SETUP.md walks you through it via Claude Desktop).
2. When you're ready to build the real app, start a session with: *"Read PROJECT_STATE.md and the mockups, then let's build the v1 recording grid."*
3. Commit often, push every session, keep PROJECT_STATE.md current. That's the whole discipline.

## First thing to decide

Per PROJECT_STATE.md → Next actions: are we starting the real build now, or refining mockups more? Everything else follows from that.
