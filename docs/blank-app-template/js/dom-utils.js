// Tiny shared DOM helpers with no dependency on any other module in this app - safe to
// load first, before anything that might need them (system-tab.js, ui-other-apps.js).
var DomUtils = (function () {
  "use strict";

  // Any per-profile name, backup filename, etc. gets rendered into innerHTML somewhere in
  // this app - escape it first so a profile named e.g. "<img src=x onerror=...>" (however
  // unlikely) can't inject markup.
  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  return { escapeHtml: escapeHtml };
})();
