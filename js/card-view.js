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

  // Wires an (x) button to clear a text input: shows only when the input has a value,
  // clears + refocuses + fires "input" on click so whatever's listening re-renders.
  function attachClearButton(input, btn) {
    function sync() { btn.style.display = input.value ? "block" : "none"; }
    input.addEventListener("input", sync);
    btn.addEventListener("click", function () {
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
    sync();
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

    if (opts.qty) {
      var qtyBadge = document.createElement("span");
      qtyBadge.className = "card-qty-badge";
      qtyBadge.textContent = "×" + opts.qty;
      tile.appendChild(qtyBadge);
    }

    // Opposite corner from the qty badge above. Only meaningful for an owned card (there's
    // nowhere to persist the flag otherwise - see Storage.setFavorite), so callers only
    // pass onFavoriteToggle where that's guaranteed true (Collection).
    if (opts.onFavoriteToggle) {
      var favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "card-favorite-btn" + (opts.isFavorite ? " active" : "");
      favBtn.title = opts.isFavorite ? "Remove from Favorites" : "Add to Favorites";
      favBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (opts.isFavorite ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';
      favBtn.addEventListener("click", function () { opts.onFavoriteToggle(card); });
      tile.appendChild(favBtn);
    }

    // Same corner slot as the favorite button above - safe to reuse since a tile only ever
    // gets one or the other (Favorites is Collection-only/owned cards; wishlisting is
    // Browse-only/not-yet-owned cards, see ui-browse.js). Distinct icon+color (bookmark,
    // accent blue) so the two read as different concepts at a glance, not just because
    // they'd otherwise collide.
    if (opts.onWishlistToggle) {
      var wishBtn = document.createElement("button");
      wishBtn.type = "button";
      wishBtn.className = "card-wishlist-btn" + (opts.isWishlisted ? " active" : "");
      wishBtn.title = opts.isWishlisted ? "Remove from Wish List" : "Add to Wish List";
      wishBtn.innerHTML =
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="' + (opts.isWishlisted ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>';
      wishBtn.addEventListener("click", function () { opts.onWishlistToggle(card); });
      tile.appendChild(wishBtn);
    }

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
    // When merged, a single set name would misleadingly imply this is the only printing.
    var setLine = document.createElement("div");
    setLine.className = "card-set-line";
    setLine.textContent = (opts.printCount && opts.printCount > 1)
      ? "Multiple editions (" + opts.printCount + ")"
      : (card.setName || card.set);
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
    } else if (opts.printCount) {
      // Browse's merged view: several printings, not necessarily owned. No single checkbox
      // makes sense here (it'd be ambiguous which printing it marks) - tap the image and use
      // the modal's version cycler to check off the exact printing you own.
      var infoRow = document.createElement("div");
      infoRow.className = "card-own-row card-own-row-info";
      infoRow.textContent = opts.anyOwned ? "✓ You own at least one printing" : opts.printCount + " printings — tap image to check ownership";
      tile.appendChild(infoRow);
    }

    if (opts.onAdd) {
      var addBtn = document.createElement("button");
      addBtn.className = "btn btn-ghost card-add-btn";
      addBtn.textContent = opts.addLabel || "Add to deck";
      addBtn.addEventListener("click", function () { opts.onAdd(card); });
      tile.appendChild(addBtn);
    }

    // Wish List tab only: one link per vendor Scryfall has purchase_uris for on this printing
    // (TCGplayer/Cardmarket/Cardhoarder/etc - varies by card, hence the loop instead of
    // hardcoding specific vendors), plus a way to take it back off the list.
    if (opts.onRemoveFromWishlist) {
      var vendorLabels = { tcgplayer: "TCGplayer", cardmarket: "Cardmarket", cardhoarder: "Cardhoarder", cardkingdom: "Card Kingdom" };
      var uris = card.purchaseUris || {};
      var vendorKeys = Object.keys(uris);

      var buyRow = document.createElement("div");
      buyRow.className = "card-buy-row";
      if (vendorKeys.length > 0) {
        vendorKeys.forEach(function (key) {
          var link = document.createElement("a");
          link.href = uris[key];
          link.target = "_blank";
          link.rel = "noopener";
          link.className = "btn btn-ghost card-add-btn card-buy-btn";
          link.textContent = "Buy on " + (vendorLabels[key] || (key.charAt(0).toUpperCase() + key.slice(1)));
          buyRow.appendChild(link);
        });
      } else {
        var noVendor = document.createElement("span");
        noVendor.className = "card-own-row-info";
        noVendor.textContent = "No purchase links available for this printing.";
        buyRow.appendChild(noVendor);
      }
      tile.appendChild(buyRow);

      var removeWishBtn = document.createElement("button");
      removeWishBtn.className = "btn btn-ghost remove-all-btn";
      removeWishBtn.textContent = "Remove from Wish List";
      removeWishBtn.addEventListener("click", function () { opts.onRemoveFromWishlist(card); });
      tile.appendChild(removeWishBtn);
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

    // Grouped together (not two independent space-between items in .modal-caption) so
    // they read as a paired set of checkboxes and wrap as a unit on narrow viewports.
    var toggles = document.createElement("div");
    toggles.className = "modal-toggles";

    var ownToggle = document.createElement("label");
    ownToggle.className = "modal-own-toggle";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = Storage.isOwned(card.id);
    cb.addEventListener("change", function () {
      Storage.setOwned(card, cb.checked);
      document.dispatchEvent(new CustomEvent("mtg:ownership-changed"));
      renderModalPrint(); // re-sync both checkboxes - owning this now auto-clears any Wish List flag
    });
    ownToggle.appendChild(cb);
    ownToggle.appendChild(document.createTextNode("I own this"));
    toggles.appendChild(ownToggle);

    // Second, separate checkbox - "I own this" and "want to buy this" are opposite states
    // by definition, so wishlisting is disabled (not just redundant) once a card is owned,
    // matching Storage.setOwned's own auto-clear-on-own behavior instead of just hiding it
    // and letting the two drift out of sync.
    var wishToggle = document.createElement("label");
    wishToggle.className = "modal-own-toggle";
    var wishCb = document.createElement("input");
    wishCb.type = "checkbox";
    wishCb.checked = Storage.isWishlisted(card.id);
    wishCb.disabled = cb.checked;
    if (cb.checked) wishToggle.title = "Already owned - remove it above first if you want to wishlist it instead.";
    wishCb.addEventListener("change", function () {
      Storage.setWishlisted(card, wishCb.checked);
      renderModalPrint();
    });
    wishToggle.appendChild(wishCb);
    wishToggle.appendChild(document.createTextNode("Wish List"));
    toggles.appendChild(wishToggle);

    caption.appendChild(toggles);
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
    attachClearButton: attachClearButton,
  };
})();
