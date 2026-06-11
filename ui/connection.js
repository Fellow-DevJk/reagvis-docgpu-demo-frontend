/* ui/connection.js — Dev Controls / Connection panel.
 * Holds the runtime-only API settings (base URL, bearer, x-origin-verify, job id)
 * the API core reads. Nothing is persisted (no localStorage/cookies) — the bearer
 * token lives only in the input for this session. */
(function (global) {
  "use strict";
  const UI = (global.UI = global.UI || {});
  const $ = (id) => document.getElementById(id);

  UI.getConnection = function () {
    return {
      apiBase: ($("apiBase") && $("apiBase").value.trim().replace(/\/$/, "")) || "",
      bearer: ($("bearer") && $("bearer").value.trim()) || "",
      originVerify: ($("originVerify") && $("originVerify").value.trim()) || "",
      jobId: ($("jobId") && $("jobId").value.trim()) || "",
    };
  };

  UI.hasCredentials = function () {
    const c = UI.getConnection();
    return Boolean(c.apiBase && c.bearer);
  };

  UI.openConnection = function () {
    const p = $("devPanel");
    if (p) p.classList.remove("hidden");
  };

  function wire() {
    const trigger = $("devTrigger");
    const closeBtn = $("devClose");
    const panel = $("devPanel");
    if (trigger && panel) {
      trigger.addEventListener("click", function () {
        panel.classList.toggle("hidden");
      });
    }
    if (closeBtn && panel) {
      closeBtn.addEventListener("click", function () {
        panel.classList.add("hidden");
      });
    }
    const banner = $("demoBanner");
    const bClose = $("demoBannerClose");
    if (bClose && banner) {
      bClose.addEventListener("click", function () {
        banner.style.display = "none";
        document.getElementById("app").style.paddingBottom = "0";
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
})(window);
