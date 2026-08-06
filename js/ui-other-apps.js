// Renders the "My Other Apps" list on the About tab (data: js/other-apps.js) - a QR code,
// Visit link, and Share button per app, reusing ShareApp's share/copy-fallback logic with
// a per-entry URL/title override instead of duplicating it.
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
    OTHER_APPS.forEach(function (app, i) {
      var card = document.createElement("div");
      card.className = "other-app-card";

      var qr = document.createElement("div");
      qr.className = "other-app-qr";
      qr.title = app.name + " QR code";
      card.appendChild(qr);

      var info = document.createElement("div");
      info.className = "other-app-info";
      info.innerHTML =
        '<div class="other-app-name">' + CardView.escapeHtml(app.name) + "</div>" +
        '<p class="other-app-desc">' + CardView.escapeHtml(app.description || "") + "</p>";

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

      QRCodeUtil.renderInto(qr, app.url, 4);
      ShareApp.wire(shareBtn, feedback, { url: app.url, title: app.name, text: app.description || app.name });
    });
  }

  return { render: render };
})();
