// "My Decks" tab: list of saved decks, load into the builder, rename, or delete.
var DecksUI = (function () {
  "use strict";

  var els = {};

  function countCards(deck) {
    return deck.cards.reduce(function (sum, e) { return sum + e.qty; }, 0);
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
      li.innerHTML =
        '<div class="deck-card-name">' + CardView.escapeHtml(deck.name) + '</div>' +
        '<div class="deck-card-meta">' + countCards(deck) + ' cards &middot; updated ' + new Date(deck.updatedAt).toLocaleString() + '</div>';

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
