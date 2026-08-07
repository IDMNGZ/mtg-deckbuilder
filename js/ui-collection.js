// "Collection" tab: every card the user has checked as owned, across all editions.
var CollectionUI = (function () {
  "use strict";

  var els = {};
  var state = { selectedTypes: new Set(), selectedColors: new Set(), selectedRarities: new Set(), sort: "", favoritesOnly: false };

  function toggleFavorite(card) {
    Storage.setFavorite(card.id, !Storage.isFavorite(card.id));
    render(); // unfavoriting while the Favorites filter is active should drop the tile immediately
  }

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 ||
      card.typeLine.toLowerCase().indexOf(needle) !== -1 ||
      (card.setName || "").toLowerCase().indexOf(needle) !== -1;
  }

  function removeAllPrintings(name) {
    if (!window.confirm('Remove all owned printings of "' + name + '"? This cannot be undone.')) return;
    Storage.getOwnedCards().filter(function (c) { return c.name === name; }).forEach(function (c) {
      Storage.setOwned(c, false);
    });
    render();
  }

  function render() {
    var owned = Storage.getOwnedCards();
    var needle = els.filter.value.trim();
    var visible = owned.filter(function (c) {
      return matchesFilter(c, needle) &&
        CardFilters.matchesTypes(c, state.selectedTypes) &&
        CardFilters.matchesColors(c, state.selectedColors) &&
        CardFilters.matchesRarity(c, state.selectedRarities) &&
        (!state.favoritesOnly || Storage.isFavorite(c.id));
    });
    visible = CardFilters.sortCards(visible, state.sort);
    var merged = Storage.getMergeByName();

    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();

    if (merged) {
      CardView.groupByName(visible).forEach(function (group) {
        frag.appendChild(CardView.renderTile(group.representative, {
          printCount: group.prints.length,
          onRemoveAll: function (card) { removeAllPrintings(card.name); },
          isFavorite: Storage.isFavorite(group.representative.id),
          onFavoriteToggle: toggleFavorite,
        }));
      });
    } else {
      visible.forEach(function (card) {
        frag.appendChild(CardView.renderTile(card, {
          onOwnToggle: function (card, owned) {
            Storage.setOwned(card, owned);
            render(); // unchecking here should remove the tile immediately
          },
          isFavorite: Storage.isFavorite(card.id),
          onFavoriteToggle: toggleFavorite,
        }));
      });
    }
    els.grid.appendChild(frag);

    if (owned.length === 0) {
      els.grid.innerHTML = '<p class="empty-hint">No cards yet — check some off in the Search tab.</p>';
    } else if (visible.length === 0) {
      els.grid.innerHTML = state.favoritesOnly
        ? '<p class="empty-hint">No favorites yet — tap the star on a card to add one.</p>'
        : '<p class="empty-hint">No cards match these filters.</p>';
    }
  }

  function init() {
    els.filter = document.getElementById("collection-filter");
    els.sort = document.getElementById("collection-sort");
    els.grid = document.getElementById("collection-grid");
    els.typeFilters = document.getElementById("collection-type-filters");
    els.colorFilters = document.getElementById("collection-color-filters");
    els.rarityFilters = document.getElementById("collection-rarity-filters");
    els.favoritesToggle = document.getElementById("collection-favorites-toggle");

    els.filter.addEventListener("input", render);
    CardView.attachClearButton(els.filter, document.getElementById("collection-filter-clear"));
    CardFilters.wireSortCycle(els.sort, function (value) { state.sort = value; render(); });
    els.favoritesToggle.addEventListener("click", function () {
      state.favoritesOnly = !state.favoritesOnly;
      els.favoritesToggle.classList.toggle("active", state.favoritesOnly);
      render();
    });

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES, state.selectedTypes, render);
    CardFilters.renderToggleGroup(els.colorFilters, CardFilters.COLORS, state.selectedColors, render);
    CardFilters.renderToggleGroup(els.rarityFilters, CardFilters.RARITIES, state.selectedRarities, render);

    // Keep this list in sync when ownership is toggled from the card modal's version cycler,
    // or when the shared Merge Dupes toggle / a global Refresh happens from the header.
    document.addEventListener("mtg:ownership-changed", render);
    document.addEventListener("mtg:merge-changed", render);
  }

  function activate() {
    render();
  }

  return { init: init, activate: activate, refresh: render };
})();
