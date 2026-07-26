// Shared filter/sort building blocks used by both the Browse and Collection tabs.
var CardFilters = (function () {
  "use strict";

  var TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Planeswalker", "Battle"];

  var COLORS = [
    { value: "W", label: "White", swatch: "var(--white)" },
    { value: "U", label: "Blue", swatch: "var(--blue)" },
    { value: "B", label: "Black", swatch: "var(--black)" },
    { value: "R", label: "Red", swatch: "var(--red)" },
    { value: "G", label: "Green", swatch: "var(--green)" },
    { value: "C", label: "Colorless", swatch: "var(--text-dim)" },
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
      btn.className = "type-filter-btn" + (selectedSet.has(item.value) ? " active" : "");
      if (item.swatch) {
        var dot = document.createElement("span");
        dot.className = "type-filter-swatch";
        dot.style.background = item.swatch;
        btn.appendChild(dot);
      }
      btn.appendChild(document.createTextNode(item.label));
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
  function matchesTypes(card, selectedTypes) {
    if (selectedTypes.size === 0) return true;
    var typeLine = card.typeLine;
    var matched = false;
    selectedTypes.forEach(function (type) {
      if (new RegExp("\\b" + type + "\\b", "i").test(typeLine)) matched = true;
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
