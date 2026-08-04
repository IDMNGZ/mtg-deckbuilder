// "My Decks" tab: list of saved decks, load into the builder, rename, or delete.
var DecksUI = (function () {
  "use strict";

  var els = {};

  function countCards(deck) {
    return deck.cards.reduce(function (sum, e) { return sum + e.qty; }, 0);
  }

  // Picks the highest-CMC card in the deck as a representative image - a reasonable stand-in
  // for a "deck cover" without asking the user to choose one, since it's usually the
  // splashiest/most memorable card in a given deck. Filters out any entry with a missing
  // card snapshot (shouldn't happen from normal use, but a single bad entry shouldn't take
  // the cover image - or the rest of this deck's row - down with it).
  function highestCmcCard(deck) {
    var withCards = deck.cards.filter(function (e) { return e && e.card; });
    if (withCards.length === 0) return null;
    return withCards.reduce(function (best, entry) {
      return entry.card.cmc > best.card.cmc ? entry : best;
    }, withCards[0]).card;
  }

  function renderDeckRow(deck) {
    var li = document.createElement("li");
    li.className = "deck-card";

    // The name is what identifies a deck at a glance - it used to share the header row
    // with the format badge, which crowded it into a truncated sliver at narrow widths.
    // Full width of its own here; format moves down to join the rest of the deck's
    // metadata instead.
    var header = document.createElement("div");
    header.className = "deck-card-header";
    header.innerHTML = '<div class="deck-card-name">' + CardView.escapeHtml(deck.name) + '</div>';
    li.appendChild(header);

    // The Commander is the deck's defining card in Commander/Brawl - use it as the cover
    // instead of whichever of the other 99 cards happens to have the highest mana cost.
    var cover = deck.commander || highestCmcCard(deck);
    var coverIsCommander = !!deck.commander;
    if (cover && cover.image) {
      var img = document.createElement("img");
      img.className = "deck-card-image";
      img.src = cover.image.normal || cover.image.small;
      img.alt = cover.name;
      img.title = cover.name + (coverIsCommander ? " (Commander)" : " (highest mana cost in this deck)");
      li.appendChild(img);
    }

    // Format badge leads the info area (its own line, above the card count/date) -
    // "what kind of deck is this" reads before "how big is it" - but still below the
    // image, not competing with the deck name at the very top of the panel.
    var formatName = Formats.get(deck.format || "free").name;
    var badgeRow = document.createElement("div");
    badgeRow.className = "deck-card-format-row";
    badgeRow.innerHTML = '<span class="deck-card-format-badge">' + CardView.escapeHtml(formatName) + '</span>';
    li.appendChild(badgeRow);

    var meta = document.createElement("div");
    meta.className = "deck-card-meta";
    var cardCount = countCards(deck);
    meta.textContent = cardCount + ' card' + (cardCount === 1 ? '' : 's') + ' · updated ' + new Date(deck.updatedAt).toLocaleString();
    li.appendChild(meta);

    var editBtn = document.createElement("button");
    editBtn.className = "btn btn-ghost";
    editBtn.textContent = "Load";
    editBtn.addEventListener("click", function () { DeckBuilderUI.loadDeck(deck.id); });

    var deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", function () {
      if (window.confirm('Delete deck "' + deck.name + '"? This cannot be undone.')) {
        Storage.deleteDeck(deck.id);
        render();
      }
    });

    var actions = document.createElement("div");
    actions.className = "deck-card-actions";
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    li.appendChild(actions);
    return li;
  }

  function render() {
    var decks = Storage.getDecks().slice().sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    els.list.innerHTML = "";

    if (decks.length === 0) {
      els.list.innerHTML = '<li class="empty-hint">No saved decks yet — build one in the Deck Builder tab.</li>';
      return;
    }

    // One bad deck (a corrupted/malformed entry) shouldn't blank out every other saved
    // deck - render each row independently and skip just the ones that fail.
    decks.forEach(function (deck) {
      try {
        els.list.appendChild(renderDeckRow(deck));
      } catch (err) {
        console.error("Skipped a deck that failed to render:", deck && deck.name, err);
      }
    });
  }

  function init() {
    els.list = document.getElementById("decks-list");
  }

  return { init: init, activate: render };
})();
