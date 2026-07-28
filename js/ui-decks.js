// "My Decks" tab: list of saved decks, load into the builder, rename, or delete.
var DecksUI = (function () {
  "use strict";

  var els = {};

  function countCards(deck) {
    return deck.cards.reduce(function (sum, e) { return sum + e.qty; }, 0);
  }

  // Picks the highest-CMC card in the deck as a representative image - a reasonable stand-in
  // for a "deck cover" without asking the user to choose one, since it's usually the
  // splashiest/most memorable card in a given deck.
  function highestCmcCard(deck) {
    if (deck.cards.length === 0) return null;
    return deck.cards.reduce(function (best, entry) {
      return entry.card.cmc > best.card.cmc ? entry : best;
    }, deck.cards[0]).card;
  }

  function render() {
    var decks = Storage.getDecks().slice().sort(function (a, b) { return b.updatedAt.localeCompare(a.updatedAt); });
    els.list.innerHTML = "";

    if (decks.length === 0) {
      els.list.innerHTML = '<li class="empty-hint">No saved decks yet — build one in the Deck Builder tab.</li>';
      return;
    }

    decks.forEach(function (deck) {
      var li = document.createElement("li");
      li.className = "deck-card";
      li.innerHTML = '<div class="deck-card-name">' + CardView.escapeHtml(deck.name) + '</div>';

      var cover = highestCmcCard(deck);
      if (cover && cover.image) {
        var img = document.createElement("img");
        img.className = "deck-card-image";
        img.src = cover.image.normal || cover.image.small;
        img.alt = cover.name;
        img.title = cover.name + " (highest mana cost in this deck)";
        li.appendChild(img);
      }

      var meta = document.createElement("div");
      meta.className = "deck-card-meta";
      meta.textContent = countCards(deck) + " cards · updated " + new Date(deck.updatedAt).toLocaleString();
      li.appendChild(meta);

      var editBtn = document.createElement("button");
      editBtn.className = "btn btn-ghost";
      editBtn.textContent = "Open";
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
      els.list.appendChild(li);
    });
  }

  function init() {
    els.list = document.getElementById("decks-list");
  }

  return { init: init, activate: render };
})();
