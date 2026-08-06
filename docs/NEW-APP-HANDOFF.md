# New App Handoff — Start Here

You're a fresh Claude Code session about to bootstrap a **new** static HTML/CSS/JS app
using MTG Deck Builder's structure, design, and backend as the starting point. This
document is the single entry point - read this first, in full, before touching any code.
It tells you exactly what already exists for you to reuse, what convention to follow, and
where to go for the deeper reasoning behind any of it.

This doc lives at `X:\APP_projects\mtg-deckbuilder\docs\NEW-APP-HANDOFF.md`. Everything it
references is either in this same `docs/` folder or in `docs/blank-app-template/`, both
inside that same repo.

## 0. Why this exists

MTG Deck Builder (`X:\APP_projects\mtg-deckbuilder`) reached a point the user described as
"the high-standard for any other app I have created or want to create," and asked
explicitly to carry its structure, design, features, and UI/UX into future app projects -
not by re-deriving it from scratch each time, but by handing a new session everything
needed to start already caught up. This doc, its companion docs, and
`docs/blank-app-template/` are that hand-off, kept current as of the request that produced
this version (image-folder reorg, Other-Apps-card grid sizing, and the full profiles/
Dropbox-sync/System-tab backend added to the template).

## 1. What already exists for you

**`docs/blank-app-template/`** - a working, placeholder-filled copy of MTG Deck Builder's
page shell. Not a stub: open its `app.html` right now (via `serve.ps1`) and you get a
working landing page, header/nav, status bar, About tab, and a **fully functional System
tab** (profiles, Dropbox sync, manual backup, reset) with zero configuration. See that
folder's own `README.md` for exactly what's in it and what to fill in first.

**Three companion reference docs** (same `docs/` folder as this one) - read the relevant
one *when you get to that part of the work*, not necessarily all up front:
- [`UI-DESIGN-AND-COLLABORATION-HANDOFF.md`](UI-DESIGN-AND-COLLABORATION-HANDOFF.md) - UI/UX
  patterns worth reusing, and **how this user likes to work** with Claude (screenshot
  feedback style, when to discuss vs. just build, verification discipline, commit/push
  cadence). Read the "how this user likes to work" section early - it'll save you from
  re-learning it the hard way.
- [`LAYOUT-SIZING-REFERENCE.md`](LAYOUT-SIZING-REFERENCE.md) - exact CSS numbers and
  mechanisms (header behavior across breakpoints, button sizing, the responsive image-grid
  formula, the mobile-viewport-lock checklist). Reference this when building out real tab
  content, not just the shell.
- [`SYNC-ARCHITECTURE-HANDOFF.md`](SYNC-ARCHITECTURE-HANDOFF.md) - the full reasoning behind
  every non-obvious decision in `storage.js`/`dropbox-sync.js`, and every real sync bug
  that shape produced (with the fix). **Read this before changing how persistence or sync
  works**, even though the template's version already implements every lesson in it.

## 2. Conventions to follow (not negotiable, established across many projects)

- **New project folder:** `X:\APP_projects\<new-app-name>` - sibling to
  `X:\APP_projects\mtg-deckbuilder`, its own independent folder.
- **New GitHub repo, same account:** `github.com/IDMNGZ/<new-app-name>` - a fresh repo per
  app, not a subfolder of an existing one. Don't create or push it without the user's
  explicit go-ahead first; local `git init` + commits are fine on your own.
- **One project, one folder, one Claude Code session, deliberately.** Don't let work drift
  into MTG Deck Builder's own folder/repo, and expect the user to want that same boundary
  respected going forward.
- **GitHub Pages hosting**, same as MTG Deck Builder: push to the default branch, enable
  Pages (`Settings → Pages → Deploy from a branch`), no CI/build step needed.
- **Folder structure inside the new repo** (matches MTG Deck Builder exactly - see its own
  `images/README.txt` for the reasoning on each):
  ```
  index.html, app.html, css/, js/, images/{about,app-bg,landing-bg,other,QR}/, fonts/, docs/
  ```
- **Commit discipline:** commit after essentially every meaningful change, message
  explains *why* not just what, ends with
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Bump `js/version.js`'s
  `APP_VERSION` on every push (see `SYNC-ARCHITECTURE-HANDOFF.md` §5 for why this exists).
- **Verification discipline:** "done" means verified in a real running browser (this
  project's `serve.ps1` + the Browser pane's `preview_start`), not "should work." Full
  console-error sweep across every tab before calling anything shipped.

## 3. Your literal checklist for the numbered items

Mapped directly to what was asked for when this doc was written, so nothing gets silently
dropped:

| # | Ask | Where it already is |
|---|---|---|
| 1 | Landing page: same dimensions, rotating bg images, footer text + version | `blank-app-template/index.html` + `css/landing.css` - fill in title/subtitle/footer text, drop images in `images/landing-bg/`, list them in `js/landing-backgrounds.js` |
| 2 | Same Share buttons/icon | `blank-app-template/js/share.js`, already wired on the landing page and in the status bar |
| 3 | "In Dash Title area" | The header `<h1>` (`.app-header h1`) - see item 11 re: font |
| 4 | Header dashboard, same responsive rules | `css/styles.css` `.app-header` + breakpoints - see `LAYOUT-SIZING-REFERENCE.md` §2 and §6 for the exact numbers and why each breakpoint exists |
| 5 | Blank main tabs | `blank-app-template/app.html`'s `Tab One`/`Tab Two`/`Reference` placeholders - rename/build out freely, see that file's own comments |
| 6 | Common tabs: How To Use, System, About | All three exist; System is **fully wired already** (see §1 above), About is fully built (item 7), How To Use is an empty shell to fill in |
| 7 | About tab + bio, same dimensions, Donation/Contact/Other Apps/Legal | `blank-app-template/app.html`'s `#tab-about` - every section from the real app is present as a placeholder, same layout/sizing |
| 8 | Same rules for borders/groups/fields/"wasted space" | `LAYOUT-SIZING-REFERENCE.md` (the whole doc) + `UI-DESIGN-AND-COLLABORATION-HANDOFF.md` §1 |
| 9 | Same persistent-data/Dropbox-sync/System-options/profiles design | `blank-app-template/js/storage.js` + `dropbox-sync.js` + `system-tab.js` - working, not just described |
| 10 | Exact backend code, not "figure it out again" | Same three files as #9 - real, runnable code, not pseudocode. See that folder's `README.md` §"The persistence/sync backend" for what to rename vs. leave alone |
| 11 | Same fonts/sizing, excluding Title font | Copied verbatim in `css/styles.css`/`css/landing.css`; only the MTGTitle `@font-face` was stripped (see that template's own README) - drop your own in `fonts/` when you have it |
| 12 | Same rotating background system | `js/app-backgrounds.js` + `js/landing-backgrounds.js`, empty pools ready for your own images |
| 13 | Project folder in `X:\APP_projects` | See §2 above |
| 14 | Same GitHub account (IDMNGZ) | See §2 above |
| 15 | New repo per new project | See §2 above |
| 16 | Same folder structure (images/fonts/docs) | See §2 above |
| 17 | What else to carry over | See §4 below |

## 4. What else to carry over (answering "what else should we carry over?")

Things worth adopting from day one that weren't explicitly asked for but earned their place
building MTG Deck Builder:

- **The update-available banner** (`#update-banner`, `watchForNewVersion()` in
  `blank-app-template/js/app.js`) - polls `version.js` on an interval and on tab-focus,
  catches a tab left open across a deploy silently running stale code. Already wired in
  the template.
- **`serve.ps1`** - the same zero-dependency PowerShell static file server, copied into
  `blank-app-template/` already. Wire it into the new project's own `.claude/launch.json`
  the same way MTG Deck Builder's session does (see that file in this repo's session for
  the exact shape) - a stale cached path here has bitten this exact setup before (see
  `PROJECT-NOTES.md`'s "Known gotchas" in the MTG repo), so double-check the path after any
  folder move.
- **A `PROJECT-NOTES.md` from day one**, even before there's much to put in it - see MTG
  Deck Builder's own for the shape. Cheaper to keep updated from the start than to backfill.
- **`.gitignore` conventions**: raw/uncompressed source images excluded with the FULL
  nested path (`images/landing-bg/*.png`, not `landing-bg/*.png` - see MTG's own
  `.gitignore` comment on why the shallow pattern silently fails to match).
- **`js/sync-config.js` committed directly** (not gitignored) - the Dropbox app key it
  holds is a public OAuth client id, not a secret; PKCE needs no client secret at all. Each
  new project needs its **own** fresh Dropbox app registration though - the key itself
  isn't reusable across projects.
- **README.md structure**: running it / hosting on GitHub Pages / how saves work / syncing
  across devices (with the exact Dropbox Console setup steps) / any app-specific notes.
  MTG Deck Builder's own README is the template for this.
- **The collaboration patterns in `UI-DESIGN-AND-COLLABORATION-HANDOFF.md` §2** - this is
  the part most worth re-reading in full rather than summarizing further here.

## 5. Suggested order of operations

1. Confirm the new app's name/folder with the user if not already given.
2. `X:\APP_projects\<name>` - copy `blank-app-template/`'s contents in as the starting
   point (or extract `blank-app-template.zip`).
3. Rename `storage.js`'s `NS` constant and `dropbox-sync.js`'s `SAVE_PATH`/PKCE key prefix
   away from the `"yourapp"` placeholders - both files say exactly where.
4. Fill in `index.html`/`app.html`'s placeholder text (title, bio, links, legal) - leave
   the structure/classes alone unless intentionally changing the design.
5. Rename/build out the placeholder main tabs for whatever this app actually does.
6. `git init`, first commit, confirm with the user before creating the GitHub repo or
   pushing anywhere.
7. Everything else (Dropbox app registration, real background images, a real font) can
   happen incrementally - none of it blocks getting a working skeleton committed first.
