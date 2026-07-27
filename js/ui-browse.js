// "Browse" tab: search/select one or more editions and list every printed card in them,
// combined into a single grid, each with an ownership checkbox.
var BrowseUI = (function () {
  "use strict";

  var MAX_CHECKLIST_ROWS = 80;
  var GLOBAL_SEARCH_DEBOUNCE_MS = 350;
  var GLOBAL_SEARCH_MIN_CHARS = 2;

  var els = {};
  var state = {
    allSets: [],
    selectedCodes: new Set(),
    cardsBySet: {}, // code -> cards[] once loaded
    pendingLoads: 0,
    selectedTypes: new Set(), selectedColors: new Set(), selectedRarities: new Set(),
    sort: "",
    // Global "search any card by name" mode: null = inactive (browse by selected editions).
    globalResults: null,
    globalHasMore: false,
    globalSearchSeq: 0,
  };
  var globalSearchTimer = null;

  function setBySelectionOrder() {
    // Set preserves insertion order in JS, so chips/status read in the order picked.
    return Array.from(state.selectedCodes);
  }

  function findSet(code) {
    return state.allSets.find(function (s) { return s.code === code; });
  }

  function updateStatus() {
    if (state.globalResults !== null) {
      var moreNote = state.globalHasMore ? " (showing first " + state.globalResults.length + ")" : "";
      els.status.textContent = state.globalResults.length + " match" + (state.globalResults.length === 1 ? "" : "es") + " across all editions" + moreNote;
      return;
    }
    var loadedCounts = setBySelectionOrder().map(function (code) { return (state.cardsBySet[code] || []).length; });
    var total = loadedCounts.reduce(function (a, b) { return a + b; }, 0);
    var editionCount = state.selectedCodes.size;
    var loadingNote = state.pendingLoads > 0 ? " (loading " + state.pendingLoads + " more…)" : "";
    if (editionCount === 0) {
      els.status.textContent = "";
    } else {
      els.status.textContent = total + " cards from " + editionCount + " edition" + (editionCount === 1 ? "" : "s") + loadingNote;
    }
  }

  // ---- Global "search any card by name, regardless of edition" ----

  function performGlobalSearch(query) {
    var seq = ++state.globalSearchSeq;
    query = (query || "").trim();
    if (query.length < GLOBAL_SEARCH_MIN_CHARS) {
      state.globalResults = null;
      state.globalHasMore = false;
      renderGrid();
      return;
    }
    els.status.textContent = "Searching “" + query + "” across all editions…";
    Scryfall.searchCardsByName(query).then(function (result) {
      if (seq !== state.globalSearchSeq) return; // superseded by a newer search
      state.globalResults = result.cards;
      state.globalHasMore = result.hasMore;
      renderGrid();
    }).catch(function (err) {
      if (seq !== state.globalSearchSeq) return;
      state.globalResults = [];
      state.globalHasMore = false;
      els.status.textContent = "Search failed: " + err.message;
    });
  }

  function ensureSetLoaded(code, forceRefresh) {
    if (!forceRefresh && state.cardsBySet[code]) return Promise.resolve(state.cardsBySet[code]);
    state.pendingLoads++;
    updateStatus();
    return Scryfall.fetchCardsForSet(code, forceRefresh).then(function (cards) {
      state.cardsBySet[code] = cards;
      state.pendingLoads--;
      updateStatus();
      return cards;
    }).catch(function (err) {
      state.pendingLoads--;
      updateStatus();
      throw err;
    });
  }

  function persistSelection() {
    Storage.setSelectedBrowseSets(setBySelectionOrder());
  }

  // ---- Edition search + checklist (multi-select) ----

  function matchingSets(needle) {
    if (!needle) return [];
    needle = needle.toLowerCase();
    return state.allSets.filter(function (s) {
      return s.name.toLowerCase().indexOf(needle) !== -1 || s.code.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function renderChecklist() {
    var needle = els.editionSearch.value.trim();
    var matches = matchingSets(needle);
    var shown = matches.slice(0, MAX_CHECKLIST_ROWS);

    els.editionMatchCount.textContent = needle
      ? (matches.length > shown.length ? "Showing " + shown.length + " of " + matches.length + " matches" : matches.length + " match" + (matches.length === 1 ? "" : "es"))
      : "Type to search editions";

    els.editionRows.innerHTML = "";
    var frag = document.createDocumentFragment();
    shown.forEach(function (s) {
      var row = document.createElement("label");
      row.className = "edition-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedCodes.has(s.code);
      cb.addEventListener("change", function () { toggleEdition(s.code); });
      var year = s.releasedAt ? s.releasedAt.slice(0, 4) : "?";
      var tag = s.digital ? " [digital]" : "";
      row.appendChild(cb);
      row.appendChild(document.createTextNode(s.name + " (" + year + ")" + tag));
      frag.appendChild(row);
    });
    els.editionRows.appendChild(frag);
  }

  function showChecklist() { els.checklist.classList.remove("hidden"); }
  function hideChecklist() { els.checklist.classList.add("hidden"); }

  function renderChips() {
    els.chips.innerHTML = "";
    var frag = document.createDocumentFragment();
    setBySelectionOrder().forEach(function (code) {
      var s = findSet(code);
      var chip = document.createElement("span");
      chip.className = "edition-chip";
      var year = s && s.releasedAt ? s.releasedAt.slice(0, 4) : "?";
      var label = document.createElement("span");
      label.textContent = (s ? s.name : code) + " (" + year + ")";
      var removeBtn = document.createElement("button");
      removeBtn.className = "edition-chip-remove";
      removeBtn.type = "button";
      removeBtn.title = "Remove this edition";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", function () { toggleEdition(code); });
      chip.appendChild(label);
      chip.appendChild(removeBtn);
      frag.appendChild(chip);
    });
    els.chips.appendChild(frag);
  }

  function toggleEdition(code) {
    if (state.selectedCodes.has(code)) {
      state.selectedCodes.delete(code);
      persistSelection();
      renderChips();
      renderChecklist();
      renderGrid();
    } else {
      state.selectedCodes.add(code);
      persistSelection();
      renderChips();
      renderChecklist();
      renderGrid(); // render immediately (grid just won't include this set's cards until loaded)
      ensureSetLoaded(code).then(renderGrid);
    }
  }

  function selectAllMatching() {
    var needle = els.editionSearch.value.trim();
    var matches = matchingSets(needle);
    if (matches.length === 0) return;
    var toLoad = [];
    matches.forEach(function (s) {
      if (!state.selectedCodes.has(s.code)) {
        state.selectedCodes.add(s.code);
        toLoad.push(s.code);
      }
    });
    persistSelection();
    renderChips();
    renderChecklist();
    renderGrid();
    Promise.all(toLoad.map(function (code) { return ensureSetLoaded(code); })).then(renderGrid);
  }

  function clearEditions() {
    state.selectedCodes.clear();
    persistSelection();
    renderChips();
    renderChecklist();
    renderGrid();
  }

  // ---- Combined card grid ----

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 ||
      card.typeLine.toLowerCase().indexOf(needle) !== -1;
  }

  function renderGrid() {
    var needle = els.filter.value.trim();
    var pool;
    if (state.globalResults !== null) {
      pool = state.globalResults;
    } else {
      pool = [];
      setBySelectionOrder().forEach(function (code) {
        pool = pool.concat(state.cardsBySet[code] || []);
      });
    }

    var visible = pool.filter(function (c) {
      return matchesFilter(c, needle) &&
        CardFilters.matchesTypes(c, state.selectedTypes) &&
        CardFilters.matchesColors(c, state.selectedColors) &&
        CardFilters.matchesRarity(c, state.selectedRarities);
    });
    visible = CardFilters.sortCards(visible, state.sort);

    els.grid.innerHTML = "";
    if (state.globalResults !== null) {
      if (visible.length === 0) {
        els.grid.innerHTML = '<p class="empty-hint">No cards found. Try a different spelling or a shorter search.</p>';
      } else {
        renderTiles(visible);
      }
    } else if (state.selectedCodes.size === 0) {
      els.grid.innerHTML = '<p class="empty-hint">Search and select one or more editions above to browse their cards, or search any card by name (any edition) instead.</p>';
    } else {
      renderTiles(visible);
    }
    updateStatus();
  }

  function renderTiles(cards) {
    var frag = document.createDocumentFragment();
    if (Storage.getMergeByName()) {
      // Collapse same-name cards across editions to one tile - checking ownership on a
      // specific printing happens via the modal's version cycler instead of an ambiguous
      // single checkbox (a merged tile can represent printings you own and don't).
      CardView.groupByName(cards).forEach(function (group) {
        var anyOwned = group.prints.some(function (p) { return Storage.isOwned(p.id); });
        frag.appendChild(CardView.renderTile(group.representative, {
          printCount: group.prints.length,
          anyOwned: anyOwned,
        }));
      });
    } else {
      cards.forEach(function (card) {
        frag.appendChild(CardView.renderTile(card, {
          onOwnToggle: function (card, owned) { Storage.setOwned(card, owned); },
        }));
      });
    }
    els.grid.appendChild(frag);
  }

  // Re-fetches the selected edition(s) from Scryfall. Exposed so the header's single
  // global Refresh button can call it when Browse is the active tab - "refresh" means
  // something different per tab (Collection/Deck Builder refetch owned+deck data instead).
  function refresh() {
    return Promise.all(setBySelectionOrder().map(function (code) { return ensureSetLoaded(code, true); })).then(renderGrid);
  }

  function init() {
    els.editionSearch = document.getElementById("edition-search");
    els.checklist = document.getElementById("edition-checklist");
    els.editionRows = document.getElementById("edition-checklist-rows");
    els.editionMatchCount = document.getElementById("edition-match-count");
    els.selectAllBtn = document.getElementById("btn-select-all-matching");
    els.clearBtn = document.getElementById("btn-clear-editions");
    els.chips = document.getElementById("edition-chips");
    els.globalSearch = document.getElementById("global-card-search");
    els.filter = document.getElementById("browse-filter");
    els.sort = document.getElementById("browse-sort");
    els.grid = document.getElementById("browse-grid");
    els.status = document.getElementById("browse-status");
    els.typeFilters = document.getElementById("browse-type-filters");
    els.colorFilters = document.getElementById("browse-color-filters");
    els.rarityFilters = document.getElementById("browse-rarity-filters");

    els.editionSearch.addEventListener("input", renderChecklist);
    els.editionSearch.addEventListener("focus", function () { renderChecklist(); showChecklist(); });
    els.selectAllBtn.addEventListener("click", selectAllMatching);
    els.clearBtn.addEventListener("click", clearEditions);
    document.addEventListener("click", function (e) {
      if (!els.checklist.contains(e.target) && e.target !== els.editionSearch) hideChecklist();
    });
    CardView.attachClearButton(els.editionSearch, document.getElementById("edition-search-clear"));

    els.globalSearch.addEventListener("input", function () {
      clearTimeout(globalSearchTimer);
      globalSearchTimer = setTimeout(function () { performGlobalSearch(els.globalSearch.value); }, GLOBAL_SEARCH_DEBOUNCE_MS);
    });
    CardView.attachClearButton(els.globalSearch, document.getElementById("global-card-search-clear"));

    els.filter.addEventListener("input", renderGrid);
    CardView.attachClearButton(els.filter, document.getElementById("browse-filter-clear"));
    els.sort.addEventListener("change", function () { state.sort = els.sort.value; renderGrid(); });
    // Keep checkboxes/merge state in sync when changed from the card modal's version cycler,
    // or from the shared Merge Dupes toggle in the header.
    document.addEventListener("mtg:ownership-changed", renderGrid);
    document.addEventListener("mtg:merge-changed", renderGrid);

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES, state.selectedTypes, renderGrid);
    CardFilters.renderToggleGroup(els.colorFilters, CardFilters.COLORS, state.selectedColors, renderGrid);
    CardFilters.renderToggleGroup(els.rarityFilters, CardFilters.RARITIES, state.selectedRarities, renderGrid);

    Scryfall.fetchSets(false).then(function (sets) {
      state.allSets = sets;
      var restored = Storage.getSelectedBrowseSets().filter(function (code) {
        return sets.some(function (s) { return s.code === code; });
      });
      restored.forEach(function (code) { state.selectedCodes.add(code); });
      renderChips();
      renderGrid();
      return Promise.all(restored.map(function (code) { return ensureSetLoaded(code); })).then(renderGrid);
    }).catch(function (err) {
      setStatusError(err);
    });

    function setStatusError(err) { els.status.textContent = "Failed to load editions: " + err.message; }
  }

  function activate() {
    renderGrid();
  }

  return { init: init, activate: activate, refresh: refresh };
})();
