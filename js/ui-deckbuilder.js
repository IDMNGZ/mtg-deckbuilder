// "Deck Builder" tab: build a deck out of owned cards only, with live stats, under
// whichever format's rules are selected (js/formats.js) - legal card pool, copy limits,
// deck size, and (Commander/Brawl) singleton + color identity.
var DeckBuilderUI = (function () {
  "use strict";

  var els = {};
  var state = { selectedTypes: new Set(), selectedColors: new Set(), selectedRarities: new Set(), sort: "" };

  // In-memory working deck. Each entry keeps a denormalized card snapshot so the
  // deck stays intact even if the card is later unchecked in the collection.
  var deck = freshDeck();

  function freshDeck() {
    return { id: null, name: "", format: "free", commander: null, cards: [] }; // cards: [{ card, qty }]
  }

  var isLand = CardView.isLand;
  var mainType = CardView.mainType;

  function currentFormat() {
    return Formats.get(deck.format);
  }

  function findEntry(cardId) {
    for (var i = 0; i < deck.cards.length; i++) {
      if (deck.cards[i].card.id === cardId) return deck.cards[i];
    }
    return null;
  }

  function showAddFeedback(text) {
    if (!els.addFeedback) return;
    els.addFeedback.textContent = text;
    clearTimeout(showAddFeedback._t);
    showAddFeedback._t = setTimeout(function () { els.addFeedback.textContent = ""; }, 3500);
  }

  // ---- Composition counts (used by Speed Magic's 5-land/5-other rule + the status line) ----

  function deckLandNonlandCounts() {
    var lands = 0, nonlands = 0;
    deck.cards.forEach(function (e) {
      if (isLand(e.card)) lands += e.qty; else nonlands += e.qty;
    });
    return { lands: lands, nonlands: nonlands };
  }

  function deckTotalQty() {
    return deck.cards.reduce(function (sum, e) { return sum + e.qty; }, 0);
  }

  function addCard(card) {
    var format = currentFormat();

    if (format.legalityKey && !Formats.isLegal(card, format)) {
      showAddFeedback(card.name + " isn't legal in " + format.name + ".");
      return;
    }
    if (format.needsCommander && deck.commander) {
      if (card.id === deck.commander.id) {
        showAddFeedback(card.name + " is already your Commander.");
        return;
      }
      if (!Formats.colorIdentityOk(card, deck.commander)) {
        showAddFeedback(card.name + " is outside " + deck.commander.name + "'s color identity.");
        return;
      }
    }
    if (format.speedMagic) {
      // Counts every copy toward the 5/5 split, including repeat copies of a card already
      // in the deck (e.g. a 2nd Forest still counts as a 2nd land) - unlike a per-card
      // copy cap, this is a total-composition rule.
      var counts = deckLandNonlandCounts();
      if (isLand(card) && counts.lands >= 5) {
        showAddFeedback("Speed Magic decks only run 5 lands.");
        return;
      }
      if (!isLand(card) && counts.nonlands >= 5) {
        showAddFeedback("Speed Magic decks only run 5 non-land cards.");
        return;
      }
    }
    if (format.deckSize && format.deckSize.exact) {
      var reserved = format.needsCommander ? 1 : 0;
      var cap = format.deckSize.exact - reserved;
      if (!findEntry(card.id) && deckTotalQty() >= cap) {
        showAddFeedback(format.name + " decks hold " + cap + " cards" + (reserved ? " plus your Commander" : "") + ".");
        return;
      }
    }

    var entry = findEntry(card.id);
    var cap = Formats.maxCopies(card, format);
    if (entry) {
      if (entry.qty >= cap) {
        showAddFeedback(format.singleton ? format.name + " decks are singleton - one copy of " + card.name + "." : "Only " + cap + " copies of " + card.name + " allowed in " + format.name + ".");
        return;
      }
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

  // ---- Commander (Commander/Brawl only) ----

  function setCommander(card) {
    var format = currentFormat();
    if (!Formats.eligibleCommander(card)) {
      showAddFeedback(card.name + " can't be a Commander - needs to be a legendary creature (or explicitly say it can be your commander).");
      return;
    }
    if (format.legalityKey && !Formats.isLegal(card, format)) {
      showAddFeedback(card.name + " isn't legal in " + format.name + ".");
      return;
    }
    deck.commander = card;
    renderAll();
  }

  function clearCommander() {
    deck.commander = null;
    renderAll();
  }

  function renderCommanderPanel() {
    var format = currentFormat();
    if (!format.needsCommander) {
      els.commanderPanel.innerHTML = "";
      els.commanderPanel.classList.add("hidden");
      return;
    }
    els.commanderPanel.classList.remove("hidden");
    if (!deck.commander) {
      els.commanderPanel.innerHTML = '<p class="empty-hint">No Commander chosen yet - pick one from the pool on the left (only eligible legendary creatures are shown).</p>';
      return;
    }
    var card = deck.commander;
    els.commanderPanel.innerHTML = "";
    var row = document.createElement("div");
    row.className = "deck-commander-row";
    if (card.image) {
      var img = document.createElement("img");
      img.className = "deck-commander-thumb";
      img.src = card.image.small || card.image.normal;
      img.alt = card.name;
      row.appendChild(img);
    }
    var info = document.createElement("div");
    info.className = "deck-commander-info";
    info.innerHTML = '<div class="deck-commander-label">Commander</div><div class="deck-commander-name">' + CardView.escapeHtml(card.name) + "</div>";
    row.appendChild(info);
    var changeBtn = document.createElement("button");
    changeBtn.className = "btn btn-ghost";
    changeBtn.textContent = "Change";
    changeBtn.addEventListener("click", clearCommander);
    row.appendChild(changeBtn);
    els.commanderPanel.appendChild(row);
  }

  // ---- Format status / legality banner ----

  function renderStatus() {
    var format = currentFormat();
    var totalQty = deckTotalQty();
    var messages = [];

    if (format.needsCommander) {
      var grandTotal = totalQty + (deck.commander ? 1 : 0);
      if (format.deckSize && format.deckSize.exact) {
        messages.push(grandTotal + " / " + format.deckSize.exact + " cards (including Commander)");
      }
      if (deck.commander) {
        var offIdentity = deck.cards.filter(function (e) { return !Formats.colorIdentityOk(e.card, deck.commander); });
        if (offIdentity.length) {
          messages.push(offIdentity.length + " card(s) outside " + deck.commander.name + "'s color identity: " + offIdentity.map(function (e) { return e.card.name; }).join(", "));
        }
        if (format.legalityKey && !Formats.isLegal(deck.commander, format)) {
          messages.push(deck.commander.name + " isn't legal in " + format.name + ".");
        }
      }
    } else if (format.speedMagic) {
      var counts = deckLandNonlandCounts();
      messages.push(counts.lands + " / 5 lands, " + counts.nonlands + " / 5 other cards");
    } else if (format.deckSize && format.deckSize.min) {
      messages.push(totalQty + " / " + format.deckSize.min + "+ cards required");
    }

    if (format.legalityKey) {
      var illegal = deck.cards.filter(function (e) { return !Formats.isLegal(e.card, format); });
      if (illegal.length) {
        messages.push(illegal.length + " card(s) not legal in " + format.name + ": " + illegal.map(function (e) { return e.card.name; }).join(", "));
      }
    }

    if (format.id === "free") {
      els.statusBanner.innerHTML = "";
      els.statusBanner.classList.add("hidden");
      return;
    }
    els.statusBanner.classList.remove("hidden");
    els.statusBanner.innerHTML = '<div class="deck-format-status-line">' + messages.map(CardView.escapeHtml).join(" &middot; ") + "</div>";
  }

  // ---- Pool (owned cards available to add) ----

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 || card.typeLine.toLowerCase().indexOf(needle) !== -1;
  }

  // Called by the header's global Refresh button (via DataSync.refreshAllSavedCardData)
  // once new Scryfall data for owned/decked cards is in. Patches the currently open
  // deck's in-memory card refs too, not just what's in Storage - it may not have been
  // saved yet, or was loaded before this refresh.
  function applyRefresh(result) {
    deck.cards.forEach(function (entry) {
      if (result.freshMap[entry.card.id]) entry.card = result.freshMap[entry.card.id];
    });
    if (deck.commander && result.freshMap[deck.commander.id]) deck.commander = result.freshMap[deck.commander.id];
    renderDeck();
    renderPool();
  }

  function renderPool() {
    var format = currentFormat();
    var pickingCommander = format.needsCommander && !deck.commander;

    var owned = Storage.getOwnedCards();
    var needle = els.poolFilter.value.trim();
    els.poolGrid.innerHTML = "";
    if (owned.length === 0) {
      els.poolGrid.innerHTML = '<p class="empty-hint">No owned cards yet — check some off in the Browse tab first.</p>';
      els.poolNote.textContent = "";
      return;
    }
    var visible = owned.filter(function (c) {
      return matchesFilter(c, needle) &&
        CardFilters.matchesTypes(c, state.selectedTypes) &&
        CardFilters.matchesColors(c, state.selectedColors) &&
        CardFilters.matchesRarity(c, state.selectedRarities);
    });

    if (pickingCommander) {
      visible = visible.filter(function (c) { return Formats.eligibleCommander(c) && Formats.isLegal(c, format); });
      els.poolNote.textContent = "Showing only cards eligible to be your Commander.";
    } else {
      if (format.legalityKey) visible = visible.filter(function (c) { return Formats.isLegal(c, format); });
      if (format.needsCommander && deck.commander) {
        // The Commander itself lives in deck.commander, not deck.cards - keep it out of
        // the "Add to deck" pool so it can't also be added as one of the 99/59.
        visible = visible.filter(function (c) { return c.id !== deck.commander.id && Formats.colorIdentityOk(c, deck.commander); });
      }
      els.poolNote.textContent = format.id === "free" ? "" : "Showing only cards legal in " + format.name + (format.needsCommander && deck.commander ? " and within " + deck.commander.name + "'s color identity." : ".");
    }

    visible = CardFilters.sortCards(visible, state.sort);
    var frag = document.createDocumentFragment();
    var addLabel = pickingCommander ? "Set as Commander" : "Add to deck";
    var onAdd = pickingCommander ? setCommander : addCard;

    if (Storage.getMergeByName()) {
      // Which specific printing gets added doesn't matter for deck-building - name, cost,
      // colors, and type are the same across reprints, so any one representative works.
      CardView.groupByName(visible).forEach(function (group) {
        frag.appendChild(CardView.renderTile(group.representative, {
          onAdd: onAdd,
          addLabel: addLabel,
        }));
      });
    } else {
      visible.forEach(function (card) {
        frag.appendChild(CardView.renderTile(card, {
          onAdd: onAdd,
          addLabel: addLabel,
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
    renderStatus();
    renderStats();
  }

  function renderAll() {
    renderCommanderPanel();
    renderPool();
    renderDeck();
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

    var typeHtml = '<div class="stat-row"><div class="stat-label"><span>Types</span><span class="deck-total-cards">' + totalCards + ' cards total</span></div><div class="type-breakdown">' +
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
    els.formatSelect.value = deck.format;
    renderAll();
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
    // A saved deck is exactly the kind of change worth backing up right away rather than
    // waiting on the usual few-seconds debounce (see DropboxSync.scheduleAutoPush) - it's a
    // deliberate, often lengthy piece of work, not a rapid-fire ownership toggle. Pushing
    // immediately shrinks the window where a refresh/close could catch it before it's synced.
    if (window.DropboxSync) DropboxSync.push();
    els.stats.insertAdjacentHTML("afterbegin", '<p class="empty-hint">Saved ' + new Date().toLocaleTimeString() + '</p>');
  }

  function loadDeck(deckId) {
    var stored = Storage.getDeck(deckId);
    if (!stored) return;
    deck = {
      id: stored.id,
      name: stored.name,
      format: stored.format || "free",
      commander: stored.commander || null,
      cards: stored.cards.map(function (e) { return { card: e.card, qty: e.qty }; }),
    };
    els.nameInput.value = deck.name;
    els.formatSelect.value = deck.format;
    renderAll();
    location.hash = "#deckbuilder";
  }

  function onFormatChange() {
    var newFormatId = els.formatSelect.value;
    var newFormat = Formats.get(newFormatId);
    deck.format = newFormat.id;
    // A commander only means something in Commander/Brawl - drop it when leaving those
    // (the deck's cards themselves are left alone; renderStatus() will flag anything that
    // no longer fits the new format instead of silently deleting a user's picks).
    if (!newFormat.needsCommander) deck.commander = null;
    renderAll();
  }

  function init() {
    els.poolFilter = document.getElementById("deck-pool-filter");
    els.poolGrid = document.getElementById("deck-pool-grid");
    els.poolNote = document.getElementById("deck-pool-note");
    els.nameInput = document.getElementById("deck-name");
    els.formatSelect = document.getElementById("deck-format-select");
    els.commanderPanel = document.getElementById("deck-commander-panel");
    els.statusBanner = document.getElementById("deck-format-status");
    els.stats = document.getElementById("deck-stats");
    els.list = document.getElementById("deck-list");
    els.newBtn = document.getElementById("btn-new-deck");
    els.saveBtn = document.getElementById("btn-save-deck");
    els.addFeedback = document.getElementById("deck-add-feedback");
    els.typeFilters = document.getElementById("deckbuilder-type-filters");
    els.colorFilters = document.getElementById("deckbuilder-color-filters");
    els.rarityFilters = document.getElementById("deckbuilder-rarity-filters");
    els.sort = document.getElementById("deckbuilder-sort");

    els.formatSelect.innerHTML = Formats.LIST.map(function (f) {
      return '<option value="' + f.id + '">' + CardView.escapeHtml(f.name) + "</option>";
    }).join("");
    els.formatSelect.value = deck.format;
    els.formatSelect.addEventListener("change", onFormatChange);

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES, state.selectedTypes, renderPool);
    CardFilters.renderToggleGroup(els.colorFilters, CardFilters.COLORS, state.selectedColors, renderPool);
    CardFilters.renderToggleGroup(els.rarityFilters, CardFilters.RARITIES, state.selectedRarities, renderPool);
    CardFilters.wireSortCycle(els.sort, function (value) { state.sort = value; renderPool(); });

    els.poolFilter.addEventListener("input", renderPool);
    CardView.attachClearButton(els.poolFilter, document.getElementById("deck-pool-filter-clear"));
    els.newBtn.addEventListener("click", newDeck);
    els.saveBtn.addEventListener("click", saveDeck);
    // Keep the pool in sync when ownership is toggled from the card modal's version cycler,
    // or when the shared Merge Dupes toggle in the header changes.
    document.addEventListener("mtg:ownership-changed", renderPool);
    document.addEventListener("mtg:merge-changed", renderPool);

    renderAll();
  }

  function activate() {
    renderPool();
  }

  return { init: init, activate: activate, loadDeck: loadDeck, refresh: applyRefresh };
})();
