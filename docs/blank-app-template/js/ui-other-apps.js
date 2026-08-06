// Renders the "My Other Apps" list on the About tab (data: js/other-apps.js) - an optional
// landing-screen thumbnail, a Visit link, and a Share button per app. Share reuses
// ShareApp's share/copy-fallback logic with a per-entry URL/title override instead of
// duplicating that logic per app. QR codes were tried here in an earlier iteration and
// dropped - a QR box glued to a Share button that already does the same job added visual
// clutter without a real use case. js/qr-code.js is still vendored in this template in case
// you want a QR code somewhere it actually earns its keep (e.g. a static one for THIS app's
// own URL, generated once and dropped in images/QR/ - see that folder's note in
// images/README.txt) - just not wired into this card by default.
var OtherAppsUI = (function () {
  "use strict";

  function render() {
    var container = document.getElementById("other-apps-list");
    if (!container) return;
    if (!window.OTHER_APPS || OTHER_APPS.length === 0) {
      container.innerHTML = '<p class="empty-hint">Nothing listed yet.</p>';
      return;
    }

    container.innerHTML = "";
    OTHER_APPS.forEach(function (app) {
      var card = document.createElement("div");
      card.className = "other-app-card";

      if (app.thumbnail) {
        var thumb = document.createElement("img");
        thumb.className = "other-app-thumb";
        thumb.src = app.thumbnail;
        thumb.alt = app.name + " landing screen";
        card.appendChild(thumb);
      }

      var info = document.createElement("div");
      info.className = "other-app-info";
      info.innerHTML =
        '<div class="other-app-name">' + DomUtils.escapeHtml(app.name) + "</div>" +
        '<p class="other-app-desc">' + DomUtils.escapeHtml(app.description || "") + "</p>";

      var actions = document.createElement("div");
      actions.className = "other-app-actions";

      var visitBtn = document.createElement("a");
      visitBtn.href = app.url;
      visitBtn.target = "_blank";
      visitBtn.rel = "noopener";
      visitBtn.className = "btn btn-primary";
      visitBtn.textContent = "Visit";
      actions.appendChild(visitBtn);

      var shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "btn btn-accent";
      shareBtn.textContent = "Share";
      actions.appendChild(shareBtn);

      var feedback = document.createElement("span");
      feedback.className = "other-app-share-feedback";
      feedback.setAttribute("aria-live", "polite");
      actions.appendChild(feedback);

      info.appendChild(actions);
      card.appendChild(info);
      container.appendChild(card);

      ShareApp.wire(shareBtn, feedback, {
        url: app.url,
        title: app.name,
        text: app.description || app.name,
      });
    });
  }

  return { render: render };
})();
