/* ui/portal.js — government portal chrome + screens (Home / Login / Flow / Confirm) and
 * the standalone Verify screen. Registers routes and wires each after mount.
 * Faithful re-skin of the React branch; the validator (ui/verify.js) and the
 * API/engine logic are reused unchanged. */
(function (global) {
  "use strict";
  const UI = (global.UI = global.UI || {});
  const esc = UI.esc;
  const icon = UI.icon;

  // ---------- shared chrome ----------
  function emblem() {
    return (
      '<svg class="emblem" viewBox="0 0 52 52" aria-hidden="true">' +
      '<circle cx="26" cy="26" r="25" fill="#0E4F4A" stroke="#fff" stroke-width="1.5"/>' +
      '<circle cx="26" cy="20" r="5" fill="#E47B1C"/>' +
      '<path d="M8 40 L20 24 L28 34 L34 26 L44 40 Z" fill="#fff" opacity="0.92"/>' +
      '<text x="26" y="49" text-anchor="middle" fill="#fff" font-size="6" font-family="Mukta">उ.ना. 2024</text>' +
      "</svg>"
    );
  }

  // Drop the official state emblem at assets/hp-emblem.png; falls back to the placeholder SVG until then.
  function brandEmblem() {
    return (
      '<img class="emblem-img" src="assets/hp-emblem.png" alt="Government of Himachal Pradesh emblem" ' +
      "onerror=\"this.outerHTML=this.dataset.fallback\" data-fallback='" + emblem().replace(/'/g, "&#39;") + "'>"
    );
  }

  function govUtility() {
    return (
      '<div class="gov-utility">' +
      "<span>Email: helpdesk[at]himachal-demo[dot]in</span>" +
      '<span class="acc">Accessibility:' + accButtons() + "</span>" +
      "</div>"
    );
  }
  function accButtons() {
    return (
      '<button data-scale="0.875" style="font-size:10px">A−</button>' +
      '<button data-scale="1" aria-pressed="true" style="font-size:11px">A</button>' +
      '<button data-scale="1.125" style="font-size:12px">A+</button>'
    );
  }

  function govHeader(variant) {
    const right =
      variant === "app"
        ? '<span class="welcome">Welcome, Demo User <a href="#/home">← Home</a></span>'
        : '<nav class="gov-nav"><a href="#/home">Home</a><a href="#/home">About Us</a>' +
          '<a href="#/home">Services</a><a href="#/home">Download Acts</a><a href="#/home">FAQs</a>' +
          '<a href="#/login" class="btn-login">Login</a></nav>';
    return (
      '<header class="gov-header"><div class="inner">' +
      '<a class="gov-brand" href="#/home">' + brandEmblem() +
      "<div><div class='title-hi'>HimParivar</div>" +
      "<div class='title-en'>Government of Himachal Pradesh</div></div></a>" +
      right +
      "</div></header>"
    );
  }

  function homeIllustration() {
    return (
      '<svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid slice" style="display:block;width:100%;height:auto">' +
      '<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#C5E8E4"/><stop offset="1" stop-color="#E8F5F3"/></linearGradient></defs>' +
      '<rect width="400" height="280" fill="url(#sky)"/>' +
      '<polygon points="0,200 120,90 220,200" fill="#1C6B68" opacity="0.85"/>' +
      '<polygon points="150,200 260,110 400,200" fill="#15706B" opacity="0.7"/>' +
      '<rect x="150" y="150" width="100" height="60" fill="#fff" stroke="#134E4A"/>' +
      '<polygon points="150,150 200,120 250,150" fill="#134E4A"/>' +
      '<rect x="165" y="165" width="10" height="45" fill="#134E4A"/>' +
      '<rect x="195" y="165" width="10" height="45" fill="#134E4A"/>' +
      '<rect x="225" y="165" width="10" height="45" fill="#134E4A"/>' +
      '<text x="200" y="150" text-anchor="middle" fill="#A52714" opacity="0.08" font-size="60" font-family="Poppins" transform="rotate(-12 200 150)">DEMO</text>' +
      '<rect x="0" y="240" width="400" height="40" fill="#E47B1C" opacity="0.92"/>' +
      '<text x="200" y="266" text-anchor="middle" fill="#fff" font-size="13" font-family="Mukta">हिमाचल प्रदेश सरकार · Government of Himachal Pradesh</text>' +
      "</svg>"
    );
  }

  // ---------- screens ----------
  function homeScreen() {
    return (
      '<div class="portal">' + govUtility() + govHeader("public") +
      '<div class="wrap"><section class="hero">' +
      '<div class="illus">' + homeIllustration() + "</div>" +
      '<div class="hero-copy">' +
      '<div class="eyebrow">Introducing the Citizen Portal</div>' +
      "<h1>Civil Registration &amp; Verification</h1>" +
      "<p>A single, transparent portal for registrations and document verification for the Government of Himachal Pradesh. This is a demonstration environment.</p>" +
      '<div class="cta"><a class="btn btn-teal" href="#/login">Apply Now ' + icon("chevronRight", 16) + "</a>" +
      '<a class="btn btn-teal-outline" href="#/login">Verify a Document</a></div>' +
      '<div class="demo-note">Demo only — no data is transmitted or stored.</div>' +
      "</div></section>" +
      "</div></div>"
    );
  }

  function loginScreen() {
    return (
      '<div class="portal">' + govUtility() + govHeader("public") +
      '<div class="login-wrap"><div class="login-card">' +
      '<div class="head"><h2>Sign In to the Portal</h2><p>Demo access — no credentials required.</p></div>' +
      '<div class="notice">' + icon("alertCircle", 16) +
      "<span>This is a demonstration. Sign-in is simulated; no real authentication is performed. API credentials for verification live in the Connection panel (bottom-right).</span></div>" +
      '<div class="body"><button id="loginBtn" class="btn btn-teal" style="justify-content:center">Login ' + icon("chevronRight", 16) + "</button></div>" +
      "</div></div></div>"
    );
  }

  function sidebar() {
    const items = [
      { ico: "home", t: "Home", href: "#/home" },
      { ico: "fileText", t: "Drafts", badge: "1" },
      { ico: "grid", t: "Services", href: "#/flow", active: true },
      { ico: "award", t: "Certificates" },
      { ico: "message", t: "Clarifications", badge: "0", zero: true },
      { ico: "settings", t: "Settings" },
    ];
    return (
      '<aside class="gov-sidebar"><nav>' +
      items
        .map(function (it) {
          return (
            '<a class="' + (it.active ? "active" : "") + '" href="' + (it.href || "#/flow") + '">' +
            icon(it.ico, 16) + "<span>" + it.t + "</span>" +
            (it.badge ? '<span class="badge ' + (it.zero ? "zero" : "") + '">' + it.badge + "</span>" : "") +
            "</a>"
          );
        })
        .join("") +
      "</nav>" +
      '<div class="who"><span class="av">D</span><div><div style="font-weight:600">Demo User</div>' +
      '<div style="color:var(--p-subtle);font-size:11px">HP-260610-00121</div></div></div></aside>'
    );
  }

  function flowContent() {
    return (
      "<h2>Upload &amp; verify</h2>" +
      '<p class="sub">Upload each document in its own box, run the intake checks, then submit them for forensic analysis.</p>' +
      UI.verify.panelHTML() +
      '<div id="flowBanner"></div>'
    );
  }

  function flowScreen() {
    const crumb = '<div class="breadcrumb"><a href="#/home">Home</a> › <a href="#/flow">Document Verification</a></div>';
    const footer =
      '<div class="gov-footer">' +
      '<button class="btn btn-ghost" id="flowSave">' + icon("save", 14) + " Save</button>" +
      '<div class="right">' +
      '<button class="btn-submit" id="flowSubmit" disabled>Submit ' + icon("chevronRight", 14) + "</button>" +
      "</div></div>";
    return (
      '<div class="portal flow">' + govHeader("app") +
      '<div class="flow-body">' + sidebar() +
      '<div class="flow-main">' + crumb +
      '<div class="flow-content" id="flowContent">' + flowContent() + "</div>" +
      footer + "</div></div></div>"
    );
  }

  function confirmScreen() {
    const c = UI.store.confirm;
    if (!c) {
      return (
        '<div class="portal">' + govHeader("app") +
        '<div class="confirm-wrap"><p>No submission found. <a href="#/flow">Start a verification</a>.</p></div></div>'
      );
    }
    const ok = c.decision === "accepted";
    const bigIco = ok
      ? '<span style="color:var(--p-teal)">' + icon("checkCircle", 64) + "</span>"
      : '<span style="color:var(--p-danger)">' + icon("xCircle", 64) + "</span>";
    return (
      '<div class="portal">' + govHeader("app") +
      '<div class="confirm-wrap">' + bigIco +
      "<h1>" + (ok ? "Verification Submitted" : "Verification Failed") + "</h1>" +
      "<p>" + (ok
        ? "Your document passed intake and the forensic job has started. You may safely leave this page — analysis continues on the server."
        : "The document did not pass intake checks. Please recapture and try again.") + "</p>" +
      '<div class="ref-card">' +
      '<div class="head"><div class="k">Verification Reference</div><div class="v">' + esc(c.ref) + "</div></div>" +
      row("Document", esc(c.fileName) + (c.fileCount > 1 ? " (+" + (c.fileCount - 1) + " more)" : "")) +
      row("Job ID", esc(c.jobId)) +
      '<div class="row"><span class="k">Verdict</span><span class="v chip">' + (ok ? "ACCEPTED" : "REJECTED") + "</span></div>" +
      row("Checks Passed", c.passed + " of " + c.total) +
      row("Confidence", c.confidence + "%") +
      row("Verified On", esc(c.verifiedOn)) +
      row("Model", "DocGPU v1") +
      "</div>" +
      '<div class="cta" style="justify-content:center;flex-wrap:wrap">' +
      '<button class="btn btn-teal-outline" id="cfReport">View forensic report</button>' +
      '<button class="btn btn-teal-outline" id="cfCompliance">View Compliance Report</button>' +
      '<button class="btn btn-teal-outline" id="cfJson">Download intake JSON</button>' +
      '<a class="btn btn-teal-outline" href="#/flow">Verify Another</a>' +
      '<a class="btn btn-teal" href="#/home">Return Home</a>' +
      "</div>" +
      '<div id="cfReportArea" style="width:100%"></div>' +
      "</div></div>"
    );
  }
  function row(k, v) {
    return '<div class="row"><span class="k">' + k + '</span><span class="v">' + v + "</span></div>";
  }

  function verifyScreen() {
    return (
      '<div class="validator">' +
      '<div class="v-utility"><span>DEMO ENVIRONMENT · build a1f9c3</span>' +
      '<span class="acc">' + accButtons() + '<span class="status"><span class="dot"></span>Model online</span></span></div>' +
      '<div class="v-header"><div class="brand"><span class="mark"><i></i><i></i></span>Reagvis <b>Verify</b></div>' +
      '<span class="pill">DocGPU v1</span></div>' +
      '<div class="title-block"><div class="eyebrow">Document Verification</div>' +
      "<h1>Document verification</h1>" +
      '<p class="sub">Upload a document to run 16 checks and get a pass/fail verdict with reasons.</p></div>' +
      UI.verify.panelHTML() +
      "</div>"
    );
  }

  // ---------- routes ----------
  UI.route("home", homeScreen);
  UI.route("login", loginScreen);
  UI.route("flow", flowScreen);
  UI.route("confirm", confirmScreen);
  UI.route("verify", verifyScreen);

  // ---------- after-mount wiring ----------
  function wireAcc(root) {
    (root || document).querySelectorAll(".acc button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.documentElement.style.fontSize = 16 * Number(b.getAttribute("data-scale")) + "px";
        const group = b.parentElement;
        group.querySelectorAll("button").forEach(function (x) { x.removeAttribute("aria-pressed"); });
        b.setAttribute("aria-pressed", "true");
      });
    });
  }

  function updateFlowVerdictUI() {
    const banner = document.getElementById("flowBanner");
    const submit = document.getElementById("flowSubmit");
    const v = UI.verify.state.verdict;
    if (submit) submit.disabled = !UI.verify.canSubmit();
    if (!banner) return;
    if (!v) { banner.innerHTML = ""; return; }
    const s = UI.verify.state.primary ? UI.verify.computeSummaryPublic() : null;
    const stat = s ? s.pass + "/" + s.total + " checks passed · confidence " + s.confidence + "%" : "";
    if (v === "accepted") {
      banner.innerHTML =
        '<div class="verdict-banner ok">' + icon("checkCircle", 18) +
        "<span><b>Document accepted</b> — click Submit to send it for forensic analysis. " + stat + "</span></div>";
    } else {
      banner.innerHTML =
        '<div class="verdict-banner bad">' + icon("alertTriangle", 18) +
        "<span><b>Document rejected</b> — recapture and retry. " + stat + "</span></div>";
    }
  }

  function wireFlow() {
    const save = document.getElementById("flowSave");
    if (save) save.addEventListener("click", function () { global.log && global.log("Draft saved (demo no-op)."); });

    UI.verify.wire();
    UI.verify.rehydrate();
    UI.verify.onVerdict = function () { updateFlowVerdictUI(); };
    updateFlowVerdictUI();
    const submit = document.getElementById("flowSubmit");
    if (submit) submit.addEventListener("click", async function () {
      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span> Submitting…';
      const res = await UI.verify.submit();
      if (res.ok) UI.navigate("confirm");
      else {
        submit.innerHTML = "Submit " + icon("chevronRight", 14);
        submit.disabled = !UI.verify.canSubmit();
        const banner = document.getElementById("flowBanner");
        if (banner) {
          banner.innerHTML =
            '<div class="verdict-banner bad">' + icon("alertTriangle", 18) +
            "<span><b>Couldn't submit.</b> " + esc(res.message || "Submission failed.") + "</span></div>";
        }
      }
    });
  }

  function wireConfirm() {
    const jsonBtn = document.getElementById("cfJson");
    if (jsonBtn) jsonBtn.addEventListener("click", function () { UI.verify.downloadReportJson(); });
    const repBtn = document.getElementById("cfReport");
    const compBtn = document.getElementById("cfCompliance");
    const area = document.getElementById("cfReportArea");
    if (compBtn && area) {
      compBtn.addEventListener("click", function () {
        compBtn.disabled = true;
        compBtn.textContent = "Compliance loaded";
        const html = UI.verify.prepareComplianceReport();
        area.innerHTML =
          '<div style="display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap;margin:12px 0">' +
          '<button class="btn btn-teal-outline" id="cfCompliancePrint">Open printable compliance report</button>' +
          '<span style="color:var(--p-subtle);font-size:12px">Static NAAC/NBA demo report, generated locally for this submission.</span></div>' +
          '<iframe class="report-frame" srcdoc="' + esc(html) + '"></iframe>';
        const pr = document.getElementById("cfCompliancePrint");
        if (pr) pr.addEventListener("click", function () { UI.verify.openPrintableCompliance(); });
      });
    }
    if (repBtn && area) {
      repBtn.addEventListener("click", async function () {
        repBtn.disabled = true;
        repBtn.textContent = "Fetching report…";
        area.innerHTML = '<div class="indet" style="margin:16px 0"><i></i></div>' +
          '<p style="color:var(--p-subtle);font-size:13px">Polling the forensic job (up to 2 min)…</p>';
        const res = await UI.verify.fetchForensicReport(function (st) {
          if (st === "poll") area.querySelector("p").textContent = "Polling… still processing.";
          if (st === "pending") area.querySelector("p").textContent = "The job is accepted but still pending tenant-visible completion.";
        });
        if (res.ok) {
          area.innerHTML =
            '<div style="display:flex;gap:10px;justify-content:center;margin:12px 0">' +
            '<button class="btn btn-teal-outline" id="cfPrint">Open printable report</button></div>' +
            '<iframe class="report-frame" srcdoc="' + esc(global.ReagvisState.reportHtml || "") + '"></iframe>';
          const pr = document.getElementById("cfPrint");
          if (pr) pr.addEventListener("click", function () { UI.verify.openPrintable(); });
          repBtn.textContent = "Report loaded";
        } else {
          var isPending = res.reason === "still-processing";
          area.innerHTML = '<p style="color:' + (isPending ? 'var(--p-subtle)' : 'var(--p-danger)') + '">Report not ready (job ' +
            ((res.job && res.job.status) || "unavailable") + "). " +
            (isPending ? "The job was submitted successfully; try again later with the same job ID." : "Try again shortly.") +
            "</p>";
          repBtn.disabled = false;
          repBtn.textContent = "View forensic report";
        }
      });
    }
  }

  UI.afterMount = function (name) {
    wireAcc(document);
    if (name === "login") {
      const b = document.getElementById("loginBtn");
      if (b) b.addEventListener("click", function () { UI.navigate("flow"); });
    } else if (name === "flow") {
      wireFlow();
    } else if (name === "confirm") {
      wireConfirm();
    } else if (name === "verify") {
      UI.verify.wire();
      UI.verify.rehydrate();
    }
  };

  // ---------- boot ----------
  function boot() {
    if (!global.location.hash) global.location.hash = "#/home";
    UI.mount();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(window);
