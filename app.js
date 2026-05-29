const $ = (id) => document.getElementById(id);

const state = {
  lastJob: null,
  lastReport: null,
  reportHtml: "",
};

const logEl = $("log");
const jobJsonEl = $("jobJson");
const reportJsonEl = $("reportJson");
const reportFrame = $("reportFrame");
const statusPill = $("statusPill");

function log(...args) {
  const line = args
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2)))
    .join(" ");
  logEl.textContent += `${new Date().toISOString()}  ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(label, tone = "") {
  statusPill.textContent = label;
  statusPill.className = `pill ${tone}`.trim();
}

function makeJobId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `demo-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

function buildHeaders({ bearer, originVerify, json = false }) {
  const h = { authorization: bearer };
  if (originVerify.trim()) h["x-origin-verify"] = originVerify.trim();
  if (json) h["content-type"] = "application/json";
  return h;
}

function safeJson(v, fallback = {}) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function clampScore(v, min = 0, max = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function fmtPct(v) {
  return `${Math.round(clampScore(v))}%`;
}

function fmtIso(iso) {
  if (!iso) return "N/A";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function docNameFromKey(s3Key = "") {
  const clean = String(s3Key || "").split("/").pop() || "document";
  const noUuid = clean.replace(/^[0-9a-f]{8}-[0-9a-f-]{27,}\-/i, "");
  return noUuid || clean;
}

async function presign(apiBase, bearer, originVerify, file, jobId) {
  const resp = await fetch(`${apiBase}/uploads/presign`, {
    method: "POST",
    headers: buildHeaders({ bearer, originVerify, json: true }),
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", jobId }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) throw new Error(`presign failed (${resp.status}) ${txt}`);
  return data;
}

async function uploadOne(file, sign) {
  const headers = {
    "content-type": file.type || "application/octet-stream",
    ...(sign.requiredHeaders || {}),
  };
  const put = await fetch(sign.uploadUrl, {
    method: "PUT",
    headers,
    body: file,
  });
  if (!put.ok) throw new Error(`upload failed (${put.status}) ${await put.text()}`);

  if (typeof sign.s3Uri === "string" && sign.s3Uri.startsWith("s3://")) return sign.s3Uri;
  if (typeof sign.s3Key === "string" && sign.s3Key.startsWith("s3://")) return sign.s3Key;
  if (typeof sign.s3Key === "string" && sign.s3Key) {
    if (typeof sign.bucket === "string" && sign.bucket) return `s3://${sign.bucket}/${sign.s3Key}`;
    return sign.s3Key;
  }
  throw new Error("presign response missing s3 URI/key");
}

async function submitJob(apiBase, bearer, originVerify, jobId, docs) {
  const resp = await fetch(`${apiBase}/jobs`, {
    method: "POST",
    headers: buildHeaders({ bearer, originVerify, json: true }),
    body: JSON.stringify({ jobId, inputs: { documents: docs } }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) throw new Error(`submit failed (${resp.status}) ${txt}`);
  return data;
}

async function pollJob(apiBase, bearer, originVerify, jobId) {
  const resp = await fetch(`${apiBase}/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: buildHeaders({ bearer, originVerify }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) throw new Error(`poll failed (${resp.status}) ${txt}`);
  return data;
}

async function fetchReport(apiBase, bearer, originVerify, jobId, includeDownloadUrls = false) {
  const q = includeDownloadUrls ? "?includeDownloadUrls=1" : "";
  const resp = await fetch(`${apiBase}/jobs/${encodeURIComponent(jobId)}/report${q}`, {
    method: "GET",
    headers: buildHeaders({ bearer, originVerify }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) throw new Error(`report fetch failed (${resp.status}) ${txt}`);
  return data;
}

function verdictTone(verdict = "") {
  const v = String(verdict || "").toLowerCase();
  if (["authentic", "real", "approve", "approved"].includes(v)) return "ok";
  if (["suspicious", "review", "manual_review", "suspect"].includes(v)) return "warn";
  if (["reject", "fake", "likely fake", "likely_fake"].includes(v)) return "bad";
  return "na";
}

function scoreToVerdict(score) {
  const s = clampScore(score);
  if (s <= 35) return "Authentic";
  if (s <= 65) return "Suspicious";
  return "Likely Fake";
}

const reportStyles = String.raw`
  :root {
    --ink: #10213a;
    --muted: #5b6b82;
    --line: #cfd7e3;
    --line-strong: #96a5bd;
    --brand: #123b7a;
    --brand-2: #198b7a;
    --ok: #1f8f55;
    --warn: #c98714;
    --bad: #c23b3b;
    --na: #7d8796;
    --white: #ffffff;
    --card-teal-a: #0ea5b7;
    --card-teal-b: #19c6bf;
    --card-risk-a: #ff4b7d;
    --card-risk-b: #ff315f;
    --card-review-a: #ff9558;
    --card-review-b: #ff6a86;
    --card-safe-a: #14c99b;
    --card-safe-b: #09dd72;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: #dfe6ef;
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
  }
  .page {
    width: 100%;
    background: var(--white);
    padding: 24px 26px;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .header {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 20px;
    border-bottom: 1px solid var(--line-strong);
    padding-bottom: 16px;
  }
  .brand-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .logo {
    width: 52px;
    height: 52px;
    object-fit: contain;
    border-radius: 12px;
  }
  .brand-block h1 {
    margin: 0;
    font-size: 25px;
  }
  .brand-block .sub {
    margin-top: 6px;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.5;
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    align-content: start;
  }
  .meta-card {
    border: 1px solid rgba(0,0,0,0.07);
    background: linear-gradient(145deg, #ffffff 0%, #f5f8ff 100%);
    border-radius: 16px;
    padding: 16px 20px;
    position: relative;
    overflow: hidden;
  }
  .meta-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, #123b7a, #198b7a);
  }
  .meta-label {
    font-size: 9.5px;
    color: #9aa3b5;
    text-transform: uppercase;
    letter-spacing: 0.13em;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .meta-value {
    font-size: 14px;
    font-weight: 700;
    color: #0f1f3d;
    word-break: break-word;
  }
  .meta-value.mono {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 12px;
    color: #123b7a;
  }
  .summary-row {
    display: grid;
    grid-template-columns: 1.35fr .85fr .85fr .85fr;
    gap: 14px;
  }
  .summary-card {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px;
    background: #f9fbff;
  }
  .summary-card.primary {
    color: #fff;
    background: linear-gradient(135deg, var(--card-teal-a), var(--card-teal-b));
    box-shadow: 0 10px 22px rgba(14, 165, 183, 0.28);
  }
  .summary-title {
    font-size: 11px;
    letter-spacing: .12em;
    text-transform: uppercase;
    font-weight: 700;
    opacity: .82;
  }
  .summary-value {
    margin-top: 10px;
    font-size: 48px;
    line-height: 1;
    font-weight: 800;
  }
  .summary-card.primary .summary-value {
    font-size: 50px;
  }
  .summary-note {
    margin-top: 9px;
    font-size: 14px;
    line-height: 1.45;
    color: #44587c;
  }
  .summary-card.primary .summary-note {
    color: rgba(255,255,255,.95);
  }
  .subject-section {
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 16px;
    background: #fbfdff;
  }
  .section-heading {
    margin: 0;
    font-size: 34px;
    line-height: 1;
  }
  .section-subcopy {
    margin: 10px 0 14px;
    color: var(--muted);
    font-size: 14px;
  }
  .subject-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }
  .subject-card {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px;
    background: #fff;
  }
  .subject-label {
    font-size: 11px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #8c99ad;
  }
  .subject-value {
    margin-top: 7px;
    font-size: 31px;
    line-height: 1.06;
    font-weight: 800;
  }
  .subject-note {
    margin-top: 7px;
    font-size: 13px;
    color: var(--muted);
    line-height: 1.4;
  }
  .matrix-wrap {
    border: 1px solid var(--line);
    border-radius: 16px;
    background: #fff;
    overflow: hidden;
  }
  .matrix-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px;
    border-bottom: 1px solid var(--line);
  }
  .matrix-head h2 {
    margin: 0;
    font-size: 38px;
    line-height: 1;
  }
  .legend {
    display: flex;
    gap: 14px;
    color: #5f708b;
    font-size: 12px;
  }
  .chip {
    display: inline-flex;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    margin-right: 6px;
    border: 1px solid;
  }
  .chip.ok { color: var(--ok); border-color: var(--ok); }
  .chip.warn { color: var(--warn); border-color: var(--warn); }
  .chip.bad { color: var(--bad); border-color: var(--bad); }
  .chip.na { color: var(--na); border-color: var(--na); }
  .matrix-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0,1fr));
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
    background: #f9fbff;
  }
  .matrix-summary-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    background: #fff;
    padding: 10px;
  }
  .matrix-summary-label {
    font-size: 10px;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: #8e9cb2;
  }
  .matrix-summary-value {
    margin-top: 6px;
    font-size: 14px;
    font-weight: 800;
    color: #13284c;
  }
  .matrix-summary-note {
    margin-top: 5px;
    font-size: 12px;
    color: #647897;
    line-height: 1.35;
  }
  .matrix-scroll { overflow: auto; }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    min-width: 980px;
  }
  .matrix thead th {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: #f2f6fd;
    padding: 10px 8px;
    font-size: 12px;
    text-align: center;
    color: #23406f;
  }
  .matrix tbody th,
  .matrix tbody td {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 9px 6px;
    text-align: center;
    vertical-align: top;
    background: #fff;
  }
  .matrix tbody th {
    text-align: left;
    width: 230px;
    font-size: 14px;
    color: #162f58;
    background: #f9fbff;
  }
  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 700;
    border: 1px solid;
  }
  .status.ok { color: var(--ok); border-color: var(--ok); }
  .status.warn { color: var(--warn); border-color: var(--warn); }
  .status.bad { color: var(--bad); border-color: var(--bad); }
  .status.na { color: var(--na); border-color: var(--na); }
  .tiny {
    display: block;
    margin-top: 6px;
    font-size: 11px;
    color: #5f708b;
    line-height: 1.26;
  }
  .score {
    display: block;
    font-size: 22px;
    font-weight: 800;
    color: #113262;
  }
  .flagged-section {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 14px;
    background: #fff;
  }
  .flagged-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .flag {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px;
    background: #fbfdff;
  }
  .flag .f-name { font-size: 14px; font-weight: 800; }
  .flag .f-note { margin-top: 4px; font-size: 12px; color: #5e718f; }
  .bottom {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .note-box {
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 12px;
    background: #fff;
  }
  .note-box h3 {
    margin: 0;
    font-size: 20px;
  }
  .note-box ul {
    margin: 10px 0 0;
    padding-left: 18px;
    color: #1f3760;
    font-size: 13px;
    line-height: 1.5;
  }
  .note-box p {
    margin: 10px 0 0;
    color: #1f3760;
    font-size: 13px;
    line-height: 1.55;
  }
  .footer {
    border-top: 1px solid var(--line);
    margin-top: 6px;
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    color: #637896;
    font-size: 12px;
  }
`;

function buildReportHtml(report) {
  const op = report?.operator_view || {};
  const docs = Array.isArray(op.per_document) ? op.per_document : [];
  const scores = report?.scores || {};

  const overallRisk = clampScore(op.risk_score ?? (Number(scores.forensic_score || 0) * 100));
  const batchVerdict = String(op.batch_verdict || scoreToVerdict(overallRisk));
  const identityMatch = Number.isFinite(Number(op.identity_match_score)) ? fmtPct(op.identity_match_score) : "0%";

  const subjectIdentity = op?.subject_summary?.identity || {};
  const docSubmittedLabel = docs.length === 1 ? "1 file" : `${docs.length} files`;
  const docNames = docs.map((d) => docNameFromKey(d.s3_key)).join(", ");

  const executiveSummary =
    op?.analyst_notes ||
    op?.issue_check ||
    "Forensic policy output generated from uploaded document set.";

  const issueIds = Array.isArray(op.triggered_issue_ids) ? op.triggered_issue_ids : [];
  const issueClass = issueIds.length === 0 ? "NO MAJOR ISSUE" : issueIds.length <= 2 ? "REVIEW NEEDED" : "HIGH RISK";

  const rows = [
    {
      label: "Credential Match",
      build: (doc) => {
        const hasIdentity = Boolean(subjectIdentity.name || subjectIdentity.dob || subjectIdentity.address);
        if (!hasIdentity) return { tone: "na", note: "name: - ; DOB: - ; addr: -" };
        if (String(doc.per_document_verdict || "").toLowerCase() === "real") return { tone: "ok", note: "name ✓ ; DOB ✓ ; addr ✓" };
        return { tone: "warn", note: "name ? ; DOB ? ; addr ?" };
      },
    },
    {
      label: "Authenticity Review",
      build: (doc) => {
        const conf = clampScore(doc.per_document_confidence, 0, 100);
        const verdict = String(doc.per_document_verdict || "review").toLowerCase();
        const tone = verdict === "real" ? "ok" : verdict === "fake" ? "bad" : "warn";
        return { tone, note: `${conf}% · ${verdict}`, score: conf };
      },
    },
    {
      label: "Cross-Document Conflicts",
      build: () => {
        if (issueIds.includes("critical_identity_conflict")) return { tone: "bad", note: "Critical conflict detected" };
        if (issueIds.length > 0) return { tone: "warn", note: "Review required" };
        return { tone: "ok", note: "No cross-doc conflicts detected" };
      },
    },
    {
      label: "Per-Document Final Verdict",
      build: (doc) => {
        const conf = clampScore(doc.per_document_confidence, 0, 100);
        const verdict = String(doc.per_document_verdict || "review");
        const tone = verdictTone(verdict);
        return { tone, note: verdict, score: conf };
      },
    },
  ];

  const matrixHead = docs
    .map((doc) => `<th><div class="doc-name-wrap"><span class="doc-name">${escapeHtml(docNameFromKey(doc.s3_key))}</span></div></th>`)
    .join("");

  const symbolByTone = { ok: "✓", warn: "!", bad: "✕", na: "—" };

  const matrixBody = rows
    .map((row) => {
      const cells = docs
        .map((doc) => {
          const cell = row.build(doc);
          if (typeof cell.score === "number") {
            return `<td><span class="score">${Math.round(cell.score)}%</span><span class="tiny">${escapeHtml(cell.note)}</span></td>`;
          }
          return `<td><span class="status ${cell.tone}">${symbolByTone[cell.tone] || "—"}</span><span class="tiny">${escapeHtml(cell.note)}</span></td>`;
        })
        .join("");
      return `<tr><th>${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join("");

  const flaggedDocs = Array.isArray(op.flagged_documents) ? op.flagged_documents : [];
  const flaggedHtml =
    flaggedDocs.length === 0
      ? `<div class="matrix-summary-note">No material issue flagged.</div>`
      : `<div class="flagged-grid">${flaggedDocs
          .map(
            (doc) => `<div class="flag"><div class="f-name">${escapeHtml(docNameFromKey(doc.s3_key || doc.document_id || "document"))}</div><div class="f-note">${escapeHtml(doc.reason_summary || "Requires analyst review.")}</div></div>`
          )
          .join("")}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reagvis Forensic Verification Report</title>
  <style>${reportStyles}</style>
</head>
<body>
  <div class="page">
    <div class="content">
      <section class="header">
        <div class="brand-wrap">
          <img src="./assets/favicon-brand.png" alt="Reagvis" class="logo" />
          <div class="brand-block">
            <h1>Reagvis Forensic Verification Report</h1>
            <div class="sub">Automated report generated from the current batch analysis payload available in TrustTrace.</div>
          </div>
        </div>
        <div class="meta">
          <div class="meta-card">
            <div class="meta-label">Report ID</div>
            <div class="meta-value mono">${escapeHtml(`RVR-${report.jobId || "unknown"}`)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Generated On</div>
            <div class="meta-value">${escapeHtml(fmtIso(report.generatedAt || report.updated_at))}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">KYC Status</div>
            <div class="meta-value">Not Checked</div>
          </div>
        </div>
      </section>

      <section class="summary-row">
        <div class="summary-card primary">
          <div class="summary-title">Batch Verdict</div>
          <div class="summary-value">${escapeHtml(batchVerdict)}</div>
          <div class="summary-note">${escapeHtml(executiveSummary)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Risk Score</div>
          <div class="summary-value">${fmtPct(overallRisk)}</div>
          <div class="summary-note">Composite forensic risk across uploaded files.</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Identity Match</div>
          <div class="summary-value">${escapeHtml(identityMatch)}</div>
          <div class="summary-note">Cross document alignment score</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Document Count</div>
          <div class="summary-value">${docs.length}</div>
          <div class="summary-note">Processed input files</div>
        </div>
      </section>

      <section class="subject-section">
        <h2 class="section-heading">Subject Details</h2>
        <p class="section-subcopy">Primary KYC details inferred from the uploaded documents for the person under verification.</p>
        <div class="subject-grid">
          <div class="subject-card">
            <div class="subject-label">Name</div>
            <div class="subject-value">${escapeHtml(subjectIdentity.name || "Not available")}</div>
            <div class="subject-note">Primary identity inferred from strongest matching documents.</div>
          </div>
          <div class="subject-card">
            <div class="subject-label">DOB</div>
            <div class="subject-value">${escapeHtml(subjectIdentity.dob || "Not available")}</div>
            <div class="subject-note">Cross-document DOB reference used in correlation checks.</div>
          </div>
          <div class="subject-card">
            <div class="subject-label">Address</div>
            <div class="subject-value">${escapeHtml(subjectIdentity.address || "Not available")}</div>
            <div class="subject-note">Most consistent address observed across available records.</div>
          </div>
          <div class="subject-card">
            <div class="subject-label">Documents Submitted</div>
            <div class="subject-value">${escapeHtml(docSubmittedLabel)}</div>
            <div class="subject-note">${escapeHtml(docNames || "No document names available")}</div>
          </div>
        </div>
      </section>

      <section class="matrix-wrap">
        <div class="matrix-head">
          <h2>Cross-Verification Matrix</h2>
          <div class="legend">
            <span><span class="chip ok">✓</span>Pass</span>
            <span><span class="chip warn">!</span>Review</span>
            <span><span class="chip bad">✕</span>Risk</span>
            <span><span class="chip na">—</span>Unavailable</span>
          </div>
        </div>

        <div class="matrix-summary">
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Batch Verdict</div>
            <div class="matrix-summary-value">${escapeHtml(batchVerdict)}</div>
            <div class="matrix-summary-note">${escapeHtml(op.issue_check || "No issue summary available.")}</div>
          </div>
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Issue Check</div>
            <div class="matrix-summary-value">${escapeHtml(issueClass)}</div>
            <div class="matrix-summary-note">${escapeHtml(op.issue_check || "No issue summary available.")}</div>
          </div>
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Identity Summary</div>
            <div class="matrix-summary-value">${escapeHtml(subjectIdentity.name ? `${subjectIdentity.name}${subjectIdentity.dob ? `, DOB ${subjectIdentity.dob}` : ""}` : "Insufficient identity fields")}</div>
            <div class="matrix-summary-note">Derived from returned identity fields.</div>
          </div>
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Date Summary</div>
            <div class="matrix-summary-value">${escapeHtml(subjectIdentity.dob || "Insufficient date data")}</div>
            <div class="matrix-summary-note">Policy-based correlation output.</div>
          </div>
        </div>

        <div class="matrix-scroll">
          <table class="matrix">
            <thead>
              <tr>
                <th>Verification Check</th>
                ${matrixHead}
              </tr>
            </thead>
            <tbody>
              ${matrixBody}
            </tbody>
          </table>
        </div>
      </section>

      <section class="flagged-section">
        <h2 class="section-heading">Flagged Documents</h2>
        <p class="section-subcopy">Documents that need review or carry the highest forensic concern in the current batch.</p>
        ${flaggedHtml}
      </section>

      <section class="bottom">
        <div class="note-box">
          <h3>Cross-Document Findings</h3>
          <ul>
            <li><strong>Name Correlation:</strong> ${escapeHtml(subjectIdentity.name || "No consistent name extracted across the batch.")}</li>
            <li><strong>DOB Correlation:</strong> ${escapeHtml(subjectIdentity.dob || "No DOB correlation available from returned payload.")}</li>
            <li><strong>Address Correlation:</strong> ${escapeHtml(subjectIdentity.address || "No address correlation available from returned payload.")}</li>
            <li><strong>Batch Correlation:</strong> ${escapeHtml(op.issue_check || "No correlation summary provided.")}</li>
            <li><strong>Material Exceptions:</strong> ${escapeHtml(issueIds.length ? issueIds.join(", ") : "No material exceptions flagged.")}</li>
          </ul>
        </div>

        <div class="note-box">
          <h3>Analyst / Model Notes</h3>
          <p>${escapeHtml(op.analyst_notes || "No additional model narrative was returned for this batch.")}</p>
          <p><strong>Recommendation:</strong> ${escapeHtml(batchVerdict === "Authentic" ? "Proceed with confidence checks and normal verification flow." : "Analyst review required before final approval.")}</p>
        </div>
      </section>

      <section class="footer">
        <div>Prepared by <strong>Reagvis Labs</strong> · Automated Forensic Intelligence Stack · Confidential Internal Report</div>
        <div>Verification Policy: <span class="mono">RVR-POL-001</span></div>
      </section>
    </div>
  </div>
</body>
</html>`;
}

function setJson(el, data) {
  el.textContent = JSON.stringify(data, null, 2);
}

function refreshActionButtons() {
  const hasJob = Boolean(state.lastJob);
  const hasReport = Boolean(state.lastReport);

  $("copyJobJsonBtn").disabled = !hasJob;
  $("copyReportJsonBtn").disabled = !hasReport;
  $("downloadReportJsonBtn").disabled = !hasReport;
  $("openPrintableBtn").disabled = !hasReport;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

async function handleFetchedReport(report) {
  state.lastReport = report;
  setJson(reportJsonEl, report);

  const html = buildReportHtml(report);
  state.reportHtml = html;
  reportFrame.srcdoc = html;
  refreshActionButtons();
}

async function runPipeline() {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const bearer = $("bearer").value.trim();
  const originVerify = $("originVerify").value.trim();
  const files = Array.from($("files").files || []);
  const explicitJobId = $("jobId").value.trim();

  if (!apiBase || !bearer) {
    log("Missing API base or bearer token.");
    return;
  }
  if (!files.length) {
    log("Select at least one file.");
    return;
  }
  if (files.length > 10) {
    log("Max 10 files per job.");
    return;
  }

  const jobId = explicitJobId || makeJobId();
  $("jobId").value = jobId;

  setStatus("Uploading", "warn");
  log(`Job: ${jobId}`);

  const docs = [];
  for (const file of files) {
    log(`Presign: ${file.name}`);
    const sign = await presign(apiBase, bearer, originVerify, file, jobId);
    log(`Upload: ${file.name}`);
    const uri = await uploadOne(file, sign);
    docs.push(uri);
  }

  setStatus("Submitting", "warn");
  log("Submitting job...");
  const submit = await submitJob(apiBase, bearer, originVerify, jobId, docs);
  log("Submit response:", submit);

  setStatus("Processing", "warn");
  log("Polling started (every 5s, up to 10 min)...");

  let last = null;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const polled = await pollJob(apiBase, bearer, originVerify, jobId);
    last = polled;
    log(`Poll #${i + 1}: status=${polled.status || "unknown"}`);
    if (polled.status === "COMPLETED" || polled.status === "FAILED") break;
  }

  if (!last) throw new Error("Polling did not return a job state.");

  state.lastJob = last;
  setJson(jobJsonEl, last);
  refreshActionButtons();

  if (last.status !== "COMPLETED") {
    setStatus(String(last.status || "FAILED"), "bad");
    log("Job did not complete successfully.");
    return;
  }

  setStatus("Fetching Report", "warn");
  const report = await fetchReport(apiBase, bearer, originVerify, jobId, false);
  await handleFetchedReport(report);

  setStatus("Completed", "ok");
  log("Report fetched and preview rendered.");
}

async function pollExisting() {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const bearer = $("bearer").value.trim();
  const originVerify = $("originVerify").value.trim();
  const jobId = $("jobId").value.trim();

  if (!apiBase || !bearer || !jobId) {
    log("Need API base, bearer token, and job ID.");
    return;
  }

  setStatus("Polling", "warn");
  const job = await pollJob(apiBase, bearer, originVerify, jobId);
  state.lastJob = job;
  setJson(jobJsonEl, job);
  refreshActionButtons();

  if (job.status === "COMPLETED") {
    setStatus("Completed", "ok");
  } else if (job.status === "FAILED") {
    setStatus("Failed", "bad");
  } else {
    setStatus(String(job.status || "Submitted"), "warn");
  }

  log("Poll response:", job);
}

async function fetchExistingReport() {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const bearer = $("bearer").value.trim();
  const originVerify = $("originVerify").value.trim();
  const jobId = $("jobId").value.trim();

  if (!apiBase || !bearer || !jobId) {
    log("Need API base, bearer token, and job ID.");
    return;
  }

  setStatus("Fetching Report", "warn");
  const report = await fetchReport(apiBase, bearer, originVerify, jobId, false);
  await handleFetchedReport(report);
  setStatus("Report Ready", "ok");
  log("Report response:", report);
}

function openPrintableReport() {
  if (!state.reportHtml) return;

  const headStyle = `
    <style id="__print-style">
      @page { size: 297mm 210mm; margin: 10mm; }
      @media print {
        #__pdf-bar, #__pdf-spacer { display: none !important; }
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    </style>
  `;

  const bar = `
    <div id="__pdf-bar" style="position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;align-items:center;justify-content:space-between;background:#123b7a;color:#fff;padding:10px 20px;font-family:sans-serif;font-size:13px;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.4);">
      <span style="opacity:.8;">reagvis-forensic-report-${escapeHtml(state.lastReport?.jobId || "report")}.pdf</span>
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:11px;opacity:.7;">Destination: <strong style="color:#6ee7d4;">Save as PDF</strong> &nbsp;|&nbsp; More settings → Background graphics: <strong style="color:#6ee7d4;">ON</strong></span>
        <button id="__print-btn" style="background:#198b7a;color:#fff;border:none;padding:8px 22px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">Save as PDF</button>
        <button id="__close-btn" style="background:rgba(255,255,255,0.15);color:#fff;border:none;width:32px;height:32px;border-radius:6px;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#x2715;</button>
      </div>
    </div>
    <div id="__pdf-spacer" style="height:52px;"></div>
    <script>
      document.getElementById('__print-btn').addEventListener('click', function() {
        document.getElementById('__pdf-bar').style.display = 'none';
        document.getElementById('__pdf-spacer').style.display = 'none';
        window.print();
        document.getElementById('__pdf-bar').style.display = 'flex';
        document.getElementById('__pdf-spacer').style.display = 'block';
      });
      document.getElementById('__close-btn').addEventListener('click', function() {
        window.open('', '_self');
        window.close();
      });
    <\/script>
  `;

  const fullHtml = state.reportHtml
    .replace("</head>", `${headStyle}</head>`)
    .replace("</body>", `${bar}</body>`);

  const blob = new Blob([fullHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    log("Popup blocked by browser. Allow popups and retry.");
    return;
  }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

function downloadReportJson() {
  if (!state.lastReport) return;
  const blob = new Blob([JSON.stringify(state.lastReport, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `reagvis-report-${state.lastReport.jobId || "job"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

$("runBtn").addEventListener("click", async () => {
  $("runBtn").disabled = true;
  try {
    await runPipeline();
  } catch (err) {
    setStatus("Error", "bad");
    log("Error:", String(err));
  } finally {
    $("runBtn").disabled = false;
  }
});

$("pollBtn").addEventListener("click", async () => {
  try {
    await pollExisting();
  } catch (err) {
    setStatus("Error", "bad");
    log("Poll error:", String(err));
  }
});

$("fetchReportBtn").addEventListener("click", async () => {
  try {
    await fetchExistingReport();
  } catch (err) {
    setStatus("Error", "bad");
    log("Report fetch error:", String(err));
  }
});

$("copyJobJsonBtn").addEventListener("click", async () => {
  if (!state.lastJob) return;
  await copyText(JSON.stringify(state.lastJob, null, 2));
  log("Copied job JSON.");
});

$("copyReportJsonBtn").addEventListener("click", async () => {
  if (!state.lastReport) return;
  await copyText(JSON.stringify(state.lastReport, null, 2));
  log("Copied report JSON.");
});

$("downloadReportJsonBtn").addEventListener("click", () => {
  downloadReportJson();
  log("Report JSON downloaded.");
});

$("openPrintableBtn").addEventListener("click", () => {
  openPrintableReport();
});

refreshActionButtons();
setStatus("Idle");
