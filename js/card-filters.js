// Shared filter/sort building blocks used by both the Browse and Collection tabs.
var CardFilters = (function () {
  "use strict";

  // "match" lists the type-line words a pill responds to, when it's more than just its
  // own value - Battle is a tiny card pool (introduced March of the Machine, 2023) so it
  // rides along on the Planeswalker pill instead of taking a whole slot of its own.
  var TYPES = [
    { value: "Creature", label: "Creature" },
    { value: "Instant", label: "Instant" },
    { value: "Sorcery", label: "Sorcery" },
    { value: "Artifact", label: "Artifact" },
    { value: "Enchantment", label: "Enchantment" },
    { value: "Land", label: "Land" },
    { value: "Planeswalker", label: "Planeswalker/Battle", match: ["Planeswalker", "Battle"] },
  ];

  // Icon-only buttons using Scryfall's official mana symbol SVGs (same CORS-enabled,
  // freely-usable source as the card images elsewhere in the app) - keeps color filters
  // recognizable at a glance without the horizontal space a text label needs.
  var COLORS = [
    { value: "W", label: "White", icon: "https://svgs.scryfall.io/card-symbols/W.svg" },
    { value: "U", label: "Blue", icon: "https://svgs.scryfall.io/card-symbols/U.svg" },
    { value: "B", label: "Black", icon: "https://svgs.scryfall.io/card-symbols/B.svg" },
    { value: "R", label: "Red", icon: "https://svgs.scryfall.io/card-symbols/R.svg" },
    { value: "G", label: "Green", icon: "https://svgs.scryfall.io/card-symbols/G.svg" },
    { value: "C", label: "Colorless", icon: "https://svgs.scryfall.io/card-symbols/C.svg" },
  ];

  var RARITIES = ["common", "uncommon", "rare", "mythic"].map(function (r) {
    return { value: r, label: r.charAt(0).toUpperCase() + r.slice(1) };
  });

  // Renders a row of multi-select pill buttons and re-renders itself on every click,
  // then calls onChange() so the caller can re-render whatever the filter applies to.
  function renderToggleGroup(container, items, selectedSet, onChange) {
    container.innerHTML = "";
    items.forEach(function (item) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.title = item.label;
      btn.className = "type-filter-btn"
        + (item.icon ? " type-filter-btn-icon" : "")
        + (selectedSet.has(item.value) ? " active" : "");
      if (item.icon) {
        var img = document.createElement("img");
        img.className = "type-filter-icon";
        img.src = item.icon;
        img.alt = item.label;
        btn.appendChild(img);
      } else {
        if (item.swatch) {
          var dot = document.createElement("span");
          dot.className = "type-filter-swatch";
          dot.style.background = item.swatch;
          btn.appendChild(dot);
        }
        btn.appendChild(document.createTextNode(item.label));
      }
      btn.addEventListener("click", function () {
        if (selectedSet.has(item.value)) {
          selectedSet.delete(item.value);
        } else {
          selectedSet.add(item.value);
        }
        renderToggleGroup(container, items, selectedSet, onChange);
        onChange();
      });
      container.appendChild(btn);
    });
  }

  // Contains-match against the full type line (not just mainType) so "Artifact" also
  // surfaces Artifact Creatures, "Land" surfaces basic lands, etc. OR'd across selections.
  // A selected value can match more than one type-line word (see TYPES' "match" lists).
  function matchesTypes(card, selectedTypes) {
    if (selectedTypes.size === 0) return true;
    var typeLine = card.typeLine;
    var matched = false;
    selectedTypes.forEach(function (value) {
      var item = TYPES.filter(function (t) { return t.value === value; })[0];
      var words = (item && item.match) || [value];
      if (new RegExp("\\b(?:" + words.join("|") + ")\\b", "i").test(typeLine)) matched = true;
    });
    return matched;
  }

  // OR'd across selections; a colorless card (empty colors array) only matches "C".
  function matchesColors(card, selectedColors) {
    if (selectedColors.size === 0) return true;
    var colors = card.colors || [];
    if (colors.length === 0) return selectedColors.has("C");
    return colors.some(function (c) { return selectedColors.has(c); });
  }

  function matchesRarity(card, selectedRarities) {
    if (selectedRarities.size === 0) return true;
    return selectedRarities.has((card.rarity || "").toLowerCase());
  }

  function sortCards(cards, sortMode) {
    var copy = cards.slice();
    if (sortMode === "cmc-asc") {
      copy.sort(function (a, b) { return a.cmc - b.cmc || a.name.localeCompare(b.name); });
    } else if (sortMode === "cmc-desc") {
      copy.sort(function (a, b) { return b.cmc - a.cmc || a.name.localeCompare(b.name); });
    }
    return copy;
  }

  return {
    TYPES: TYPES,
    COLORS: COLORS,
    RARITIES: RARITIES,
    renderToggleGroup: renderToggleGroup,
    matchesTypes: matchesTypes,
    matchesColors: matchesColors,
    matchesRarity: matchesRarity,
    sortCards: sortCards,
  };
})();
