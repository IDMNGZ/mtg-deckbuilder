// "Deck Builder" tab: build a deck out of owned cards only, with live stats.
var DeckBuilderUI = (function () {
  "use strict";

  var els = {};
  var MAX_COPIES = 4;

  // In-memory working deck. Each entry keeps a denormalized card snapshot so the
  // deck stays intact even if the card is later unchecked in the collection.
  var deck = freshDeck();

  function freshDeck() {
    return { id: null, name: "", cards: [] }; // cards: [{ card, qty }]
  }

  var isLand = CardView.isLand;
  var mainType = CardView.mainType;

  function findEntry(cardId) {
    for (var i = 0; i < deck.cards.length; i++) {
      if (deck.cards[i].card.id === cardId) return deck.cards[i];
    }
    return null;
  }

  function addCard(card) {
    var entry = findEntry(card.id);
    var cap = isLand(card) && /basic/i.test(card.typeLine) ? Infinity : MAX_COPIES;
    if (entry) {
      if (entry.qty >= cap) return;
      entry.qty++;
    } else {
      deck.cards.push({ card: card, qty: 1 });
    }
    renderDeck();
  }

  function removeOne(cardId) {
    var entry = findEntry(cardId);
    if (!entry) return;
    entry.qty--;
    if (entry.qty <= 0) {
      deck.cards = deck.cards.filter(function (e) { return e.card.id !== cardId; });
    }
    renderDeck();
  }

  // ---- Pool (owned cards available to add) ----

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 || card.typeLine.toLowerCase().indexOf(needle) !== -1;
  }

  function renderMergeToggle() {
    els.mergeToggle.classList.toggle("active", Storage.getMergeByName());
  }

  function renderPool() {
    var owned = Storage.getOwnedCards();
    var needle = els.poolFilter.value.trim();
    els.poolGrid.innerHTML = "";
    if (owned.length === 0) {
      els.poolGrid.innerHTML = '<p class="empty-hint">No owned cards yet — check some off in the Browse tab first.</p>';
      return;
    }
    var visible = owned.filter(function (c) { return matchesFilter(c, needle); });
    var frag = document.createDocumentFragment();

    if (Storage.getMergeByName()) {
      // Which specific printing gets added doesn't matter for deck-building - name, cost,
      // colors, and type are the same across reprints, so any one representative works.
      CardView.groupByName(visible).forEach(function (group) {
        frag.appendChild(CardView.renderTile(group.representative, {
          onAdd: function (card) { addCard(card); },
          addLabel: "Add to deck",
        }));
      });
    } else {
      visible.forEach(function (card) {
        frag.appendChild(CardView.renderTile(card, {
          onAdd: function (card) { addCard(card); },
          addLabel: "Add to deck",
        }));
      });
    }
    els.poolGrid.appendChild(frag);
  }

  // ---- Deck list + stats ----

  function renderDeck() {
    els.list.innerHTML = "";
    if (deck.cards.length === 0) {
      els.list.innerHTML = '<li class="empty-hint">No cards in this deck yet.</li>';
    } else {
      deck.cards.slice().sort(function (a, b) { return a.card.name.localeCompare(b.card.name); }).forEach(function (entry) {
        var li = document.createElement("li");
        li.className = "deck-list-item";
        li.innerHTML =
          '<span class="qty">' + entry.qty + '×</span>' +
          '<span class="name">' + CardView.escapeHtml(entry.card.name) + ' <span class="card-mana">' + CardView.escapeHtml(entry.card.manaCost) + '</span></span>' +
          '<button class="remove-btn" title="Remove one copy">&minus;</button>';
        li.querySelector(".remove-btn").addEventListener("click", function () { removeOne(entry.card.id); });
        els.list.appendChild(li);
      });
    }
    renderStats();
  }

  function renderStats() {
    var totalCards = 0;
    var curve = [0, 0, 0, 0, 0, 0, 0]; // index 6 = "7+"
    var colorCounts = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    var typeCounts = {};
    var cmcSum = 0, cmcCards = 0;

    deck.cards.forEach(function (entry) {
      var card = entry.card, qty = entry.qty;
      totalCards += qty;

      var type = mainType(card);
      typeCounts[type] = (typeCounts[type] || 0) + qty;

      if (!isLand(card)) {
        var bucket = Math.min(card.cmc, 7);
        curve[bucket === 7 ? 6 : bucket] += qty;
        cmcSum += card.cmc * qty;
        cmcCards += qty;
      }

      if (card.colors && card.colors.length) {
        card.colors.forEach(function (c) { colorCounts[c] = (colorCounts[c] || 0) + qty; });
      } else {
        colorCounts.C += qty;
      }
    });

    var avgCmc = cmcCards ? (cmcSum / cmcCards).toFixed(2) : "0.00";
    var maxCurve = Math.max.apply(null, curve.concat([1]));
    var maxColor = Math.max.apply(null, Object.keys(colorCounts).map(function (k) { return colorCounts[k]; }).concat([1]));

    var colorMeta = {
      W: { label: "White", swatch: "var(--white)" },
      U: { label: "Blue", swatch: "var(--blue)" },
      B: { label: "Black", swatch: "var(--black)" },
      R: { label: "Red", swatch: "var(--red)" },
      G: { label: "Green", swatch: "var(--green)" },
      C: { label: "Colorless", swatch: "var(--text-dim)" },
    };

    var curveHtml = '<div class="stat-row"><div class="stat-label"><span>Mana Curve</span><span>avg CMC ' + avgCmc + '</span></div><div class="curve-bars">' +
      curve.map(function (count, i) {
        var pct = Math.round((count / maxCurve) * 100);
        return '<div class="curve-bar-wrap"><span class="curve-bar-count">' + (count || "") + '</span><div class="curve-bar" style="height:' + pct + '%"></div><span class="curve-bar-label">' + (i === 6 ? "7+" : i) + '</span></div>';
      }).join("") + '</div></div>';

    var colorHtml = '<div class="stat-row"><div class="stat-label"><span>Color Balance</span></div><div class="color-bars">' +
      Object.keys(colorMeta).map(function (key) {
        var count = colorCounts[key] || 0;
        var pct = Math.round((count / maxColor) * 100);
        return '<div class="color-bar-row"><span class="color-bar-swatch" style="background:' + colorMeta[key].swatch + '"></span>' +
          '<span style="width:60px">' + colorMeta[key].label + '</span>' +
          '<div class="color-bar-track"><div class="color-bar-fill" style="width:' + pct + '%;background:' + colorMeta[key].swatch + '"></div></div>' +
          '<span class="color-bar-count">' + count + '</span></div>';
      }).join("") + '</div></div>';

    var typeHtml = '<div class="stat-row"><div class="stat-label"><span>Types</span><span>' + totalCards + ' cards total</span></div><div class="type-breakdown">' +
      Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; }).map(function (t) {
        return '<span class="type-chip">' + CardView.escapeHtml(t) + ' ×' + typeCounts[t] + '</span>';
      }).join("") + '</div></div>';

    els.stats.innerHTML = curveHtml + colorHtml + typeHtml;
  }

  // ---- Deck lifecycle ----

  function newDeck() {
    if (deck.cards.length && !window.confirm("Discard the current unsaved deck and start a new one?")) return;
    deck = freshDeck();
    els.nameInput.value = "";
    renderDeck();
  }

  function saveDeck() {
    var name = els.nameInput.value.trim();
    if (!name) {
      window.alert("Give your deck a name first.");
      return;
    }
    if (deck.cards.length === 0) {
      window.alert("Add at least one card before saving.");
      return;
    }
    deck.id = deck.id || Storage.makeDeckId();
    deck.name = name;
    Storage.saveDeck(deck);
    if (window.DecksUI) window.DecksUI.activate();
    els.stats.insertAdjacentHTML("afterbegin", '<p class="empty-hint">Saved ' + new Date().toLocaleTimeString() + '</p>');
  }

  function loadDeck(deckId) {
    var stored = Storage.getDeck(deckId);
    if (!stored) return;
    deck = { id: stored.id, name: stored.name, cards: stored.cards.map(function (e) { return { card: e.card, qty: e.qty }; }) };
    els.nameInput.value = deck.name;
    renderDeck();
    location.hash = "#deckbuilder";
  }

  function init() {
    els.poolFilter = document.getElementById("deck-pool-filter");
    els.poolGrid = document.getElementById("deck-pool-grid");
    els.nameInput = document.getElementById("deck-name");
    els.stats = document.getElementById("deck-stats");
    els.list = document.getElementById("deck-list");
    els.newBtn = document.getElementById("btn-new-deck");
    els.saveBtn = document.getElementById("btn-save-deck");
    els.mergeToggle = document.getElementById("btn-merge-toggle-deckbuilder");

    els.poolFilter.addEventListener("input", renderPool);
    els.newBtn.addEventListener("click", newDeck);
    els.saveBtn.addEventListener("click", saveDeck);
    els.mergeToggle.addEventListener("click", function () {
      Storage.setMergeByName(!Storage.getMergeByName());
      renderMergeToggle();
      renderPool();
    });
    // Keep the pool in sync when ownership is toggled from the card modal's version cycler.
    document.addEventListener("mtg:ownership-changed", renderPool);

    renderDeck();
  }

  function activate() {
    renderMergeToggle();
    renderPool();
  }

  return { init: init, activate: activate, loadDeck: loadDeck };
})();
