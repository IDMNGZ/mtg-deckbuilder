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

  // opts: { onOwnToggle(card, owned) } and/or { addLabel, onAdd(card) }
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

  function openModal(card) {
    var modal = document.getElementById("card-modal");
    var body = document.getElementById("modal-body");
    body.innerHTML = "";

    if (card.image) {
      var img = document.createElement("img");
      img.src = card.image.normal || card.image.small;
      img.alt = card.name;
      body.appendChild(img);
    }

    var text = document.createElement("div");
    text.className = "modal-body-text";
    text.innerHTML =
      "<h2>" + escapeHtml(card.name) + " <span class='card-mana'>" + escapeHtml(card.manaCost) + "</span></h2>" +
      "<div><em>" + escapeHtml(card.typeLine) + "</em></div>" +
      "<div>" + escapeHtml(card.oracleText) + "</div>" +
      "<div class='" + rarityClass(card.rarity) + "'>" + escapeHtml(card.rarity) + " &middot; " + escapeHtml(card.setName) + " (" + escapeHtml(card.collectorNumber) + ")</div>";
    body.appendChild(text);

    modal.classList.remove("hidden");
  }

  function closeModal() {
    document.getElementById("card-modal").classList.add("hidden");
  }

  function initModal() {
    document.getElementById("modal-close").addEventListener("click", closeModal);
    document.querySelector("#card-modal .modal-backdrop").addEventListener("click", closeModal);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeModal();
    });
  }

  return {
    renderTile: renderTile,
    openModal: openModal,
    closeModal: closeModal,
    initModal: initModal,
    escapeHtml: escapeHtml,
  };
})();
