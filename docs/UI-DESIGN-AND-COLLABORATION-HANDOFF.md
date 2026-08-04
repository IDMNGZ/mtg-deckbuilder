# UI Design & Collaboration Handoff

Companion to [`SYNC-ARCHITECTURE-HANDOFF.md`](SYNC-ARCHITECTURE-HANDOFF.md) in this same
folder. That doc covers data model and sync architecture; this one covers two different
things learned building MTG Deck Builder: **UI/UX design patterns** worth reusing, and
**how this user likes to work** with Claude on a project. Neither is MTG-specific — both
apply to any small, iteratively-built app.

## 1. UI/UX patterns that held up well

- **Consistency is enforced, not assumed.** A design choice made in one place (a bordered
  panel style, a section-header treatment, a button style) needs to be applied everywhere
  that same *kind* of element appears — not just the one spot that prompted it. Twice this
  project, a fix landed in one tab and had to be redone project-wide a session later once
  it became obvious other tabs had the identical problem (a missing border on search/filter
  boxes; later, spacing below those same boxes). Cheaper to ask "does this pattern exist
  elsewhere in the app?" before scoping a fix narrowly.
- **Group UI by what the user is *doing*, not by where a control happened to get built
  first.** Deck Builder's layout was reorganized late in the project once it became clear
  "editable stuff" (name, format, commander, card list) and "read-only stuff" (stat charts)
  were interleaved for no real reason — splitting them into two panels made the page easier
  to scan. When a page's controls feel randomly arranged, ask what the user is actually
  trying to *do* in each area and group by that instead of by literal position.
- **Expand an existing surface before adding a new one.** A "View" button that opens a
  modal was chosen over a new nav tab or merging two existing tabs, for a purely additive
  feature — nav real estate is scarce and a tab merge risks breaking two working screens for
  one new feature. Later, two separate charts (a bar chart and a set of proportion bars)
  were combined into one stacked-bar chart rather than kept side by side, once it became
  clear they were really answering one question together, not two questions separately.
  Default to enhancing what exists before reaching for something new.
- **Prefer plain-language summaries over more charts when the goal is understanding, not
  just data.** A "Deck Insights" text panel (land ratio vs. a target, curve shape, color
  lean, one line per fact) reused numbers the charts already computed — it didn't need new
  data, just a sentence wrapped around what was already there. Keep it descriptive
  ("here's what your numbers are"), not prescriptive ("this is good/bad") — the app usually
  doesn't have enough context to actually judge a user's choices, only to report them.
- **A chart with no caption is not self-explanatory to a first-time viewer**, even if the
  axes seem obvious to whoever built it. A one-line caption plus an explicit axis label
  turned "a row of blue bars" into something legible without the user having to ask what
  it meant.
- **Icons over spelled-out text where the icon is unambiguous and matches an existing
  domain convention** (mana symbols instead of "White"/"Blue"/etc.) — but watch for
  external assets designed for a different context. Scryfall's set/mana icons are plain
  black line art meant to be recolored by whoever embeds them; loaded as a plain `<img>`
  there's no CSS hook into the SVG's own fill, so on a dark theme they're invisible until
  you apply `filter: invert(1)`. Check any third-party icon asset against your actual
  background before assuming it'll just work.
- **Visual weight should match across elements that are meant to read as one cohesive
  view.** Two adjacent charts with very different bar thicknesses (one chunky, one
  hairline) read as unrelated even if the colors matched — normalizing thickness made them
  read as one dashboard.
- **Interactive elements need real chrome.** A remove/delete button styled as bare colored
  text is easy to mistake for a label. Border, background, and a hover state make "this is
  clickable" obvious without needing a tooltip to explain it — this matters most for
  destructive actions, where a user needs to *recognize* the control fast.
- **Persistent labels beat placeholder-only fields**, once a field holds a real value. A
  placeholder disappears the moment you start typing, so a name field with only a
  placeholder loses its label at the exact moment you're editing it. A small visible label
  above the field (same treatment as a proper form field) fixes this cheaply.
- **Centralize spacing rules in one shared class instead of tweaking each instance.** A
  missing margin between a bordered box and whatever followed it existed identically on
  four different tabs; fixing it once on the shared class fixed all four at once, and any
  future tab using the same class inherits the fix for free.

## 2. How this user likes to work

- **Feedback frequently arrives as screenshots with hand-drawn annotations** — circles,
  arrows, colored brackets pointing at specific regions. Read them carefully: a single
  screenshot often carries several distinct, unrelated asks (e.g. one color circling a
  visual bug, another circling a totally separate question). Address each annotated
  region as its own item, and it helps to structure the reply the same way the message was
  structured (mirror "red - ...", "yellow - ..." style groupings back).
- **For any change with real design tradeoffs, discuss before building.** Questions phrased
  as "does this make sense?", "is this a bad idea?", or "how about X?" are invitations for
  a recommendation and the honest tradeoff — not a request to just build the first
  reasonable-sounding option. Give a clear opinion, not an exhaustive menu. Once the
  direction is confirmed, build it fully rather than re-litigating. Smaller, unambiguous
  fixes (a bug, a spacing nit, a rename) don't need this pause — just do them.
- **"Done" means verified in the actual running app, not "should work."** The standing
  discipline this project used: reproduce the *exact* reported scenario (not a similar
  one), mock any external dependency that can't run in this environment (network fetches,
  `navigator.share`, etc.) the same way real data would look, and run a full sweep of every
  page/tab checking for console errors before calling anything shipped. When a visual
  screenshot tool isn't reliable in a given environment, computed-style and DOM-state
  assertions are a legitimate substitute — but the verification step itself is not
  optional.
- **Own mistakes plainly and move on.** When an approach didn't pan out (e.g., a CSS fix
  that solved one problem but caused a new overflow bug), a direct "this caused X, here's
  the actual fix" lands better than over-apologizing or glossing over what happened.
- **Cares about project/session hygiene.** One project, one folder, one Claude Code
  session — deliberately, not incidentally. Expect this user to proactively flag it if a
  session starts drifting into another project's territory, and expect them to want that
  same boundary respected for the *next* app too. Don't assume context from a different
  project carries over just because the same person is asking.
- **Iterates in small, concrete rounds rather than big upfront specs.** The rhythm that
  worked: screenshot or short prompt → itemized fixes → verify → ship (commit + push) →
  repeat. Comfortable with an app that evolves through many small, real course corrections
  instead of one large design document decided up front.
- **Expects commits after essentially every meaningful change**, pushed promptly, each with
  a message explaining *why* the change happened (root cause of a bug, reasoning behind a
  UI decision) rather than just restating the diff. A version-string bump alongside each
  push (see the sync-architecture doc's versioning section) was standing convention here.
- **Reasons about UI changes in clear, specific terms** ("these are edit options, those are
  data views") — matching that same level of concrete reasoning back in explanations (not
  vaguer design-speak) landed well.
- **Values a living project-notes doc a future session can read cold** — this project kept
  one (`PROJECT-NOTES.md`, same folder) updated after nearly every shipped change
  specifically so a fresh session wouldn't have to re-derive context from chat history.
  Worth setting up the same thing on day one of the next project, not after the fact.
- **Wants adjacent bugs flagged/fixed when found, but not unrequested scope creep.** A real
  regression noticed while working on something else was worth fixing immediately and
  explaining; a tangential feature idea that came up in passing was worth noting as a
  possibility, not building unprompted.
- **Recognizes and states natural stopping points** ("I think we're done for tonight") —
  match that rather than continuing to manufacture more work once the user has signaled
  they're satisfied.

## 3. Suggested first steps for the Music Theory App

- Set this doc and `SYNC-ARCHITECTURE-HANDOFF.md` (or copies of them) somewhere the new
  session can read at the very start — a `docs/` folder in the new repo works well, same
  as here.
- Create a `PROJECT-NOTES.md` in the new project from day one (see this repo's for the
  shape), even before there's much to put in it — cheaper to keep updated from the start
  than to backfill later.
- Apply the starting checklist at the end of `SYNC-ARCHITECTURE-HANDOFF.md` if the new app
  needs any kind of cross-device sync or local persistence.
- Otherwise, no need to force-fit MTG-specific decisions (the tab layout, the specific
  chart types, etc.) — the point of this doc is the *reasoning*, not the literal design.
