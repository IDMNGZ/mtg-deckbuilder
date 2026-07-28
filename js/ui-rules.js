// "Rules" tab: a filterable reference of MTG rules/keyword mechanics grouped into
// sections (js/rules-data.js). All sections shown by default; toggle buttons let the
// user pick which rule sets to view.
var RulesUI = (function () {
  "use strict";

  var els = {};
  var state = { selectedSets: new Set(RULES_DATA.map(function (rs) { return rs.id; })) };

  function matchesSearch(entry, needle) {
    if (!needle) return true;
    needle = needle.toLowerCase();
    if (entry.term.toLowerCase().indexOf(needle) !== -1) return true;
    if (entry.source && entry.source.toLowerCase().indexOf(needle) !== -1) return true;
    return entry.bullets.some(function (b) { return b.toLowerCase().indexOf(needle) !== -1; });
  }

  function render() {
    var needle = els.filter.value.trim();
    els.sections.innerHTML = "";
    var frag = document.createDocumentFragment();
    var shownCount = 0;

    RULES_DATA.forEach(function (rs) {
      if (!state.selectedSets.has(rs.id)) return;
      var entries = rs.entries.filter(function (e) { return matchesSearch(e, needle); });
      if (needle && entries.length === 0) return; // hide the whole section if searching and nothing matches

      shownCount++;
      var section = document.createElement("section");
      section.className = "rules-section";

      var header = document.createElement("div");
      header.className = "rules-section-header";
      header.innerHTML = "<h2>" + CardView.escapeHtml(rs.label) + "</h2><p>" + CardView.escapeHtml(rs.blurb) + "</p>";
      section.appendChild(header);

      var entriesWrap = document.createElement("div");
      entriesWrap.className = "rule-entries";
      entries.forEach(function (entry) {
        var entryEl = document.createElement("div");
        entryEl.className = "rule-entry";
        // The rule itself (bullets) leads; the source edition/year is a trailing note,
        // not the headline - it's secondary to what the mechanic actually does.
        var bulletsHtml = "<ul class='rule-bullets'>" +
          entry.bullets.map(function (b) { return "<li>" + CardView.escapeHtml(b) + "</li>"; }).join("") +
          "</ul>";
        var sourceHtml = entry.source ? "<div class='rule-source'>" + CardView.escapeHtml(entry.source) + "</div>" : "";
        entryEl.innerHTML =
          "<div class='rule-entry-body'>" +
          "<div class='rule-term'>" + CardView.escapeHtml(entry.term) + "</div>" +
          bulletsHtml +
          sourceHtml +
          "</div>";
        // entry.example (currently only on Evergreen Keywords, as a trial) is a real card
        // id verified against Scryfall - the thumbnail is Scryfall's documented
        // deterministic CDN path (no API call needed to display it), and clicking it opens
        // the same card-detail modal used everywhere else, using the full card data cached
        // in RULES_EXAMPLE_CARDS so that doesn't need an API call either.
        if (entry.example) {
          var id = entry.example.id;
          var img = document.createElement("img");
          img.className = "rule-entry-example";
          img.src = "https://cards.scryfall.io/small/front/" + id.charAt(0) + "/" + id.charAt(1) + "/" + id + ".jpg";
          img.alt = entry.example.name;
          img.title = "Example card: " + entry.example.name + " (click to view)";
          img.loading = "lazy";
          img.addEventListener("click", function () {
            var fullCard = window.RULES_EXAMPLE_CARDS && window.RULES_EXAMPLE_CARDS[id];
            if (fullCard) CardView.openModal(fullCard);
          });
          entryEl.insertBefore(img, entryEl.firstChild);
        }
        entriesWrap.appendChild(entryEl);
      });
      section.appendChild(entriesWrap);
      frag.appendChild(section);
    });

    els.sections.appendChild(frag);
    if (shownCount === 0) {
      els.sections.innerHTML = '<p class="empty-hint">No rule sections match your filters.</p>';
    }
    els.status.textContent = shownCount + " of " + RULES_DATA.length + " rule sets shown";
  }

  function renderFilters() {
    var items = RULES_DATA.map(function (rs) { return { value: rs.id, label: rs.label }; });
    CardFilters.renderToggleGroup(els.setFilters, items, state.selectedSets, render);
  }

  function showAll() {
    RULES_DATA.forEach(function (rs) { state.selectedSets.add(rs.id); });
    renderFilters();
    render();
  }

  function hideAll() {
    state.selectedSets.clear();
    renderFilters();
    render();
  }

  function init() {
    els.filter = document.getElementById("rules-filter");
    els.setFilters = document.getElementById("rules-set-filters");
    els.sections = document.getElementById("rules-sections");
    els.status = document.getElementById("rules-status");
    els.showAllBtn = document.getElementById("btn-rules-show-all");
    els.hideAllBtn = document.getElementById("btn-rules-hide-all");

    els.filter.addEventListener("input", render);
    CardView.attachClearButton(els.filter, document.getElementById("rules-filter-clear"));
    els.showAllBtn.addEventListener("click", showAll);
    els.hideAllBtn.addEventListener("click", hideAll);

    renderFilters();
    render();
  }

  return { init: init };
})();
