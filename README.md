# MTG Deck Builder

A personal Magic: The Gathering collection tracker and deck builder. Browse every card by edition, check off what you own, then build decks out of only the cards you actually have — with a live mana curve, color balance, and type breakdown for each deck.

No installation, no build step, no backend. It's a handful of static HTML/CSS/JS files that talk directly to the free [Scryfall API](https://scryfall.com/docs/api) for card data and images, and save everything else to your browser's local storage.

## Running it

Just open `index.html` in a browser. That's it — there's nothing to install or compile.

If you'd rather serve it over `http://` (some browsers are stricter about local files), any static file server works, e.g. `npx serve` or the VS Code "Live Server" extension.

## Hosting it for friends (GitHub Pages)

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. GitHub will give you a URL like `https://<your-username>.github.io/<repo-name>/`. Share that with friends.

There's no CI and nothing to build — pushing to `main` is enough, GitHub Pages just serves the files as-is.

## How saves work

**Each person's data lives only in their own browser** (`localStorage`), scoped to this site. There's no shared account system or server — if you and a friend both visit the same GitHub Pages URL, you each see and edit only your own collection and decks, independently, with no setup required.

This means:
- Clearing your browser's site data for this page will erase your collection/decks.
- Your data doesn't automatically sync between your phone and your laptop, or between browsers.
- To back up or move your data, use the **Export** / **Import** buttons in the header — Export downloads a JSON file of your owned cards and decks; Import reads one back in (merging with whatever's already there).

Card data itself (the set list and card details fetched from Scryfall) is cached locally too, so you're not re-downloading it on every visit — there's a "Refresh" button in the Browse tab if Scryfall's data changes and you want the latest.

## Notes on how ownership and decks work

- Ownership is tracked per **printing** (a specific Scryfall card ID), not per card name — so if you own the same card from two different sets, you check each one separately in its own edition.
- The Deck Builder only lets you add cards you've checked off as owned.
- Deck stats (mana curve, color balance, average CMC) exclude lands from the curve/CMC math, which is standard practice — a land's cost doesn't reflect deck aggression the way a spell's does.
- Basic Lands aren't capped at 4 copies; everything else is.
