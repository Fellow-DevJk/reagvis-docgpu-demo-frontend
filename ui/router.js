/* ui/router.js — tiny hash router + shared UI helpers (no framework, no build).
 * Screens register with UI.route(name, renderFn); renderFn returns an HTML string.
 * State that must survive navigation (verdict, results) goes through UI.store. */
(function (global) {
  "use strict";
  const UI = (global.UI = global.UI || {});

  UI.routes = {};
  UI.store = {}; // in-memory hand-off between screens (e.g. confirm verdict)

  UI.route = function (name, render) {
    UI.routes[name] = render;
  };
  UI.navigate = function (name) {
    if (("#/" + name) === global.location.hash) UI.mount();
    else global.location.hash = "#/" + name;
  };
  UI.currentRoute = function () {
    const h = global.location.hash.replace(/^#\/?/, "");
    return (h.split("?")[0] || "home");
  };

  UI.mount = function () {
    const name = UI.currentRoute();
    const render = UI.routes[name] || UI.routes.home;
    const app = document.getElementById("app");
    if (!app || !render) return;
    app.innerHTML = render();
    global.scrollTo(0, 0);
    if (typeof UI.afterMount === "function") UI.afterMount(name);
  };

  // escapeHtml is a global from app.js; alias defensively.
  UI.esc = function (v) {
    return typeof global.escapeHtml === "function"
      ? global.escapeHtml(v)
      : String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
          return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
        });
  };

  UI.prettyBytes = function (b) {
    if (b < 1024) return b + " B";
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
    return (b / (1024 * 1024)).toFixed(2) + " MB";
  };

  // ---- inline lucide-style icons (24x24 stroke) ----
  const P = {
    uploadCloud: "M16 16l-4-4-4 4M12 12v9M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3",
    fileText: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    fileImage: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M10 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM20 17l-3.5-3.5L9 21",
    x: "M18 6L6 18M6 6l12 12",
    download: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3",
    refresh: "M3 12a9 9 0 0115.5-6.36L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.36L3 16M3 21v-5h5",
    rotate: "M3 12a9 9 0 109-9 9 9 0 00-6.36 2.64L3 8M3 3v5h5",
    check: "M20 6L9 17l-5-5",
    checkCircle: "M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3",
    xCircle: "M12 22a10 10 0 100-20 10 10 0 000 20zM15 9l-6 6M9 9l6 6",
    alertTriangle: "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01",
    alertCircle: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 8v4M12 16h.01",
    save: "M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8",
    chevronLeft: "M15 18l-6-6 6-6",
    chevronRight: "M9 18l6-6-6-6",
    hash: "M4 9h16M4 15h16M10 3L8 21M16 3l-2 18",
    home: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    award: "M12 15a7 7 0 100-14 7 7 0 000 14zM8.21 13.89L7 23l5-3 5 3-1.21-9.12",
    message: "M21 11.5a8.38 8.38 0 01-9 8.4 8.5 8.5 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 0117 0z",
    settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
    heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0016.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 002 8.5c0 2.3 1.5 4.05 3 5.5l7 7z",
    house: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z",
    baby: "M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M19 6.3a9 9 0 01-8 8.7 9 9 0 01-8-8.7",
    scroll: "M8 21h12a2 2 0 002-2v-2H10v2a2 2 0 11-4 0V5a2 2 0 10-4 0v3h4M19 17V5a2 2 0 00-2-2H8",
  };
  UI.icon = function (name, size) {
    const d = P[name];
    const s = size || 18;
    if (!d) return "";
    return (
      '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' +
      d.split("M").filter(Boolean).map(function (seg) { return '<path d="M' + seg + '"/>'; }).join("") +
      "</svg>"
    );
  };

  global.addEventListener("hashchange", UI.mount);
})(window);
