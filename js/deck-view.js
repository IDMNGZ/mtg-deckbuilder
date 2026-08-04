// Visual deck view: a modal showing every card in a deck as an image grid grouped by
// type, instead of the compact name-only list used while actively building. Shared by
// My Decks (view a saved deck) and Deck Builder (view the deck currently being built) -
// both hand it the same { commander, cards: [{ card, qty }] } shape, so one renderer
// works for either.
var DeckView = (function () {
  "use strict";

  var els = {};

  // Lands last regardless of what's between them and the rest - the composition players
  // care about seeing "as a shape" comes before a wall of basic lands.
  var TYPE_ORDER = ["Creature", "Planeswalker", "Instant", "Sorcery", "Artifact", "Enchantment", "Battle"];

  function typeRank(type) {
    if (type === "Land") return TYPE_ORDER.length + 1;
    var idx = TYPE_ORDER.indexOf(type);
    return idx === -1 ? TYPE_ORDER.length : idx;
  }

  function pluralType(type) {
    if (type === "Sorcery") return "Sorceries";
    return type + "s";
  }

  function groupByType(entries) {
    var groups = {};
    entries.forEach(function (entry) {
      var type = CardView.mainType(entry.card);
      (groups[type] = groups[type] || []).push(entry);
    });
    return Object.keys(groups).sort(function (a, b) { return typeRank(a) - typeRank(b); }).map(function (type) {
      var group = groups[type].slice().sort(function (a, b) { return a.card.name.localeCompare(b.card.name); });
      var count = group.reduce(function (sum, e) { return sum + e.qty; }, 0);
      return { type: type, entries: group, count: count };
    });
  }

  function renderGroup(label, entries, count) {
    var section = document.createElement("div");
    section.className = "deck-view-group";
    section.innerHTML = '<h3 class="deck-view-group-header">' + CardView.escapeHtml(label) + ' <span>(' + count + ')</span></h3>';
    var grid = document.createElement("div");
    grid.className = "card-grid";
    entries.forEach(function (entry) {
      grid.appendChild(CardView.renderTile(entry.card, { qty: entry.qty > 1 ? entry.qty : null }));
    });
    section.appendChild(grid);
    return section;
  }

  function show(deckLike, opts) {
    opts = opts || {};
    els.header.innerHTML =
      '<h2>' + CardView.escapeHtml(opts.title || deckLike.name || "Deck") + '</h2>' +
      (opts.formatName ? '<span class="deck-view-format">' + CardView.escapeHtml(opts.formatName) + '</span>' : '');

    els.body.innerHTML = "";
    if (deckLike.commander) {
      els.body.appendChild(renderGroup("Commander", [{ card: deckLike.commander, qty: 1 }], 1));
    }
    var cards = deckLike.cards || [];
    if (cards.length === 0) {
      els.body.insertAdjacentHTML("beforeend", '<p class="empty-hint">No cards in this deck yet.</p>');
    } else {
      groupByType(cards).forEach(function (group) {
        els.body.appendChild(renderGroup(pluralType(group.type), group.entries, group.count));
      });
    }

    els.modal.classList.remove("hidden");
  }

  function close() {
    els.modal.classList.add("hidden");
  }

  function init() {
    els.modal = document.getElementById("deck-view-modal");
    els.header = document.getElementById("deck-view-header");
    els.body = document.getElementById("deck-view-body");
    document.getElementById("deck-view-close").addEventListener("click", close);
    els.modal.querySelector(".modal-backdrop").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (els.modal.classList.contains("hidden")) return;
      if (e.key === "Escape") close();
    });
  }

  return { init: init, show: show, close: close };
})();
