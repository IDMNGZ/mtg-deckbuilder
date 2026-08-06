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

  // Rasterizes an already-rendered QR <svg> into a PNG Blob, so it can be attached as a
  // real file to navigator.share() - a QR code is really only useful to someone other than
  // the person already looking at it, so being able to hand over the image itself (not
  // just the link it encodes) is what makes it worth sharing at all.
  function svgToPngBlob(svgEl, sizePx) {
    return new Promise(function (resolve, reject) {
      if (!svgEl) { reject(new Error("no svg element")); return; }
      var svgData = new XMLSerializer().serializeToString(svgEl);
      var svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(svgBlob);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = sizePx;
        canvas.height = sizePx;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, sizePx, sizePx);
        ctx.drawImage(img, 0, 0, sizePx, sizePx);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob); else reject(new Error("canvas.toBlob returned null"));
        }, "image/png");
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("svg failed to load as an image")); };
      img.src = url;
    });
  }

  return { renderInto: renderInto, svgToPngBlob: svgToPngBlob };
})();
