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

  // Matches by name, not exact printing id - copy limits (max 4, singleton's max 1) are
  // rules about a card NAME in real Magic, not a specific printing. Owning two different
  // printings of the same card doesn't grant two separate slots for it.
  function findEntryByName(name) {
    for (var i = 0; i < deck.cards.length; i++) {
      if (deck.cards[i].card.name === name) return deck.cards[i];
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
      // By name, not id - a different printing of the same card is still the same card
      // for deck-building purposes; singleton rules don't grant a second slot for it.
      if (card.name === deck.commander.name) {
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
      if (!findEntryByName(card.name) && deckTotalQty() >= cap) {
        showAddFeedback(format.name + " decks hold " + cap + " cards" + (reserved ? " plus your Commander" : "") + ".");
        return;
      }
    }

    var entry = findEntryByName(card.name);
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

  // The rendered list's remove button hands back the specific printing shown in that row,
  // not a name - each entry still has exactly one underlying card.id (there's only ever
  // one entry per name now), so an id lookup is still a valid, simpler way to find it
  // than re-deriving the name and calling findEntryByName.
  function findEntryById(cardId) {
    for (var i = 0; i < deck.cards.length; i++) {
      if (deck.cards[i].card.id === cardId) return deck.cards[i];
    }
    return null;
  }

  function removeOne(cardId) {
    var entry = findEntryById(cardId);
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
    // Reachable if a card was added to the 99 under a different format (or a different
    // owned printing) before being chosen as Commander here - singleton rules only allow
    // one copy of this name total, so it can't be both.
    var existing = findEntryByName(card.name);
    if (existing) {
      showAddFeedback(card.name + " is already in your deck list - remove it before setting it as Commander.");
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
        // Catches decks saved before the Commander/pool-exclusion checks above matched by
        // name instead of exact printing id - a deck built under the old logic could have
        // ended up with the Commander also present as a "99th" card via a different owned
        // printing of the same name, which singleton rules don't actually allow.
        var commanderDupe = deck.cards.filter(function (e) { return e.card.name === deck.commander.name; });
        if (commanderDupe.length) {
          messages.push(deck.commander.name + " is both your Commander and in the deck list - singleton decks only allow one copy total, remove the extra with the list's − button.");
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
      els.poolGrid.innerHTML = '<p class="empty-hint">No owned cards yet — check some off in the Search tab first.</p>';
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
        // The Commander itself lives in deck.commander, not deck.cards - keep it (by
        // name, not just this exact printing - a different owned printing of the same
        // card is still the same card) out of the "Add to deck" pool so it can't also be
        // added as one of the 99/59.
        visible = visible.filter(function (c) { return c.name !== deck.commander.name && Formats.colorIdentityOk(c, deck.commander); });
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

  // Reads the name straight from the input rather than deck.name, which only gets synced
  // on Save - this needs to reflect what's actually typed, including before a first save.
  function renderListSummary() {
    var name = els.nameInput.value.trim() || "Untitled deck";
    var qty = deckTotalQty();
    els.listSummary.textContent = name + " · " + currentFormat().name + " · " + qty + (qty === 1 ? " card" : " cards");
  }

  function renderDeck() {
    renderListSummary();
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
    var format = currentFormat();
    var totalCards = 0;
    var curve = [0, 0, 0, 0, 0, 0, 0]; // index 6 = "7+"
    var curveNames = [[], [], [], [], [], [], []]; // parallel to curve, for the hover tooltip
    // Per-bucket color breakdown for the stacked chart. Each card contributes to exactly
    // one category (mono color, "M" for multicolor, or "C" for colorless) so a bucket's
    // segments always sum to that bucket's own total - unlike colorCounts below, which
    // deliberately double-counts a multicolor card toward each of its colors (the right
    // math for "which colors does this deck lean on," a different question than "what's
    // this bucket made of").
    var curveColorCounts = [{}, {}, {}, {}, {}, {}, {}];
    var colorTotals = {};
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
        var idx = bucket === 7 ? 6 : bucket;
        curve[idx] += qty;
        curveNames[idx].push(qty > 1 ? card.name + " ×" + qty : card.name);
        cmcSum += card.cmc * qty;
        cmcCards += qty;

        var cardColors = card.colors && card.colors.length ? card.colors : null;
        var cat = !cardColors ? "C" : (cardColors.length === 1 ? cardColors[0] : "M");
        curveColorCounts[idx][cat] = (curveColorCounts[idx][cat] || 0) + qty;
        colorTotals[cat] = (colorTotals[cat] || 0) + qty;
      }

      if (card.colors && card.colors.length) {
        card.colors.forEach(function (c) { colorCounts[c] = (colorCounts[c] || 0) + qty; });
      } else {
        colorCounts.C += qty;
      }
    });

    var avgCmc = cmcCards ? (cmcSum / cmcCards).toFixed(2) : "0.00";
    var maxCurve = Math.max.apply(null, curve.concat([1]));

    var colorMeta = {
      W: { label: "White", swatch: "var(--white)" },
      U: { label: "Blue", swatch: "var(--blue)" },
      B: { label: "Black", swatch: "var(--black)" },
      R: { label: "Red", swatch: "var(--red)" },
      G: { label: "Green", swatch: "var(--green)" },
      M: { label: "Multicolor", swatch: "var(--gold)" },
      C: { label: "Colorless", swatch: "var(--text-dim)" },
    };
    var curveColorOrder = ["W", "U", "B", "R", "G", "M", "C"];

    // Combines what used to be two separate charts (Mana Curve, Color Balance) into one:
    // each bar's height is still the card count at that mana value (same as before), but
    // now split into colored segments so you can see which colors show up at which cost,
    // not just totals for each in isolation. A bucket's title attribute still lists the
    // actual cards in it; the legend below turns segment color back into a name/count.
    var curveHtml = '<div class="stat-section stat-section-grow"><div class="stat-label"><span>Mana Curve by Color</span><span>avg CMC ' + avgCmc + '</span></div>' +
      '<p class="stat-caption">Non-land cards by mana cost, split by color - a curve that leans left plays more consistently early; segment colors show which colors show up at which cost.</p>' +
      '<div class="curve-bars">' +
      curve.map(function (count, i) {
        var pct = Math.round((count / maxCurve) * 100);
        var share = cmcCards ? Math.round((count / cmcCards) * 100) : 0;
        var names = curveNames[i].length ? curveNames[i].join(", ") : "No cards at this cost";
        var bucketColors = curveColorCounts[i];
        var segments = curveColorOrder.filter(function (k) { return bucketColors[k]; }).map(function (k) {
          return '<div class="curve-bar-segment" style="flex:' + bucketColors[k] + ' 0 0;background:' + colorMeta[k].swatch + '" title="' + colorMeta[k].label + ': ' + bucketColors[k] + '"></div>';
        }).join("");
        return '<div class="curve-bar-wrap" title="' + CardView.escapeHtml(names) + '"><span class="curve-bar-count">' + (count ? count + (cmcCards ? ' · ' + share + '%' : '') : "") + '</span><div class="curve-bar-stack" style="height:' + pct + '%">' + segments + '</div><span class="curve-bar-label">' + (i === 6 ? "7+" : i) + '</span></div>';
      }).join("") + '</div><div class="curve-axis-title">Mana Value</div>' +
      '<div class="curve-color-legend">' + curveColorOrder.map(function (k) {
        var icon = k === "M"
          ? '<span class="legend-multi-dot"></span>'
          : '<img class="mana-pip-icon" src="https://svgs.scryfall.io/card-symbols/' + k + '.svg" alt="' + colorMeta[k].label + '">';
        return '<div class="curve-legend-item" title="' + colorMeta[k].label + '">' + icon + '<span class="curve-legend-count">' + (colorTotals[k] || 0) + '</span></div>';
      }).join("") + '</div></div>';

    var typeHtml = '<div class="stat-section"><div class="stat-label"><span>Types</span><span class="deck-total-cards">' + totalCards + ' cards total</span></div><div class="type-breakdown">' +
      Object.keys(typeCounts).sort(function (a, b) { return typeCounts[b] - typeCounts[a]; }).map(function (t) {
        return '<span class="type-chip">' + CardView.escapeHtml(t) + ' ×' + typeCounts[t] + '</span>';
      }).join("") + '</div></div>';

    // Plain-language readout of the numbers already computed above, rather than another
    // chart - land ratio against a format-appropriate target, how much of the deck acts
    // early, and which colors it actually leans on. Deliberately factual/descriptive, not
    // prescriptive - "here's what your numbers are" rather than a pass/fail verdict on a
    // strategy this app has no way to actually judge.
    var insightLines = [];
    if (totalCards > 0) {
      var landCount = typeCounts["Land"] || 0;
      var landPct = Math.round((landCount / totalCards) * 100);
      var landTarget = format.needsCommander ? "38-40%" : (format.deckSize && format.deckSize.min ? "25-30%" : null);
      insightLines.push(landCount + " lands - " + landPct + "% of the deck" + (landTarget ? " (most " + format.name + " decks run around " + landTarget + ")" : "") + ".");

      if (cmcCards > 0) {
        var cmcNum = parseFloat(avgCmc);
        var curveShape = cmcNum < 2.5 ? "low - a fast, aggressive curve"
          : cmcNum <= 4 ? "a fairly average curve"
          : "on the higher side - expect to lean on ramp or extra mana to hit it on time";
        insightLines.push("Average mana value " + avgCmc + " - " + curveShape + ".");

        var earlyPlays = curve[0] + curve[1] + curve[2];
        var earlyPct = Math.round((earlyPlays / cmcCards) * 100);
        insightLines.push(earlyPlays + " of " + cmcCards + " non-land cards (" + earlyPct + "%) cost 2 or less mana.");
      }

      var creatureCount = typeCounts["Creature"] || 0;
      var otherSpellCount = totalCards - landCount - creatureCount;
      if (creatureCount + otherSpellCount > 0) {
        var creatureShare = creatureCount / (creatureCount + otherSpellCount);
        var creatureNote = creatureShare >= 0.6 ? " - creature-heavy" : creatureShare <= 0.3 ? " - spell-heavy" : "";
        insightLines.push(creatureCount + " creatures, " + otherSpellCount + " other non-land cards" + creatureNote + ".");
      }

      var activeColors = Object.keys(colorMeta).filter(function (k) { return k !== "C" && colorCounts[k] > 0; })
        .sort(function (a, b) { return colorCounts[b] - colorCounts[a]; });
      if (activeColors.length >= 2) {
        insightLines.push("Leans on " + activeColors.slice(0, 2).map(function (k) { return colorMeta[k].label; }).join(" and ") + " - make sure the manabase supports both well.");
      } else if (activeColors.length === 1) {
        insightLines.push("Mono-" + colorMeta[activeColors[0]].label.toLowerCase() + " - no color-fixing to worry about.");
      }
    }
    // Short, factual rule reminder tied to this format's actual copy limit - the same
    // Formats.maxCopies() ceiling addCard() already enforces, not a separate hardcoded
    // claim. Skipped for formats with no meaningful universal limit (Free, Speed Magic -
    // the latter already has its own 5-land/5-other line in the status banner above).
    if (format.maxCopies === 1) {
      insightLines.push("Singleton format - max 1 copy of any card except basic lands.");
    } else if (format.maxCopies === 4) {
      insightLines.push("Max 4 copies of any card except basic lands.");
    }
    var insightsHtml = '<div class="stat-section stat-section-grow stat-section-center"><div class="stat-label"><span>Deck Insights</span></div>' +
      (insightLines.length
        ? '<ul class="deck-insights-list">' + insightLines.map(function (l) { return "<li>" + CardView.escapeHtml(l) + "</li>"; }).join("") + "</ul>"
        : '<p class="empty-hint">Add cards to see insights about this deck.</p>') +
      "</div>";

    // Mana Curve by Color leads (it now carries what the standalone Color Balance section
    // used to show too), then Types, then Insights.
    els.stats.innerHTML = curveHtml + typeHtml + insightsHtml;
  }

  // ---- Deck lifecycle ----

  function newDeck() {
    if (deck.cards.length && !window.confirm("Discard the current unsaved deck and start a new one?")) return;
    deck = freshDeck();
    els.nameInput.value = "";
    els.formatSelect.value = deck.format;
    renderAll();
  }

  function viewDeck() {
    DeckView.show(deck, { title: deck.name || "Untitled deck", formatName: currentFormat().name });
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
    els.listSummary = document.getElementById("deck-list-summary");
    els.newBtn = document.getElementById("btn-new-deck");
    els.viewBtn = document.getElementById("btn-view-deck");
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
    els.nameInput.addEventListener("input", renderListSummary);

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES, state.selectedTypes, renderPool);
    CardFilters.renderToggleGroup(els.colorFilters, CardFilters.COLORS, state.selectedColors, renderPool);
    CardFilters.renderToggleGroup(els.rarityFilters, CardFilters.RARITIES, state.selectedRarities, renderPool);
    CardFilters.wireSortCycle(els.sort, function (value) { state.sort = value; renderPool(); });

    els.poolFilter.addEventListener("input", renderPool);
    CardView.attachClearButton(els.poolFilter, document.getElementById("deck-pool-filter-clear"));
    els.newBtn.addEventListener("click", newDeck);
    els.viewBtn.addEventListener("click", viewDeck);
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
