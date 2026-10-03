// iOS Safari / WKWebView zoom the page when a focused field (input or contenteditable) is under
// 16px, and the 15px root makes every field qualify. iOS honors maximum-scale for that focus zoom
// but ignores it for pinch-zoom; Android would block pinch-zoom, so apply it on iOS only.
// iPadOS reports a Macintosh UA, so detect it by touch points.
// External file (not inline in index.html) so the Content-Security-Policy can block inline scripts.
(function () {
  var ua = navigator.userAgent;
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) {
    document
      .querySelector('meta[name="viewport"]')
      .setAttribute("content", "width=device-width, initial-scale=1.0, maximum-scale=1");
  }
})();
