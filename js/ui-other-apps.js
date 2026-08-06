// Renders the "My Other Apps" list on the About tab (data: js/other-apps.js) - an optional
// landing-screen thumbnail, a QR code, a Visit link, and a Share button per app. Share
// reuses ShareApp's share/copy-fallback logic with a per-entry URL/title override (and, on
// browsers that support attaching files to a share, the QR code itself as an image)
// instead of duplicating that logic per app.
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

      var row = document.createElement("div");
      row.className = "other-app-row";

      var qr = document.createElement("div");
      qr.className = "other-app-qr";
      qr.title = app.name + " QR code";
      row.appendChild(qr);

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
      row.appendChild(info);
      card.appendChild(row);
      container.appendChild(card);

      QRCodeUtil.renderInto(qr, app.url, 4);

      var fileSafeName = app.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      ShareApp.wire(shareBtn, feedback, {
        url: app.url,
        title: app.name,
        text: app.description || app.name,
        getFiles: function () {
          var svg = qr.querySelector("svg");
          return QRCodeUtil.svgToPngBlob(svg, 512).then(function (blob) {
            return [new File([blob], fileSafeName + "-qr.png", { type: "image/png" })];
          });
        },
      });
    });
  }

  return { render: render };
})();
