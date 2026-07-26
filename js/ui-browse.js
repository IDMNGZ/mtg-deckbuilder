// "Browse" tab: pick an edition/set, list every printed card in it with an ownership checkbox.
var BrowseUI = (function () {
  "use strict";

  var TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Planeswalker", "Battle"];

  var els = {};
  var state = { cards: [], setCode: "", selectedTypes: new Set() };

  function setStatus(text) { els.status.textContent = text; }

  function renderTypeFilters() {
    els.typeFilters.innerHTML = "";
    TYPES.forEach(function (type) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "type-filter-btn" + (state.selectedTypes.has(type) ? " active" : "");
      btn.textContent = type;
      btn.addEventListener("click", function () {
        if (state.selectedTypes.has(type)) {
          state.selectedTypes.delete(type);
        } else {
          state.selectedTypes.add(type);
        }
        renderTypeFilters();
        renderGrid();
      });
      els.typeFilters.appendChild(btn);
    });
  }

  function loadSets(forceRefresh) {
    els.select.innerHTML = '<option value="">Loading editions…</option>';
    return Scryfall.fetchSets(forceRefresh).then(function (sets) {
      els.select.innerHTML = '<option value="">Choose an edition…</option>' + sets.map(function (s) {
        var year = s.releasedAt ? s.releasedAt.slice(0, 4) : "?";
        var tag = s.digital ? " [digital]" : "";
        return '<option value="' + s.code + '">' + CardView.escapeHtml(s.name) + " (" + year + ")" + tag + "</option>";
      }).join("");
      return sets;
    }).catch(function (err) {
      els.select.innerHTML = '<option value="">Failed to load editions</option>';
      setStatus(err.message);
      return [];
    });
  }

  function loadCardsForSet(setCode, forceRefresh) {
    if (!setCode) {
      state.cards = [];
      state.setCode = "";
      renderGrid();
      return;
    }
    state.setCode = setCode;
    setStatus("Loading cards…");
    els.grid.innerHTML = "";
    Scryfall.fetchCardsForSet(setCode, forceRefresh).then(function (cards) {
      if (state.setCode !== setCode) return; // user switched sets while this was in flight
      state.cards = cards;
      setStatus(cards.length + " cards");
      renderGrid();
    }).catch(function (err) {
      setStatus("Error: " + err.message);
    });
  }

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 ||
      card.typeLine.toLowerCase().indexOf(needle) !== -1;
  }

  // Contains-match against the full type line (not just mainType) so "Artifact" also
  // surfaces Artifact Creatures, "Land" surfaces basic lands, etc. OR'd across selections.
  function matchesTypes(card) {
    if (state.selectedTypes.size === 0) return true;
    var typeLine = card.typeLine;
    var matched = false;
    state.selectedTypes.forEach(function (type) {
      if (new RegExp("\\b" + type + "\\b", "i").test(typeLine)) matched = true;
    });
    return matched;
  }

  function renderGrid() {
    var needle = els.filter.value.trim();
    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    state.cards.filter(function (c) { return matchesFilter(c, needle) && matchesTypes(c); }).forEach(function (card) {
      frag.appendChild(CardView.renderTile(card, {
        onOwnToggle: function (card, owned) { Storage.setOwned(card, owned); },
      }));
    });
    els.grid.appendChild(frag);
  }

  function init() {
    els.select = document.getElementById("set-select");
    els.filter = document.getElementById("browse-filter");
    els.grid = document.getElementById("browse-grid");
    els.status = document.getElementById("browse-status");
    els.refreshBtn = document.getElementById("btn-refresh-set");
    els.typeFilters = document.getElementById("browse-type-filters");

    els.select.addEventListener("change", function () {
      Storage.setLastBrowseSet(els.select.value);
      loadCardsForSet(els.select.value, false);
    });
    els.filter.addEventListener("input", renderGrid);
    els.refreshBtn.addEventListener("click", function () {
      if (state.setCode) loadCardsForSet(state.setCode, true);
    });

    renderTypeFilters();
    loadSets(false).then(function (sets) {
      var lastCode = Storage.getLastBrowseSet();
      var stillExists = lastCode && sets.some(function (s) { return s.code === lastCode; });
      if (stillExists) {
        els.select.value = lastCode;
        loadCardsForSet(lastCode, false);
      }
    });
  }

  return { init: init };
})();
