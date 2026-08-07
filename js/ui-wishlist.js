// "Wish List" tab: every printing tagged from Search as something you want to buy
// (Storage's wishlist, see storage.js). Always one tile per printing - unlike Collection
// there's no Merge Dupes toggle here, since a wishlisted printing is a specific art/edition
// someone wants, not "any copy of this card name."
var WishlistUI = (function () {
  "use strict";

  var els = {};
  var state = { selectedTypes: new Set(), selectedColors: new Set(), selectedRarities: new Set(), sort: "" };

  function matchesFilter(card, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    return card.name.toLowerCase().indexOf(needle) !== -1 ||
      card.typeLine.toLowerCase().indexOf(needle) !== -1 ||
      (card.setName || "").toLowerCase().indexOf(needle) !== -1;
  }

  function render() {
    var wishlist = Storage.getWishlistCards();
    var needle = els.filter.value.trim();
    var visible = wishlist.filter(function (c) {
      return matchesFilter(c, needle) &&
        CardFilters.matchesTypes(c, state.selectedTypes) &&
        CardFilters.matchesColors(c, state.selectedColors) &&
        CardFilters.matchesRarity(c, state.selectedRarities);
    });
    visible = CardFilters.sortCards(visible, state.sort);

    els.grid.innerHTML = "";
    var frag = document.createDocumentFragment();
    visible.forEach(function (card) {
      frag.appendChild(CardView.renderTile(card, {
        onRemoveFromWishlist: function (card) {
          Storage.setWishlisted(card, false);
          render(); // removing here should drop the tile immediately
        },
      }));
    });
    els.grid.appendChild(frag);

    if (wishlist.length === 0) {
      els.grid.innerHTML = '<p class="empty-hint">Nothing on your Wish List yet — tap the bookmark on a card in Search to add one.</p>';
    } else if (visible.length === 0) {
      els.grid.innerHTML = '<p class="empty-hint">No cards match these filters.</p>';
    }
  }

  function init() {
    els.filter = document.getElementById("wishlist-filter");
    els.sort = document.getElementById("wishlist-sort");
    els.grid = document.getElementById("wishlist-grid");
    els.typeFilters = document.getElementById("wishlist-type-filters");
    els.colorFilters = document.getElementById("wishlist-color-filters");
    els.rarityFilters = document.getElementById("wishlist-rarity-filters");

    els.filter.addEventListener("input", render);
    CardView.attachClearButton(els.filter, document.getElementById("wishlist-filter-clear"));
    CardFilters.wireSortCycle(els.sort, function (value) { state.sort = value; render(); });

    CardFilters.renderToggleGroup(els.typeFilters, CardFilters.TYPES, state.selectedTypes, render);
    CardFilters.renderToggleGroup(els.colorFilters, CardFilters.COLORS, state.selectedColors, render);
    CardFilters.renderToggleGroup(els.rarityFilters, CardFilters.RARITIES, state.selectedRarities, render);

    // A card tagged from Search (or a card that became owned, auto-clearing its wishlist
    // entry - see storage.js's setOwned) should be reflected here even if this tab isn't
    // the one currently visible when it happens.
    document.addEventListener("mtg:data-changed", function () {
      var tab = document.getElementById("tab-wishlist");
      if (tab && tab.classList.contains("active")) render();
    });
  }

  function activate() {
    render();
  }

  return { init: init, activate: activate, refresh: render };
})();
