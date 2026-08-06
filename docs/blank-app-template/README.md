# Blank App Template

A stripped-down, placeholder-filled copy of MTG Deck Builder's page shell, About tab, and
**full persistence/sync backend** - every layout, sizing, typography, spacing, background,
image-placement, profile, and Dropbox-sync decision from that app carried over exactly,
with all real content emptied out. Use this as the literal starting point for a new static
HTML/CSS/JS app when you want structural continuity with MTG Deck Builder (and,
transitively, with any other app also started from this same template).

**Not destructive to anything** - this is a standalone copy living in its own folder. It
doesn't read from, write to, or depend on the real MTG Deck Builder app in any way.

For the full picture of how to actually bootstrap a new project from this (folder location,
GitHub setup, what to rename first, what else to carry over), start at
[`../NEW-APP-HANDOFF.md`](../NEW-APP-HANDOFF.md) instead of this file - that's the
top-level entry point. This README just documents what's inside this specific folder.

## What's here

```
index.html          landing page (blank title/subtitle/footer)
app.html             app shell: header, nav, status bar, update banner, 2 placeholder
                      tabs, a Reference tab, How To Use, a FULLY WORKING System tab, and
                      the full About tab
css/styles.css        the real app.html stylesheet, copied verbatim
css/landing.css       the real index.html stylesheet, copied verbatim

js/app.js              tab routing, header-height sync, update-banner watcher, bootstrap
js/version.js           APP_VERSION starting at v0.0.1
js/dom-utils.js          escapeHtml() - shared by system-tab.js and ui-other-apps.js
js/share.js              generic share-sheet/clipboard-fallback wiring, copied verbatim
js/landing-fit.js         generic title/subtitle auto-fit-to-width script, copied verbatim

js/storage.js            localStorage persistence: profiles, tombstoned deletions, quota-
                          safe writes - MTG Deck Builder's real storage.js with its
                          MTG-specific fields (owned cards/decks) swapped for two GENERIC
                          EXAMPLE shapes (see "The persistence/sync backend" below)
js/dropbox-sync.js       Dropbox OAuth (PKCE) + push/pull sync engine - copied verbatim,
                          this file was already 100% generic in the real app
js/sync-config.js        Dropbox app key - ships empty/unconfigured, safe to load as-is
js/system-tab.js         renders the System tab: profiles, sync status, backup, reset -
                          MTG Deck Builder's real ui-data.js with the Scryfall-specific
                          "Refresh card data" panel removed

js/app-backgrounds.js      empty image pool for the in-app background
js/landing-backgrounds.js  empty image pool for the landing page background
js/other-apps.js           empty "My Other Apps" list
js/ui-other-apps.js        renders js/other-apps.js into the About tab (no QR code - see
                            that file's own comment for why)
js/qr-code.js               QR generation + share-as-image wrapper, copied verbatim
js/vendor/qrcode-generator.js  vendored library (MIT, kazuhikoarase), copied verbatim

images/              about/, app-bg/, landing-bg/, other/, QR/ - all empty, see
                      images/README.txt for what goes where
fonts/                empty - see fonts/README.txt
serve.ps1             same local static-file server MTG Deck Builder uses for dev/testing
                      (Windows PowerShell, zero dependencies) - see the handoff doc for how
                      this plugs into a Claude Code session's .claude/launch.json
```

## The one deliberate visual change from "100% verbatim"

MTG Deck Builder's page title (`.app-header h1`, `.landing-title`) uses a Magic: The
Gathering branded display font (`@font-face "MTGTitle"`, a licensed asset specific to that
app). That font-face and every reference to it were removed here - both title styles fall
back to plain Georgia/serif instead. Everything else in the CSS is byte-for-byte the real
stylesheet; **this is the only intentional visual deviation**. If you want your own display
font, drop it in `fonts/` and add your own `@font-face` block the same way (there's a
comment marking exactly where in both CSS files), then point the two `font-family` rules at it.

Two smaller, harmless side effects of copying the CSS verbatim:
- Five color variables (`--white`, `--blue`, `--black`, `--red`, `--green`, `--gold` in
  `:root`) are actually MTG mana-symbol colors, not generic theme colors. Unused unless you
  reference them; rename or repurpose them freely.
- A handful of selectors for MTG-specific things (card grids, deck-builder panels, mana
  curve charts, etc.) exist in the stylesheet but are never referenced by this blank
  template's HTML - inert, not a problem, just extra rules sitting unused until/unless you
  build something that needs them.

## The persistence/sync backend

Unlike the earlier version of this template, **this is not a stub** - profiles, Dropbox
sync, manual backup, and the System tab are fully wired and working out of the box. Open
`app.html` right now with nothing configured and you already get: a default profile
created automatically, a working status bar, a working System tab (Switch Profiles /
Automatic Sync / Manual Backup / Reset This Device), and Export/Import that produces and
reads real JSON files. Dropbox sync specifically stays inert (shows "not set up yet")
until you register your own Dropbox app and fill in `js/sync-config.js` - see
`../SYNC-ARCHITECTURE-HANDOFF.md` and this repo's own README.md ("Syncing across devices")
for those exact steps, since they're Dropbox Console UI steps, not code.

**`js/storage.js` ships with two generic example data shapes** in place of MTG Deck
Builder's real "owned cards" / "decks" fields - keep whichever matches your app's own data,
delete the other, rename freely (the file's own comments walk through this):

- `items` / `itemsRemoved` - a **keyed map** (id → denormalized object) with its matching
  tombstone map. Models MTG Deck Builder's "owned cards."
- `records` / `recordsRemoved` - an **array of objects**, each with its own `updatedAt`,
  with its matching tombstone map. Models MTG Deck Builder's "decks."
- `viewPref` - a simple, low-stakes per-profile setting with no tombstone (losing a stray
  UI preference isn't the kind of thing that needs the same protection real data does).

Everything else in `storage.js` - profile creation/switching/deletion, the one-time legacy-
data migration, Dropbox auth storage, quota-safe writes with automatic cache-clear retry,
tombstone pruning - is the reusable machinery and shouldn't need to change.

**Do not treat any of this as boilerplate to skim past.** Every non-obvious decision in
`storage.js` and `dropbox-sync.js` (why profile ids are random, why merges are additive-
only with tombstones instead of "newest wins," why uploads are conditional on a revision
number, why auto-push flushes on `visibilitychange`) exists because a specific, real data-
loss or data-duplication bug was found, reproduced, and fixed this exact way while building
MTG Deck Builder. The full incident-by-incident writeup is
[`../SYNC-ARCHITECTURE-HANDOFF.md`](../SYNC-ARCHITECTURE-HANDOFF.md) - read it before
changing how any of this works, not after something breaks.

**If your app doesn't need cross-device sync at all**, you can still keep the profiles +
localStorage part of `storage.js` and just never load `dropbox-sync.js`/`system-tab.js`'s
sync section - or strip it all the way down to a single flat profile if even that's more
than you need. Nothing else in this template depends on Dropbox being present.

## What to fill in

Everything in `app.html`'s About tab and `index.html` reads as an obvious placeholder
("Your Name", "Your App Name", empty `href="#"` links, an empty `src=""` on the bio photo).
Replace those directly. The placeholder tabs (`Tab One`, `Tab Two`, `Reference`) are empty
shells demonstrating the tab-group visual-weight pattern (primary/secondary/info) - rename,
remove, or build them out; just keep each tab link's `data-tab` value matching its
`<section id="tab-...">` and update the `TABS` array at the top of `js/app.js` to match.
**How To Use, System, and About are meant to stay** (same "common tabs" every app built
from this template should keep) - System in particular needs no further work at all.

For sizing/layout of things not covered here (buttons, responsive image grids, the mobile
viewport-lock checklist, breakpoints), see
[`../LAYOUT-SIZING-REFERENCE.md`](../LAYOUT-SIZING-REFERENCE.md) in this same repo - this
template's job is the page shell, About tab, and persistence backend specifically; that doc
covers the rest of the generic UI vocabulary.

## Running it

Same as MTG Deck Builder: classic `<script>` tags, no build step. Serve the folder with
`serve.ps1` (`powershell -File serve.ps1`, defaults to `http://localhost:8091`) or any
other static file server - Dropbox's OAuth redirect needs a real `http://` origin to work
against, so prefer this over opening `index.html`/`app.html` directly via `file://` once
you're testing sync.
