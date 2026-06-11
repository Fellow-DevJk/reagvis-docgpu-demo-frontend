/* ui/verify.js — the Reagvis Verify validator UI.
 * Renders the upload card, the per-check report (grouped exactly like the branch
 * design), and the verdict stamp — all driven by the REAL ReagvisIntake engine.
 * Submit runs the REAL API pipeline (presign/upload/submit) from app.js; the
 * forensic report (poll/fetch/printable) is offered as an optional follow-up. */
(function (global) {
  "use strict";
  const UI = (global.UI = global.UI || {});
  const V = (UI.verify = {});

  // Map the engine's 16 checks into the 4 display groups (ids match app config).
  const GROUPS = [
    { label: "File Integrity", ids: ["size", "format", "signature", "corruption", "password"] },
    { label: "Readability", ids: ["ocr", "blank"] },
    { label: "Capture Quality", ids: ["blur", "shadow", "glare", "resolution", "skew", "brightness", "noise"] },
    { label: "Content & Authenticity", ids: ["screenshot", "occlusion"] },
  ];
  const STATUS_CLASS = { pass: "st-pass", fail: "st-fail", skip: "st-skip", na: "st-na" };
  const STATUS_GLYPH = { pass: "✓", fail: "✗", skip: "–", na: "–" };
  const STATUS_BADGE = { pass: "PASS", fail: "FAIL", skip: "SKIP", na: "—" };

  V.state = {
    files: [],
    overall: null, // ReagvisIntake overall result
    primary: null, // first file's result (the one rendered)
    running: false,
    verdict: null, // 'accepted' | 'rejected'
    submitting: false,
    submitted: false,
  };
  V.onVerdict = null; // portal hook: called with the verdict object

  // ---------- markup ----------
  V.panelHTML = function () {
    return (
      '<div class="v-split">' +
      '  <div class="v-left">' +
      '    <div class="upload-card">' +
      '      <div id="vDrop" class="dropzone" role="button" tabindex="0">' +
      '        <span style="color:var(--muted)">' + UI.icon("uploadCloud", 24) + "</span>" +
      '        <span class="big">Drag &amp; drop or click to browse</span>' +
      '        <span class="small">PDF, JPG, PNG · max 10 files</span>' +
      '        <input id="vFiles" type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style="display:none" />' +
      "      </div>" +
      '      <div id="vFileList" class="file-list"></div>' +
      '      <button id="vRun" class="run-btn" disabled>Run verification</button>' +
      "    </div>" +
      '    <div id="vPreview"></div>' +
      "  </div>" +
      '  <div class="v-right"><div id="vReport"></div></div>' +
      "</div>"
    );
  };

  V.emptyReportHTML = function () {
    return '<div class="report-empty">Upload a document and run verification to see the 16-point report and a pass/fail verdict.</div>';
  };

  // ---------- wiring ----------
  V.wire = function () {
    const drop = document.getElementById("vDrop");
    const input = document.getElementById("vFiles");
    const run = document.getElementById("vRun");
    const report = document.getElementById("vReport");
    if (!drop || !input || !run) return;
    report.innerHTML = V.emptyReportHTML();

    drop.addEventListener("click", function () { input.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("drag"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("drag");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) setFiles(e.dataTransfer.files);
    });
    input.addEventListener("change", function () { setFiles(input.files); });
    run.addEventListener("click", runValidation);
  };

  function setFiles(fileList) {
    V.state.files = Array.prototype.slice.call(fileList || []).slice(0, 10);
    V.state.overall = null;
    V.state.primary = null;
    V.state.verdict = null;
    V.state.submitted = false;
    renderFileList();
    renderPreview();
    const run = document.getElementById("vRun");
    if (run) run.disabled = V.state.files.length === 0;
    const report = document.getElementById("vReport");
    if (report) report.innerHTML = V.emptyReportHTML();
    notifyVerdict();
  }

  function renderFileList() {
    const el = document.getElementById("vFileList");
    if (!el) return;
    el.innerHTML = V.state.files
      .map(function (f, i) {
        const isImg = /\.(jpg|jpeg|png)$/i.test(f.name);
        const ext = (f.name.split(".").pop() || "").toUpperCase();
        return (
          '<div class="file-chip">' +
          '<span class="tile">' + UI.icon(isImg ? "fileImage" : "fileText", 16) + "</span>" +
          '<span class="nm" title="' + UI.esc(f.name) + '">' + UI.esc(f.name) + "</span>" +
          '<span class="meta">' + UI.prettyBytes(f.size) + " · " + UI.esc(ext) + "</span>" +
          '<button class="x" data-i="' + i + '" aria-label="Remove">' + UI.icon("x", 14) + "</button>" +
          "</div>"
        );
      })
      .join("");
    el.querySelectorAll(".x").forEach(function (b) {
      b.addEventListener("click", function () {
        const i = Number(b.getAttribute("data-i"));
        const arr = V.state.files.slice();
        arr.splice(i, 1);
        const dt = new DataTransfer();
        arr.forEach(function (f) { dt.items.add(f); });
        setFiles(dt.files);
      });
    });
  }

  function renderPreview() {
    const el = document.getElementById("vPreview");
    if (!el) return;
    if (V.previewUrl) { URL.revokeObjectURL(V.previewUrl); V.previewUrl = null; }
    if (!V.state.files.length) { el.innerHTML = ""; return; }
    const f = V.state.files[0];
    V.previewUrl = URL.createObjectURL(f);
    const isPdf = /\.pdf$/i.test(f.name);
    el.innerHTML =
      '<div id="vPreviewCard" class="doc-preview">' +
      '  <div class="ph"><span>Document preview</span></div>' +
      '  <div class="body">' +
      (isPdf
        ? '<iframe src="' + V.previewUrl + '#toolbar=0"></iframe>'
        : '<img src="' + V.previewUrl + '" alt="preview" />') +
      '    <div class="scanline"></div>' +
      "  </div>" +
      "</div>";
  }

  function setAnalyzing(on) {
    const card = document.getElementById("vPreviewCard");
    if (card) card.classList.toggle("analyzing", !!on);
  }

  async function runValidation() {
    if (!V.state.files.length || V.state.running) return;
    if (!global.ReagvisIntake) {
      document.getElementById("vReport").innerHTML =
        '<div class="report-empty">Validation engine failed to load. Check your connection and reload.</div>';
      return;
    }
    V.state.running = true;
    const run = document.getElementById("vRun");
    run.disabled = true;
    run.innerHTML = '<span class="spinner"></span> Analyzing…';
    setAnalyzing(true);
    document.getElementById("vReport").innerHTML = analyzingHTML();

    try {
      const overall = await global.ReagvisIntake.validate(V.state.files, {
        stage: function () {},
        fileResult: function () {},
        overall: function () {},
      });
      V.state.overall = overall;
      V.state.primary = (overall.files && overall.files[0]) || null;
      V.state.verdict = overall.status === "passed" ? "accepted" : "rejected";
      if (V.state.primary && V.state.primary.debug) {
        console.debug("[intake]", V.state.primary.name, V.state.primary.debug);
      }
      renderResults();
    } catch (err) {
      console.error("[verify] validation error", err);
      document.getElementById("vReport").innerHTML =
        '<div class="report-empty">Intake validation could not complete. Please re-select the document.</div>';
    } finally {
      V.state.running = false;
      setAnalyzing(false);
      run.disabled = false;
      run.textContent = "Run verification";
      notifyVerdict();
    }
  }

  function analyzingHTML() {
    return (
      '<div class="indet"><i></i></div>' +
      '<div class="report-empty">Running 16 checks (decode · image quality · readability)…</div>'
    );
  }

  // ---------- results rendering (faithful to the branch design) ----------
  function checksById(result) {
    const m = {};
    (result.checks || []).forEach(function (c) { m[c.id] = c; });
    return m;
  }

  function computeSummary() {
    const result = V.state.primary;
    const checks = (result && result.checks) || [];
    let pass = 0, fail = 0, other = 0;
    checks.forEach(function (c) {
      if (c.status === "pass") pass++;
      else if (c.status === "fail") fail++;
      else other++;
    });
    const total = checks.length || 16;
    const confidence = Math.max(5, Math.min(99, 100 - fail * 12 - other * 2));
    const ref = V.state.ref || (V.state.ref = makeRef());
    return { pass: pass, fail: fail, other: other, total: total, confidence: confidence, ref: ref };
  }

  function makeRef() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, "0"); };
    const rand = String(Math.floor(Math.random() * 100000)).padStart(5, "0");
    return "RV-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + rand;
  }

  function renderResults() {
    const report = document.getElementById("vReport");
    const result = V.state.primary;
    if (!report || !result) return;
    const s = computeSummary();
    const accepted = V.state.verdict === "accepted";
    const fileName = result.name || (V.state.files[0] && V.state.files[0].name) || "document";
    const multi = (V.state.overall.files || []).length > 1;
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");

    const stamp =
      '<div class="verdict-header">' +
      '  <div class="stamp' + (accepted ? "" : " bad") + '">' +
      '    <span class="word">' + (accepted ? "ACCEPTED" : "REJECTED") + "</span>" +
      '    <span class="ref">REF ' + UI.esc(s.ref) + " · DocGPU v1 · " + hhmm + " · " + s.pass + "/" + s.total + " PASS</span>" +
      "  </div>" +
      '  <div class="verdict-meta">' +
      '    <div><span class="fn">' + UI.esc(fileName) + (multi ? " <span class='meta'>(+" + ((V.state.overall.files.length) - 1) + " more)</span>" : "") + "</span><br>" +
      '      <span class="sentence">' + UI.esc(headlineSentence(result, accepted, s)) + "</span></div>" +
      '    <div class="conf">confidence <b>' + s.confidence + "%</b></div>" +
      "  </div>" +
      "</div>";

    const summaryBar =
      '<div class="summary-bar">' +
      '<i class="p" style="width:' + (s.pass / s.total) * 100 + '%"></i>' +
      '<i class="f" style="width:' + (s.fail / s.total) * 100 + '%"></i>' +
      '<i class="s" style="width:' + (s.other / s.total) * 100 + '%"></i>' +
      "</div>";

    const byId = checksById(result);
    let rowIndex = 0;
    const groups = GROUPS.map(function (g) {
      const rows = g.ids
        .map(function (id) {
          const c = byId[id];
          if (!c) return "";
          rowIndex++;
          return checkRowHTML(c, rowIndex);
        })
        .join("");
      const passed = g.ids.filter(function (id) { return byId[id] && byId[id].status === "pass"; }).length;
      return (
        '<div class="check-group">' +
        '  <div class="ghead"><span class="lbl">' + UI.esc(g.label) + '</span><span class="rule"></span>' +
        '    <span class="cnt">' + passed + "/" + g.ids.length + "</span></div>" +
        rows +
        "</div>"
      );
    }).join("");

    const footer =
      '<div class="report-footer">' +
      '  <div class="left">' +
      '    <button id="vDownloadIntake" class="fbtn">' + UI.icon("download", 14) + " Download intake JSON</button>" +
      '    <button id="vRerun" class="fbtn ghost">' + UI.icon("refresh", 14) + " Re-run</button>" +
      "  </div>" +
      "</div>";

    report.innerHTML = stamp + summaryBar + '<div class="report-groups">' + groups + "</div>" + footer;

    const dl = document.getElementById("vDownloadIntake");
    if (dl) dl.addEventListener("click", downloadIntakeJson);
    const rr = document.getElementById("vRerun");
    if (rr) rr.addEventListener("click", runValidation);
  }

  function headlineSentence(result, accepted, s) {
    if (accepted) return "Accepted. " + s.pass + " of " + s.total + " checks passed.";
    return (result.headline || "Rejected.") + " " + s.fail + " check(s) failed.";
  }

  function checkRowHTML(c, idx) {
    const cls = STATUS_CLASS[c.status] || "st-na";
    const reason =
      c.status === "fail" && c.message
        ? '<div class="reason">— ' + UI.esc(c.message) + "</div>"
        : "";
    return (
      '<div class="check-row" style="animation-delay:' + idx * 24 + 'ms">' +
      '  <div class="line">' +
      '    <span class="glyph ' + cls + '">' + (STATUS_GLYPH[c.status] || "–") + "</span>" +
      '    <span class="name">' + c.n + ". " + UI.esc(c.label) + "</span>" +
      '    <span class="leader"></span>' +
      '    <span class="metric">' + UI.esc(c.detail || "—") + "</span>" +
      '    <span class="badge ' + cls + '">' + (STATUS_BADGE[c.status] || "—") + "</span>" +
      "  </div>" +
      reason +
      "</div>"
    );
  }

  function notifyVerdict() {
    if (typeof V.onVerdict === "function") {
      V.onVerdict(V.state.verdict, computeSummarySafe());
    }
  }
  function computeSummarySafe() {
    if (!V.state.primary) return null;
    return computeSummary();
  }
  V.computeSummaryPublic = computeSummarySafe;

  // Re-render the panel from current state (used when returning to a screen so
  // the file list / preview / results survive navigation away and back).
  V.rehydrate = function () {
    if (!V.state.files.length) return;
    renderFileList();
    renderPreview();
    const run = document.getElementById("vRun");
    if (run) run.disabled = V.state.running;
    if (V.state.primary) renderResults();
  };

  function downloadIntakeJson() {
    const data = {
      verdict: V.state.verdict,
      overall: V.state.overall,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reagvis-intake-" + (V.state.ref || "result") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- submit (REAL API pipeline from app.js) ----------
  V.canSubmit = function () {
    return V.state.verdict === "accepted" && !V.state.submitting;
  };

  V.submit = async function () {
    if (V.state.verdict !== "accepted") {
      global.log && global.log("Submit blocked: intake validation has not passed.");
      return { ok: false, reason: "not-passed" };
    }
    if (!UI.hasCredentials()) {
      UI.openConnection();
      global.log && global.log("Enter API Base URL + Bearer Token in the Connection panel to submit.");
      return { ok: false, reason: "no-credentials" };
    }
    const conn = UI.getConnection();
    const jobId = conn.jobId || global.makeJobId();
    const jobInput = document.getElementById("jobId");
    if (jobInput) jobInput.value = jobId;

    V.state.submitting = true;
    global.setStatus && global.setStatus("Uploading", "warn");
    try {
      const docs = [];
      for (let i = 0; i < V.state.files.length; i++) {
        const file = V.state.files[i];
        const sign = await global.presign(conn.apiBase, conn.bearer, conn.originVerify, file, jobId);
        const uri = await global.uploadOne(file, sign);
        docs.push(uri);
      }
      global.setStatus && global.setStatus("Submitting", "warn");
      const submitResp = await global.submitJob(conn.apiBase, conn.bearer, conn.originVerify, jobId, docs);
      global.log && global.log("Forensic job submitted — you may safely leave this page.", submitResp);
      global.setStatus && global.setStatus("Submitted", "ok");

      const s = computeSummary();
      UI.store.confirm = {
        decision: V.state.verdict,
        ref: s.ref,
        jobId: jobId,
        fileName: (V.state.files[0] && V.state.files[0].name) || "document",
        fileCount: V.state.files.length,
        passed: s.pass,
        total: s.total,
        confidence: s.confidence,
        verifiedOn: new Date().toLocaleString(),
        conn: conn,
      };
      V.state.submitting = false;
      V.state.submitted = true;
      return { ok: true, jobId: jobId };
    } catch (err) {
      V.state.submitting = false;
      global.setStatus && global.setStatus("Error", "bad");
      global.log && global.log("Submit error:", String(err));
      if (err && err.details) global.log && global.log("Error details:", err.details);
      return { ok: false, reason: "error", error: err };
    }
  };

  // ---------- optional forensic report (poll + fetch + render) ----------
  V.fetchForensicReport = async function (onState) {
    const c = UI.store.confirm;
    if (!c) return { ok: false };
    const conn = c.conn || UI.getConnection();
    onState && onState("polling");
    global.setStatus && global.setStatus("Processing", "warn");
    let last = null;
    for (let i = 0; i < 120; i++) {
      await new Promise(function (r) { setTimeout(r, 5000); });
      last = await global.pollJob(conn.apiBase, conn.bearer, conn.originVerify, c.jobId);
      onState && onState("poll", last);
      if (last.status === "COMPLETED" || last.status === "FAILED") break;
    }
    if (!last || last.status !== "COMPLETED") {
      global.setStatus && global.setStatus(String((last && last.status) || "FAILED"), "bad");
      onState && onState("failed", last);
      return { ok: false, job: last };
    }
    const report = await global.fetchReport(conn.apiBase, conn.bearer, conn.originVerify, c.jobId, false);
    await global.handleFetchedReport(report); // sets ReagvisState.reportHtml
    global.setStatus && global.setStatus("Completed", "ok");
    onState && onState("ready", report);
    return { ok: true, report: report };
  };

  V.openPrintable = function () { global.openPrintableReport && global.openPrintableReport(); };
  V.downloadReportJson = function () { global.downloadReportJson && global.downloadReportJson(); };
})(window);
