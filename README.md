# MTG Deck Builder

A personal Magic: The Gathering collection tracker and deck builder. Browse every card by edition, check off what you own, then build decks out of only the cards you actually have — with a live mana curve, color balance, and type breakdown for each deck.

No installation, no build step, no backend. It's a handful of static HTML/CSS/JS files that talk directly to the free [Scryfall API](https://scryfall.com/docs/api) for card data and images, and save everything else to your browser's local storage.

## Running it

Open `index.html` for the landing page, or go straight to `app.html` for the deck builder itself. That's it — there's nothing to install or compile.

If you'd rather serve it over `http://` (some browsers are stricter about local files), any static file server works, e.g. `npx serve` or the VS Code "Live Server" extension.

## Hosting it for friends (GitHub Pages)

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. GitHub will give you a URL like `https://<your-username>.github.io/<repo-name>/`. Share that with friends.

There's no CI and nothing to build — pushing to `main` is enough, GitHub Pages just serves the files as-is.

## How saves work

**Each person's data lives only in their own browser** (`localStorage`), scoped to this site, by default. There's no shared account system or server — if you and a friend both visit the same GitHub Pages URL, you each see and edit only your own collection and decks, independently, with no setup required.

This means, unless you set up syncing (below):
- Clearing your browser's site data for this page will erase your collection/decks.
- Your data doesn't automatically move between your phone and your laptop, or between browsers.

Card data itself (the set list and card details fetched from Scryfall) is cached locally too, so you're not re-downloading it on every visit — there's a "Refresh" button in the Browse tab if Scryfall's data changes and you want the latest.

## Syncing across devices

Click **Sync** in the header. There are two independent options — pick whichever suits you, or neither:

**Manual backup (works immediately, no setup):** use **Export** / **Import** in the header. Export downloads a JSON file of your owned cards and decks; Import reads one back in (merged with whatever's already there). Drop the exported file into a folder synced by iCloud Drive, Dropbox, OneDrive, etc. and you can Import it on another device — it's just a plain file, so it goes wherever you decide to put it.

**Automatic sync via Dropbox (one-time setup, then hands-off):** each person connects their *own* Dropbox account from the Sync panel. Your data is written to a private "App folder" Dropbox creates just for this app — invisible to the rest of your Dropbox and to anyone else using this same site. Every device you connect to the same Dropbox account stays in sync automatically (pushes shortly after you make a change, pulls when you switch back to the tab). This is opt-in per person: friends who don't connect anything just keep using local-only storage as normal.

Dropbox sync needs a one-time setup **by whoever is hosting this site** (not by each user) before the Connect button will work:

1. Go to the [Dropbox App Console](https://www.dropbox.com/developers/apps) and click **Create app**.
2. Choose **Scoped access**, then **App folder** access type (not "Full Dropbox" — App folder keeps this sandboxed to its own folder). Give it any name.
3. On the app's **Permissions** tab, enable `files.content.write` and `files.content.read`, then click Submit.
4. On the **Settings** tab, under **OAuth 2** → **Redirect URIs**, add the exact URL of `app.html` on this site (e.g. `https://<your-username>.github.io/<repo-name>/app.html`) - Dropbox's redirect must exactly match whatever page initiates the connection, which is `app.html`, not the landing page. Add `http://localhost:8090/app.html` too (or whatever local URL you test with) if you want Dropbox sign-in to work while testing locally. You can register multiple redirect URIs on the same app, so add as many as you need.
5. Copy the **App key** from the Settings tab into `js/sync-config.js`:
   ```js
   var SYNC_CONFIG = {
     DROPBOX_APP_KEY: "paste-your-app-key-here",
   };
   ```
6. Commit and push. The Sync panel will now offer "Connect Dropbox" to anyone who visits.

Nothing here needs a paid Dropbox plan or a backend server — the whole flow (including token refresh) runs from the static site itself. The only real limitation: if you edit the same account's data on two devices before either has a chance to sync, the one that syncs last wins (no merge of concurrent edits) — in practice this only matters if you're using two devices at once without ever reopening the tab in between.

## Notes on how ownership and decks work

- Ownership is tracked per **printing** (a specific Scryfall card ID), not per card name — so if you own the same card from two different sets, you check each one separately in its own edition.
- The Deck Builder only lets you add cards you've checked off as owned.
- Deck stats (mana curve, color balance, average CMC) exclude lands from the curve/CMC math, which is standard practice — a land's cost doesn't reflect deck aggression the way a spell's does.
- Basic Lands aren't capped at 4 copies; everything else is.
