// "Browse" tab: search/select one or more editions and list every printed card in them,
// combined into a single grid, each with an ownership checkbox.
var BrowseUI = (function () {
  "use strict";

  var MAX_CHECKLIST_ROWS = 80;

  var els = {};
  var state = {
    allSets: [],
    selectedCodes: new Set(),
    cardsBySet: {}, // code -> cards[] once loaded
    pendingLoads: 0,
    selectedTypes: new Set(), selectedColors: new Set(), selectedRarities: new Set(),
    sort: "",
  };

  function setBySelectionOrder() {
    // Set preserves insertion order in JS, so chips/status read in the order picked.
    return Array.from(state.selectedCodes);
  }

  function findSet(code) {
    return state.allSets.find(function (s) { return s.code === code; });
  }

  function updateStatus() {
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
    var combined = [];
    setBySelectionOrder().forEach(function (code) {
      combined = combined.concat(state.cardsBySet[code] || []);
    });

    var visible = combined.filter(function (c) {
      return matchesFilter(c, needle) &&
        CardFilters.matchesTypes(c, state.selectedTypes) &&
        CardFilters.matchesColors(c, state.selectedColors) &&
        CardFilters.matchesRarity(c, state.selectedRarities);
    });
    visible = CardFilters.sortCards(visible, state.sort);

    els.grid.innerHTML = "";
    if (state.selectedCodes.size === 0) {
      els.grid.innerHTML = '<p class="empty-hint">Search and select one or more editions above to browse their cards.</p>';
    } else {
      var frag = document.createDocumentFragment();
      visible.forEach(function (card) {
        frag.appendChild(CardView.renderTile(card, {
          onOwnToggle: function (card, owned) { Storage.setOwned(card, owned); },
        }));
      });
      els.grid.appendChild(frag);
    }
    updateStatus();
  }

  function init() {
    els.editionSearch = document.getElementById("edition-search");
    els.checklist = document.getElementById("edition-checklist");
    els.editionRows = document.getElementById("edition-checklist-rows");
    els.editionMatchCount = document.getElementById("edition-match-count");
    els.selectAllBtn = document.getElementById("btn-select-all-matching");
    els.clearBtn = document.getElementById("btn-clear-editions");
    els.chips = document.getElementById("edition-chips");
    els.filter = document.getElementById("browse-filter");
    els.sort = document.getElementById("browse-sort");
    els.grid = document.getElementById("browse-grid");
    els.status = document.getElementById("browse-status");
    els.refreshBtn = document.getElementById("btn-refresh-set");
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

    els.filter.addEventListener("input", renderGrid);
    els.sort.addEventListener("change", function () { state.sort = els.sort.value; renderGrid(); });
    els.refreshBtn.addEventListener("click", function () {
      Promise.all(setBySelectionOrder().map(function (code) { return ensureSetLoaded(code, true); })).then(renderGrid);
    });
    // Keep checkboxes in sync when ownership is toggled from the card modal's version cycler.
    document.addEventListener("mtg:ownership-changed", renderGrid);

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES.map(function (t) { return { value: t, label: t }; }), state.selectedTypes, renderGrid);
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

  return { init: init };
})();
