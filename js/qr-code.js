// Thin wrapper around the vendored qrcode-generator library (js/vendor/qrcode-generator.js,
// MIT licensed, © Kazuhiko Arase) - renders a QR code as inline SVG into a container.
var QRCodeUtil = (function () {
  "use strict";

  // typeNumber 0 lets the library auto-pick the smallest QR version that fits the data;
  // "M" (~15% error correction) is a reasonable default for a plain URL-length payload.
  function renderInto(container, text, cellSize) {
    if (!container || !text) return;
    var qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    container.innerHTML = qr.createSvgTag(cellSize || 4, 0);
  }

  return { renderInto: renderInto };
})();
