// Shared card tile + detail modal rendering, used by Browse, Collection, and the Deck Builder pool.
var CardView = (function () {
  "use strict";

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function rarityClass(rarity) {
    return "rarity-" + (rarity || "common").toLowerCase();
  }

  // The card's principal type (Creature, Instant, Land, ...), ignoring supertypes
  // (Legendary, Basic, Snow, ...) and subtypes after the em dash.
  function mainType(card) {
    var frontHalf = card.typeLine.split("—")[0].trim();
    var words = frontHalf.split(/\s+/).filter(Boolean);
    return words.length ? words[words.length - 1] : "Other";
  }

  function isLand(card) {
    return card.typeLine.indexOf("Land") !== -1;
  }

  // Collapses a list of owned card snapshots into one entry per card *name*, so the
  // same real-world card owned across several printings/editions shows up once.
  // Each group keeps every printing (for "remove all") plus a representative for display.
  // Preserves the input's order (first occurrence of each name) rather than re-sorting,
  // so callers can sort the input first (e.g. by CMC) and have that order stick.
  function groupByName(cards) {
    var order = [];
    var groups = {};
    cards.forEach(function (card) {
      if (!groups[card.name]) {
        groups[card.name] = { name: card.name, prints: [], representative: card };
        order.push(card.name);
      }
      groups[card.name].prints.push(card);
    });
    return order.map(function (name) { return groups[name]; });
  }

  // opts: { onOwnToggle(card, owned) }, or { printCount, onRemoveAll(card) } for a merged
  // group tile, and/or { addLabel, onAdd(card) }
  function renderTile(card, opts) {
    opts = opts || {};
    var tile = document.createElement("div");
    tile.className = "card-tile";
    tile.dataset.cardId = card.id;

    var img = document.createElement(card.image ? "img" : "div");
    if (card.image) {
      img.src = card.image.small || card.image.normal;
      img.alt = card.name;
    } else {
      img.className = "card-tile-noimg";
      img.textContent = card.name;
    }
    img.addEventListener("click", function () { openModal(card); });
    tile.appendChild(img);

    var titleRow = document.createElement("div");
    titleRow.className = "card-title-row";
    titleRow.innerHTML =
      '<span>' + escapeHtml(card.name) + '</span>' +
      '<span class="card-mana">' + escapeHtml(card.manaCost) + '</span>';
    tile.appendChild(titleRow);

    var metaRow = document.createElement("div");
    metaRow.className = "card-meta";
    metaRow.innerHTML =
      '<span>' + escapeHtml(card.typeLine) + '</span>' +
      '<span class="' + rarityClass(card.rarity) + '">' + escapeHtml(card.rarity) + '</span>';
    tile.appendChild(metaRow);

    // Shown on every tile (not just when merging) since Browse can now combine cards
    // from several editions at once, where it's otherwise ambiguous which is which.
    var setLine = document.createElement("div");
    setLine.className = "card-set-line";
    setLine.textContent = card.setName || card.set;
    tile.appendChild(setLine);

    if (opts.onOwnToggle) {
      var ownRow = document.createElement("label");
      ownRow.className = "card-own-row";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = Storage.isOwned(card.id);
      cb.addEventListener("change", function () { opts.onOwnToggle(card, cb.checked); });
      ownRow.appendChild(cb);
      ownRow.appendChild(document.createTextNode("I own this"));
      tile.appendChild(ownRow);
    } else if (opts.onRemoveAll) {
      var mergedRow = document.createElement("div");
      mergedRow.className = "card-own-row card-own-row-merged";
      var countLabel = document.createElement("span");
      countLabel.textContent = opts.printCount > 1 ? "Owned ×" + opts.printCount + " editions" : "Owned";
      var removeBtn = document.createElement("button");
      removeBtn.className = "btn btn-ghost remove-all-btn";
      removeBtn.textContent = "Remove all";
      removeBtn.addEventListener("click", function () { opts.onRemoveAll(card); });
      mergedRow.appendChild(countLabel);
      mergedRow.appendChild(removeBtn);
      tile.appendChild(mergedRow);
    }

    if (opts.onAdd) {
      var addBtn = document.createElement("button");
      addBtn.className = "btn btn-ghost card-add-btn";
      addBtn.textContent = opts.addLabel || "Add to deck";
      addBtn.addEventListener("click", function () { opts.onAdd(card); });
      tile.appendChild(addBtn);
    }

    return tile;
  }

  // Modal cycling state: every printing of the currently-open card's name (once fetched),
  // plus which one is showing. Ownership can be toggled per-printing right from the modal.
  var modalState = { prints: [], index: 0 };

  // The enlarged image is legible enough on its own (name, cost, type, rules text,
  // rarity/set symbols are all printed on the card) - no need to duplicate it as text.
  function renderModalPrint() {
    var card = modalState.prints[modalState.index];
    var body = document.getElementById("modal-body");
    body.innerHTML = "";

    if (card.image) {
      var img = document.createElement("img");
      img.src = card.image.large || card.image.normal || card.image.small;
      img.alt = card.name;
      body.appendChild(img);
    } else {
      // Rare fallback for cards Scryfall has no image for.
      var fallback = document.createElement("div");
      fallback.className = "modal-body-text";
      fallback.innerHTML =
        "<h2>" + escapeHtml(card.name) + " <span class='card-mana'>" + escapeHtml(card.manaCost) + "</span></h2>" +
        "<div><em>" + escapeHtml(card.typeLine) + "</em></div>" +
        "<div>" + escapeHtml(card.oracleText) + "</div>";
      body.appendChild(fallback);
    }

    var caption = document.createElement("div");
    caption.className = "modal-caption";

    var info = document.createElement("span");
    info.textContent = card.setName + (modalState.prints.length > 1 ? " (" + (modalState.index + 1) + " of " + modalState.prints.length + ")" : "");
    caption.appendChild(info);

    var ownToggle = document.createElement("label");
    ownToggle.className = "modal-own-toggle";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = Storage.isOwned(card.id);
    cb.addEventListener("change", function () {
      Storage.setOwned(card, cb.checked);
      document.dispatchEvent(new CustomEvent("mtg:ownership-changed"));
    });
    ownToggle.appendChild(cb);
    ownToggle.appendChild(document.createTextNode("I own this"));
    caption.appendChild(ownToggle);

    body.appendChild(caption);

    var multi = modalState.prints.length > 1;
    document.getElementById("modal-prev").classList.toggle("hidden", !multi);
    document.getElementById("modal-next").classList.toggle("hidden", !multi);
  }

  function openModal(card) {
    modalState.prints = [card];
    modalState.index = 0;
    document.getElementById("card-modal").classList.remove("hidden");
    renderModalPrint();

    if (window.Scryfall) {
      Scryfall.fetchPrintsByName(card).then(function (prints) {
        if (document.getElementById("card-modal").classList.contains("hidden")) return; // closed while fetching
        if (!prints || prints.length <= 1) return;
        var matchIdx = prints.findIndex(function (p) { return p.id === card.id; });
        modalState.prints = prints;
        modalState.index = matchIdx >= 0 ? matchIdx : 0;
        renderModalPrint();
      }).catch(function (err) {
        console.error("Failed to load other printings:", err);
      });
    }
  }

  function stepModal(delta) {
    if (modalState.prints.length <= 1) return;
    modalState.index = (modalState.index + delta + modalState.prints.length) % modalState.prints.length;
    renderModalPrint();
  }

  function closeModal() {
    document.getElementById("card-modal").classList.add("hidden");
  }

  function initModal() {
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.getElementById("modal-prev").addEventListener("click", function () { stepModal(-1); });
    document.getElementById("modal-next").addEventListener("click", function () { stepModal(1); });
    document.querySelector("#card-modal .modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (document.getElementById("card-modal").classList.contains("hidden")) return;
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowLeft") stepModal(-1);
      else if (e.key === "ArrowRight") stepModal(1);
    });
  }

  return {
    renderTile: renderTile,
    openModal: openModal,
    closeModal: closeModal,
    initModal: initModal,
    escapeHtml: escapeHtml,
    mainType: mainType,
    isLand: isLand,
    groupByName: groupByName,
  };
})();
