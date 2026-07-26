# Git + Setup — plain English

This is the antidote to the Clinenest mess. The rule underneath all of it: **nothing important should ever live in only one place, and you should always be able to walk back to a working version.** Git gives you both. You barely have to think about it once it's set up — and with Claude Code in the desktop app, Claude runs these commands *for you*, so you mostly just say what you want.

---

## The mental model (30 seconds)

- **Git** = a time machine for your project folder. Every "commit" is a saved snapshot you can return to.
- **GitHub** = the off-site copy of that time machine (your backup lives here, not just on your laptop).
- **Commit** = "save a snapshot, with a note about what changed."
- **Push** = "send my snapshots up to GitHub" (the backup step).
- **Branch** = a safe sandbox to try something risky without touching the working version.

If you commit often and push every session, the Clinenest problems can't happen. Lost work, no backup, out-of-order versions — all gone.

---

## The only commands you actually need

You will mostly ask Claude Code to do these. But so you know what they mean:

| You want to... | Command | Plain English |
|---|---|---|
| Save a snapshot | `git add -A` then `git commit -m "message"` | "Save everything, with this note" |
| Back it up | `git push` | "Send snapshots to GitHub" |
| See recent snapshots | `git log --oneline` | "Show me the history" |
| Start a safe experiment | `git checkout -b try-something` | "New sandbox branch" |
| Keep the experiment | `git checkout main` then `git merge try-something` | "Bring it into the real code" |
| Throw the experiment away | `git checkout main` then `git branch -D try-something` | "Nuke the sandbox, main untouched" |
| Undo uncommitted changes | `git restore .` | "Go back to my last saved snapshot" |

That's genuinely it. Six or seven commands cover 95% of your life.

---

## Two habits that would've saved Clinenest

1. **Commit at the end of every working chunk, push at the end of every session.** Never leave a session with uncommitted work. If it's committed and pushed, it literally cannot be lost.
2. **Risky change? Branch first.** Anything that might break things goes on a branch. Works → merge it. Breaks → delete the branch, main never knew. No fear.

And keep **PROJECT_STATE.md** current — it's the "what/why" memory so any new Claude chat gets up to speed instantly.

---

## Setting it all up in the Claude Desktop app (no terminal)

You asked to do this through Claude Desktop / Claude Code rather than the terminal. Here's the flow. Claude Code runs on your machine, sees your real files, edits them in place, and runs Git for you — so "pushing to Git" becomes "ask Claude to commit and push."

### One-time setup

1. **Install Claude Desktop** (if not already), and open the **Code** tab — that's Claude Code inside the desktop app.
2. **Make a project folder** on your Mac, e.g. `~/Documents/albumap`. Drop this whole starter folder's contents into it.
3. **Point Claude Code at that folder** (the Code tab lets you open/select a working directory). Now Claude can see and edit your files.
4. **Create a GitHub account** if you don't have one, and **create a new empty repo** called `albumap` on github.com.
5. Ask Claude Code, in plain English: *"Initialize git in this folder, make the first commit, connect it to my GitHub repo at <paste the repo URL>, and push."* Claude runs the commands. Done — your project is now version-controlled and backed up.

> Note: the very first GitHub connection needs you to be signed in to GitHub (Claude may prompt you to authenticate, or you sign in once in the desktop app / browser). After that, pushing is frictionless.

### Every session after that

- Open the Code tab, make sure it's pointed at the `albumap` folder.
- Start with: *"Read PROJECT_STATE.md and show me the last few commits so we're caught up."*
- Work in small chunks. After each working piece: *"Commit this with a clear message."*
- End of session: *"Update PROJECT_STATE.md with what we did and what's next, then commit and push everything."*

You never touch the terminal. You describe what you want; Claude edits files and runs Git.

---

## When to stand up the real stack

You don't need any of this until you start the real build (the mockups are just HTML). When you do:

1. **GitHub repo** — done above.
2. **Vercel** — create a project, connect it to the GitHub repo. Every push auto-deploys. Free `.vercel.app` URL, no domain needed.
3. **Supabase** — create a project (database + auth), grab the keys. Same as Clinenest.
4. **Cloudflare R2** — only when you add real file storage. Create a bucket, grab the keys. This is the one new piece vs Clinenest (ask Claude to walk you through it when you get there).
5. **Domain** — skip for now. Add later in Vercel → Settings → Domains in ~10 minutes, zero disruption. Buy once the name is decided.

Cost to start: **$0** (everything free tier) plus the domain later (~$10–40/yr for `.io`).

---

## The .gitignore you'll want

When the real app starts, make sure secrets and junk never get committed. Ask Claude Code to create a `.gitignore` with at least: `node_modules/`, `.env`, `.env.local`, `.vercel/`, `dist/`, `.DS_Store`. **Never commit your `.env` file** — that's where API keys live, and they must not go to GitHub.
