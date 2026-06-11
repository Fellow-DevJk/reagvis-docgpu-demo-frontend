const $ = (id) => document.getElementById(id);

const state = {
  lastJob: null,
  lastReport: null,
  reportHtml: "",
  // Client-side document intake validation state (UX gate before upload).
  //   status: "idle" | "running" | "passed" | "failed"
  validation: { status: "idle", files: [], overall: null, errors: [] },
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
  const p = (n, width = 2) => String(n).padStart(width, "0");
  const ms = p(d.getUTCMilliseconds(), 3);
  const rand = Math.random().toString(36).slice(2, 6);
  return `demo-${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${ms}Z-${rand}`;
}

function normalizeBearerToken(raw) {
  const token = String(raw || "").trim();
  if (!token) return "";
  if (/^Bearer\s+/i.test(token)) return token;
  if (token.includes(".") && !token.includes(" ")) return "Bearer " + token;
  return token;
}

function buildHeaders({ bearer, originVerify, json = false }) {
  const auth = normalizeBearerToken(bearer);
  const h = auth ? { authorization: auth } : {};
  if (originVerify.trim()) h["x-origin-verify"] = originVerify.trim();
  if (json) h["content-type"] = "application/json";
  return h;
}

function sanitizeHeaders(headers = {}) {
  const copy = { ...headers };
  if (copy.authorization) copy.authorization = "[present]";
  if (copy.Authorization) copy.Authorization = "[present]";
  if (copy["x-origin-verify"]) copy["x-origin-verify"] = "[present]";
  return copy;
}

function responseMeta(resp, bodyText) {
  return {
    url: resp.url,
    status: resp.status,
    statusText: resp.statusText,
    requestId:
      resp.headers.get("x-amzn-requestid") ||
      resp.headers.get("x-amz-request-id") ||
      resp.headers.get("x-request-id") ||
      null,
    apiGatewayId: resp.headers.get("x-amz-apigw-id") || null,
    cfId: resp.headers.get("x-amz-cf-id") || null,
    cfCache: resp.headers.get("x-cache") || null,
    contentType: resp.headers.get("content-type") || null,
    bodyText,
  };
}

function buildApiError(label, resp, bodyText, requestMeta = {}) {
  const err = new Error(`${label} failed (${resp.status}) ${bodyText}`);
  err.details = {
    request: requestMeta,
    response: responseMeta(resp, bodyText),
  };
  return err;
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
  const url = `${apiBase}/uploads/presign`;
  const headers = buildHeaders({ bearer, originVerify, json: true });
  log("Presign request:", {
    url,
    method: "POST",
    jobId,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    headers: sanitizeHeaders(headers),
  });
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", jobId }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) {
    throw buildApiError("presign", resp, txt, {
      url,
      method: "POST",
      jobId,
      filename: file.name,
      headers: sanitizeHeaders(headers),
    });
  }
  log("Presign response:", {
    request: { url, method: "POST", filename: file.name, jobId },
    response: responseMeta(resp, txt),
  });
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
  const txt = await put.text();
  if (!put.ok) {
    throw buildApiError("upload", put, txt, {
      url: sign.uploadUrl,
      method: "PUT",
      filename: file.name,
      s3Key: sign.s3Key || null,
      s3Uri: sign.s3Uri || null,
      headers: sanitizeHeaders(headers),
    });
  }
  log("Upload response:", {
    request: {
      url: sign.uploadUrl,
      method: "PUT",
      filename: file.name,
      s3Key: sign.s3Key || null,
      s3Uri: sign.s3Uri || null,
    },
    response: responseMeta(put, txt),
  });

  if (typeof sign.s3Uri === "string" && sign.s3Uri.startsWith("s3://")) return sign.s3Uri;
  if (typeof sign.s3Key === "string" && sign.s3Key.startsWith("s3://")) return sign.s3Key;
  if (typeof sign.s3Key === "string" && sign.s3Key) {
    if (typeof sign.bucket === "string" && sign.bucket) return `s3://${sign.bucket}/${sign.s3Key}`;
    return sign.s3Key;
  }
  throw new Error("presign response missing s3 URI/key");
}

async function submitJob(apiBase, bearer, originVerify, jobId, docs) {
  const url = `${apiBase}/jobs`;
  const headers = buildHeaders({ bearer, originVerify, json: true });
  log("Submit request:", {
    url,
    method: "POST",
    jobId,
    documentCount: docs.length,
    documents: docs,
    headers: sanitizeHeaders(headers),
  });
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ jobId, inputs: { documents: docs } }),
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) {
    throw buildApiError("submit", resp, txt, {
      url,
      method: "POST",
      jobId,
      documentCount: docs.length,
      documents: docs,
      headers: sanitizeHeaders(headers),
    });
  }
  log("Submit response:", {
    request: { url, method: "POST", jobId, documentCount: docs.length },
    response: responseMeta(resp, txt),
  });
  return data;
}

async function pollJob(apiBase, bearer, originVerify, jobId) {
  const url = `${apiBase}/jobs/${encodeURIComponent(jobId)}`;
  const headers = buildHeaders({ bearer, originVerify });
  const resp = await fetch(url, {
    method: "GET",
    headers,
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) {
    throw buildApiError("poll", resp, txt, {
      url,
      method: "GET",
      jobId,
      headers: sanitizeHeaders(headers),
    });
  }
  return data;
}

async function fetchReport(apiBase, bearer, originVerify, jobId, includeDownloadUrls = false) {
  const q = includeDownloadUrls ? "?includeDownloadUrls=1" : "";
  const url = `${apiBase}/jobs/${encodeURIComponent(jobId)}/report${q}`;
  const headers = buildHeaders({ bearer, originVerify });
  const resp = await fetch(url, {
    method: "GET",
    headers,
  });
  const txt = await resp.text();
  const data = safeJson(txt, {});
  if (!resp.ok) {
    throw buildApiError("report fetch", resp, txt, {
      url,
      method: "GET",
      jobId,
      headers: sanitizeHeaders(headers),
    });
  }
  log("Report response:", {
    request: { url, method: "GET", jobId },
    response: responseMeta(resp, txt),
  });
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

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return clampScore(Math.abs(n) <= 1 ? n * 100 : n);
}

function fmtMaybePct(value) {
  const score = readScore(value);
  return score === null ? "N/A" : fmtPct(score);
}

function riskLabelToScore(risk = "") {
  const normalized = String(risk || "").toUpperCase();
  if (normalized === "CRITICAL") return 95;
  if (normalized === "HIGH") return 85;
  if (normalized === "MEDIUM") return 55;
  if (normalized === "LOW") return 15;
  return null;
}

function verdictToRiskScore(verdict = "", fallbackRisk = "") {
  const normalized = String(verdict || "").toUpperCase();
  if (normalized.includes("LIKELY_FAKE") || normalized.includes("LIKELY FAKE") || normalized.includes("FAKE")) return 88;
  if (normalized.includes("REJECT")) return 88;
  if (normalized.includes("SUSPICIOUS") || normalized.includes("MANUAL_REVIEW") || normalized.includes("MANUAL REVIEW")) return 58;
  if (normalized.includes("INSUFFICIENT") || normalized.includes("REVIEW")) return 60;
  if (normalized.includes("AUTHENTIC") || normalized.includes("APPROVE") || normalized.includes("VERIFIED")) return 15;
  return riskLabelToScore(fallbackRisk);
}

function toneFromRiskText(value = "") {
  const normalized = String(value || "").toUpperCase();
  if (["AUTHENTIC", "LOW", "REAL", "PASS", "APPROVE", "VERIFIED"].includes(normalized)) return "ok";
  if (["SUSPICIOUS", "MEDIUM", "WARN", "REVIEW", "MANUAL_REVIEW", "SUSPECT"].includes(normalized)) return "warn";
  if (["LIKELY_FAKE", "HIGH", "CRITICAL", "FAKE", "RISK", "REJECT"].includes(normalized)) return "bad";
  return "na";
}

function formatVerdictLabel(value = "") {
  const normalized = String(value || "").replaceAll("_", " ").trim();
  if (!normalized) return "";
  return normalized
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function collectIdentityValue(docs, key) {
  for (const doc of docs) {
    const value = doc?.identity?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function reportRoots(report) {
  const roots = [report];
  if (report?.report) roots.push(report.report);
  if (report?.data) roots.push(report.data);
  if (report?.data?.report) roots.push(report.data.report);
  if (report?.payload) roots.push(report.payload);
  return roots.filter((item) => item && typeof item === "object");
}

function firstFromRoots(roots, key) {
  for (const root of roots) {
    if (root?.[key] !== undefined && root?.[key] !== null && root?.[key] !== "") return root[key];
  }
  return undefined;
}

function normalizeReportForTemplate(report) {
  const roots = reportRoots(report);
  const root = roots[0] || {};
  const result = firstFromRoots(roots, "result") || {};
  const opRaw = firstFromRoots(roots, "operator_view") || result.operator_view || {};
  const scores = firstFromRoots(roots, "scores") || result.scores || {};
  const finalVerdict = firstFromRoots(roots, "finalVerdict") || firstFromRoots(roots, "final_verdict") || result.finalVerdict || result.final_verdict || {};
  const resultSummary = firstFromRoots(roots, "result_summary") || result.result_summary || {};
  const correlation = firstFromRoots(roots, "correlation") || result.correlation || {};
  const reportSummary = firstDefined(firstFromRoots(roots, "report_summary"), firstFromRoots(roots, "summary"), resultSummary.summary);

  const inputDocuments = asArray(firstFromRoots(roots, "inputs")?.documents).length
    ? asArray(firstFromRoots(roots, "inputs").documents)
    : asArray(result.inputs?.documents);
  const reportDocuments = asArray(firstFromRoots(roots, "documents")).length
    ? asArray(firstFromRoots(roots, "documents"))
    : asArray(result.documents);
  const batchFiles = reportDocuments.length
    ? reportDocuments
    : asArray(firstFromRoots(roots, "files")).length
    ? asArray(firstFromRoots(roots, "files"))
    : asArray(result.files).length
      ? asArray(result.files)
      : inputDocuments.map((key) => ({ key }));
  const opDocs = asArray(opRaw.per_document);
  const perDocVerdicts = asArray(finalVerdict.per_doc_verdicts);
  const maxDocCount = Math.max(opDocs.length, batchFiles.length, perDocVerdicts.length);

  const docs = Array.from({ length: maxDocCount }, (_, index) => {
    const opDoc = opDocs[index] || {};
    const file = batchFiles[index] || {};
    const promptDoc = perDocVerdicts[index] || {};
    const rawDocScore = firstDefined(
      opDoc.per_document_confidence,
      opDoc.risk_score,
      opDoc.report_confidence,
      opDoc.reportConfidence,
      opDoc.riskScore,
      opDoc.forensicScore,
      file.risk_score,
      file.riskScore,
      file.forensic_score,
      file.forensicScore,
      file.report_confidence,
      file.reportConfidence,
      file.overall_risk,
      promptDoc.confidence
    );
    const docScore = readScore(rawDocScore);
    const rawVerdict = firstDefined(
      opDoc.per_document_verdict,
      opDoc.report_verdict,
      opDoc.reportVerdict,
      opDoc.forensic_verdict,
      opDoc.forensicVerdict,
      promptDoc.verdict,
      file.verdict,
      file.report_verdict,
      file.reportVerdict,
      file.forensic_verdict,
      file.forensicVerdict,
      file.decision
    );
    const mappedVerdict = rawVerdict || (docScore === null ? "review" : scoreToVerdict(docScore));
    const identity = opDoc.identity || file.identity || {};

    return {
      ...opDoc,
      s3_key: firstDefined(
        opDoc.s3_key,
        opDoc.s3Key,
        opDoc.s3Uri,
        opDoc.document_name,
        opDoc.documentName,
        opDoc.document_id,
        file.s3_key,
        file.s3Key,
        file.s3Uri,
        file.key,
        file.document_name,
        file.documentName,
        file.name,
        promptDoc.doc,
        promptDoc.document,
        promptDoc.file,
        `document-${index + 1}`
      ),
      per_document_confidence: docScore === null ? undefined : docScore,
      per_document_verdict: mappedVerdict,
      identity,
      reason_summary: firstDefined(
        opDoc.reason_summary,
        opDoc.report_summary,
        opDoc.reportSummary,
        promptDoc.key_flag,
        file.report_summary,
        file.reportSummary,
        file.summary,
        reportSummary,
        finalVerdict.summary
      ),
    };
  });

  const docScores = docs
    .map((doc) => readScore(firstDefined(doc.risk_score, doc.per_document_confidence)))
    .filter((score) => score !== null);
  const finalVerdictRisk = verdictToRiskScore(
    firstDefined(finalVerdict.verdict, resultSummary.verdict),
    firstDefined(finalVerdict.risk, resultSummary.risk)
  );
  const overallRisk = firstDefined(
    readScore(opRaw.risk_score),
    readScore(firstFromRoots(roots, "riskScore")),
    readScore(root.riskScore),
    readScore(firstFromRoots(roots, "overall_batch_risk")),
    readScore(result.overall_batch_risk),
    readScore(firstFromRoots(roots, "overall_risk")),
    readScore(firstFromRoots(roots, "risk_score")),
    readScore(scores.risk_score),
    readScore(scores.forensic_score),
    finalVerdictRisk,
    docScores.length ? Math.max(...docScores) : null
  );

  const subjectIdentity = {
    ...(opRaw?.subject_summary?.identity || {}),
    ...(firstFromRoots(roots, "candidate_identity") || {}),
    ...(firstFromRoots(roots, "candidateIdentity") || {}),
    ...(finalVerdict?.candidate || {}),
  };
  subjectIdentity.name = firstDefined(subjectIdentity.name, collectIdentityValue(docs, "name"));
  subjectIdentity.dob = firstDefined(subjectIdentity.dob, collectIdentityValue(docs, "dob"));
  subjectIdentity.address = firstDefined(subjectIdentity.address, collectIdentityValue(docs, "address"));

  const fraudPatterns = asArray(finalVerdict.fraud_patterns);
  const missingDocs = asArray(finalVerdict.missing_docs);
  const docsExcluded = asArray(finalVerdict.docs_excluded);
  const derivedIssueIds = [
    ...fraudPatterns.map((item) => item.pattern || item.detail || "fraud_pattern"),
    ...missingDocs.map((item) => `missing_${item.type || "document"}`),
    ...docsExcluded.map((item) => `excluded_${item.doc || "document"}`),
  ].filter(Boolean);
  const triggeredIssueIds = asArray(opRaw.triggered_issue_ids).length ? asArray(opRaw.triggered_issue_ids) : derivedIssueIds;

  const flaggedFromVerdicts = docs.filter((doc) => {
    const verdict = String(doc.per_document_verdict || "").toUpperCase();
    return verdict && !/(AUTHENTIC|APPROVE|VERIFIED|REAL)/.test(verdict);
  });
  const flaggedDocuments = asArray(opRaw.flagged_documents).length
    ? asArray(opRaw.flagged_documents)
    : flaggedFromVerdicts.map((doc) => ({
        s3_key: doc.s3_key,
        reason_summary: doc.reason_summary || formatVerdictLabel(doc.per_document_verdict) || "Requires analyst review.",
      }));

  const batchVerdict =
    formatVerdictLabel(firstDefined(opRaw.batch_verdict, finalVerdict.verdict, resultSummary.verdict, firstFromRoots(roots, "overall_verdict"), firstFromRoots(roots, "overallVerdict"), firstFromRoots(roots, "verdict"))) ||
    (overallRisk === null ? "Unavailable" : scoreToVerdict(overallRisk));
  const issueCheck = firstDefined(
    opRaw.issue_check,
    finalVerdict.summary,
    reportSummary,
    correlation.story,
    correlation.conclusion
  );

  return {
    reportId: firstDefined(root.jobId, root.job_id, firstFromRoots(roots, "jobId"), firstFromRoots(roots, "job_id"), "unknown"),
    generatedAt: firstDefined(root.generatedAt, root.generated_at, root.updated_at, firstFromRoots(roots, "generatedAt"), firstFromRoots(roots, "updated_at")),
    riskLevel: firstDefined(finalVerdict.risk, firstFromRoots(roots, "risk_level"), firstFromRoots(roots, "riskLevel")),
    operator: {
      ...opRaw,
      per_document: docs,
      risk_score: overallRisk,
      batch_verdict: batchVerdict,
      identity_match_score: firstDefined(opRaw.identity_match_score, firstFromRoots(roots, "identity_similarity"), firstFromRoots(roots, "identitySimilarity"), result.identity_similarity, finalVerdict.confidence, resultSummary.confidence),
      subject_summary: { ...(opRaw.subject_summary || {}), identity: subjectIdentity },
      analyst_notes: firstDefined(opRaw.analyst_notes, finalVerdict.summary, reportSummary, correlation.story),
      issue_check: issueCheck,
      triggered_issue_ids: triggeredIssueIds,
      flagged_documents: flaggedDocuments,
    },
  };
}

const reportStyles = String.raw`
  :root {
    --ink: #10213a;
    --muted: #5b6b82;
    --line: #cfd7e3;
    --line-strong: #96a5bd;
    --ok: #1f8f55;
    --warn: #c98714;
    --bad: #c23b3b;
    --na: #7d8796;
  }
  * { box-sizing: border-box; }
  @page { size: 297mm 210mm; margin: 10mm; }
  html, body {
    margin: 0;
    padding: 0;
    background: #f8f7f5;
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
  }
  .page {
    width: 100%;
    background: #fff;
    padding: 20px;
    border: 1px solid var(--line);
    border-radius: 14px;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .header {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 16px;
    border-bottom: 1px solid var(--line-strong);
    padding-bottom: 14px;
  }
  .brand-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .logo {
    width: 46px;
    height: 46px;
    object-fit: contain;
    border-radius: 12px;
  }
  .brand-block h1 {
    margin: 0;
    font-size: 24px;
  }
  .brand-block .sub {
    margin-top: 4px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.45;
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    align-content: start;
    min-width: 0;
  }
  .meta-card {
    border: 1px solid var(--line);
    background: linear-gradient(145deg, #ffffff 0%, #f5f8ff 100%);
    border-radius: 12px;
    padding: 10px 12px;
    position: relative;
    overflow: hidden;
    min-width: 0;
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
    font-size: 9px;
    color: #9aa3b5;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 700;
    margin-bottom: 5px;
  }
  .meta-value {
    font-size: 13px;
    font-weight: 700;
    color: #0f1f3d;
    word-break: break-word;
    overflow-wrap: anywhere;
    line-height: 1.25;
  }
  .meta-value.mono {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #123b7a;
  }
  .summary-row {
    display: grid;
    grid-template-columns: 1.35fr .85fr .85fr .85fr;
    gap: 10px;
  }
  .summary-card {
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 12px;
    min-height: 92px;
    background: #f8fbff;
  }
  .summary-card.primary {
    color: #fff;
    background: linear-gradient(135deg, #123b7a, #198b7a);
    border: none;
  }
  .summary-title {
    font-size: 10px;
    letter-spacing: .06em;
    text-transform: uppercase;
    font-weight: 700;
    opacity: .82;
    margin-bottom: 7px;
  }
  .summary-value {
    font-size: 32px;
    line-height: 1.04;
    font-weight: 700;
    margin-bottom: 6px;
  }
  .summary-note {
    font-size: 10px;
    line-height: 1.42;
    color: #44587c;
  }
  .summary-card.primary .summary-note {
    color: rgba(255,255,255,.88);
  }
  .subject-section {
    margin-top: 0;
  }
  .section-heading {
    margin: 0;
    font-size: 15px;
    line-height: 1.2;
  }
  .section-subcopy {
    margin: 6px 0 10px;
    color: var(--muted);
    font-size: 11px;
  }
  .subject-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .subject-card {
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px;
    background: #fff;
  }
  .subject-label {
    font-size: 9px;
    letter-spacing: .05em;
    text-transform: uppercase;
    color: #8c99ad;
    margin-bottom: 6px;
  }
  .subject-value {
    font-size: 20px;
    line-height: 1.15;
    font-weight: 700;
    margin-bottom: 5px;
    word-break: break-word;
  }
  .subject-note {
    font-size: 10px;
    color: var(--muted);
    line-height: 1.4;
  }
  .matrix-wrap {
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .matrix-head {
    display: grid;
    grid-template-columns: minmax(185px, 1fr) minmax(230px, auto);
    align-items: center;
    gap: 18px;
    padding: 10px 12px;
    background: #f5f9fd;
    border-bottom: 1px solid var(--line);
    break-after: avoid;
    page-break-after: avoid;
  }
  .matrix-head h2 {
    margin: 0;
    font-size: 15px;
    line-height: 1.2;
    white-space: nowrap;
  }
  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: nowrap;
    column-gap: 14px;
    row-gap: 4px;
    color: #5f708b;
    font-size: 8.5px;
    white-space: nowrap;
    min-width: 230px;
  }
  .legend > span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    flex: 0 0 auto;
  }
  .chip {
    display: inline-flex;
    width: 13px;
    height: 13px;
    border-radius: 999px;
    align-items: center;
    justify-content: center;
    font-size: 8px;
    line-height: 1;
    border: 1px solid;
  }
  .chip.ok { color: var(--ok); border-color: var(--ok); }
  .chip.warn { color: var(--warn); border-color: var(--warn); }
  .chip.bad { color: var(--bad); border-color: var(--bad); }
  .chip.na { color: var(--na); border-color: var(--na); }
  .matrix-summary {
    display: grid;
    grid-template-columns: 1.15fr .95fr .95fr .95fr;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    background: #f9fcff;
    break-before: avoid;
    page-break-before: avoid;
  }
  .matrix-summary-card {
    border: 1px solid var(--line);
    border-radius: 10px;
    background: #fff;
    padding: 8px;
    min-height: 72px;
  }
  .matrix-summary-label {
    font-size: 9px;
    text-transform: uppercase;
    color: #8e9cb2;
    margin-bottom: 4px;
  }
  .matrix-summary-value {
    font-size: 12px;
    font-weight: 700;
    color: #13284c;
    line-height: 1.2;
    margin-bottom: 3px;
  }
  .matrix-summary-note {
    font-size: 10px;
    color: #647897;
    line-height: 1.4;
  }
  .matrix-scroll { overflow: auto; }
  .matrix {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 10px;
  }
  .matrix thead th {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    background: #f7fafc;
    padding: 8px 6px;
    text-align: center;
    color: #23406f;
    vertical-align: bottom;
  }
  .matrix tbody th,
  .matrix tbody td {
    border-right: 1px solid var(--line);
    border-bottom: 1px solid var(--line);
    padding: 7px 6px;
    text-align: center;
    vertical-align: middle;
    background: #fff;
  }
  .matrix thead th:first-child {
    width: 21%;
    text-align: left;
    padding-left: 11px;
  }
  .matrix tbody th {
    text-align: left;
    color: #162f58;
    background: #f9fbff;
    padding-left: 11px;
    font-weight: 700;
  }
  .doc-name-wrap {
    display: block;
  }
  .doc-name {
    display: inline-block;
    word-break: break-word;
    line-height: 1.15;
    font-size: 9px;
  }
  .status {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    border: 1px solid;
    margin-bottom: 3px;
  }
  .status.ok { color: var(--ok); border-color: var(--ok); }
  .status.warn { color: var(--warn); border-color: var(--warn); }
  .status.bad { color: var(--bad); border-color: var(--bad); }
  .status.na { color: var(--na); border-color: var(--na); }
  .tiny {
    display: block;
    font-size: 9px;
    color: #334155;
    line-height: 1.28;
    word-break: break-word;
  }
  .score {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: #123b7a;
    line-height: 1.2;
    margin-bottom: 2px;
  }
  .flagged-section {
    margin-top: 0;
  }
  .flagged-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .flag {
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px;
    background: #fff;
  }
  .flag .f-name { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
  .flag .f-note { font-size: 10px; color: #5e718f; line-height: 1.35; }
  .bottom {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .note-box {
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px;
    background: #fff;
  }
  .note-box h3 {
    margin: 0 0 7px;
    font-size: 14px;
  }
  .note-box ul {
    margin: 0;
    padding-left: 16px;
    color: #1f3760;
  }
  .note-box li { margin-bottom: 5px; font-size: 10px; line-height: 1.35; }
  .note-box p {
    margin: 0;
    color: #1f3760;
    font-size: 10px;
    line-height: 1.42;
  }
  .footer {
    border-top: 1px solid var(--line);
    margin-top: 0;
    padding-top: 8px;
    display: flex;
    justify-content: space-between;
    color: #4f5f77;
    font-size: 9px;
  }
  .mono {
    font-family: 'Courier New', monospace;
  }
`;

function buildReportHtml(report) {
  const normalized = normalizeReportForTemplate(report);
  const op = normalized.operator;
  const docs = Array.isArray(op.per_document) ? op.per_document : [];

  const overallRisk = readScore(op.risk_score);
  const batchVerdict = String(op.batch_verdict || (overallRisk === null ? "Unavailable" : scoreToVerdict(overallRisk)));
  const identityMatch = fmtMaybePct(op.identity_match_score);
  const issueTone = toneFromRiskText(normalized.riskLevel || batchVerdict);

  const subjectIdentity = op?.subject_summary?.identity || {};
  const docSubmittedLabel = docs.length === 1 ? "1 file" : `${docs.length} files`;
  const docNames = docs.map((d) => docNameFromKey(d.s3_key)).join(", ");

  const executiveSummary =
    op?.analyst_notes ||
    op?.issue_check ||
    "Forensic policy output generated from uploaded document set.";

  const issueIds = Array.isArray(op.triggered_issue_ids) ? op.triggered_issue_ids : [];
  const effectiveIssueTone =
    issueTone !== "na"
      ? issueTone
      : issueIds.length === 0
        ? "ok"
        : issueIds.length <= 2
          ? "warn"
          : "bad";
  const issueSummary =
    effectiveIssueTone === "ok"
      ? {
          title: "No major issue found",
          badge: "No Major Issue",
          copy: "Documents broadly align across current checks.",
        }
      : effectiveIssueTone === "warn"
        ? {
            title: "Analyst review required",
            badge: "Needs Review",
            copy: "Mixed indicators detected. Review before final approval.",
          }
        : {
            title: "Material issues found",
            badge: "Issue Found",
            copy: "High-risk indicators detected. Hold batch for manual validation.",
          };

  const rows = [
    {
      label: "Credential Match",
      build: (doc) => {
        const identity = doc.identity || {};
        const parts = [];
        const tones = [];
        const checks = [
          ["name", "name", subjectIdentity.name, identity.name],
          ["DOB", "dob", subjectIdentity.dob, identity.dob],
          ["addr", "address", subjectIdentity.address, identity.address],
        ];
        for (const [label, , expected, observed] of checks) {
          if (!expected || !observed) {
            parts.push(`${label} -`);
            tones.push("na");
            continue;
          }
          const matched = String(expected).toLowerCase() === String(observed).toLowerCase();
          parts.push(`${label} ${matched ? "✓" : "✕"}`);
          tones.push(matched ? "ok" : "warn");
        }
        const tone = tones.every((toneValue) => toneValue === "ok") ? "ok" : tones.includes("warn") ? "warn" : "na";
        return { tone, note: parts.join("; ") };
      },
    },
    {
      label: "Authenticity Review",
      build: (doc) => {
        const conf = clampScore(doc.per_document_confidence, 0, 100);
        const verdict = String(doc.per_document_verdict || "review");
        const tone = verdictTone(verdict);
        return { tone, note: `${formatVerdictLabel(verdict) || "Review"}${Number.isFinite(conf) ? ` (${Math.round(conf)}%)` : ""}` };
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

  const symbolByTone = { ok: "✓", warn: "!", bad: "✕", na: "-" };

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
            <div class="meta-value mono">${escapeHtml(`RVR-${normalized.reportId || "unknown"}`)}</div>
          </div>
          <div class="meta-card">
            <div class="meta-label">Generated On</div>
            <div class="meta-value">${escapeHtml(fmtIso(normalized.generatedAt))}</div>
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
          <div class="summary-value">${overallRisk === null ? "N/A" : fmtPct(overallRisk)}</div>
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
            <span><span class="chip bad">✕</span>Rejected</span>
            <span><span class="chip na">-</span>Unavailable</span>
          </div>
        </div>

        <div class="matrix-summary">
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Batch Verdict</div>
            <div class="matrix-summary-value">${escapeHtml(batchVerdict)}</div>
            <div class="matrix-summary-note">${escapeHtml(executiveSummary)}</div>
          </div>
          <div class="matrix-summary-card">
            <div class="matrix-summary-label">Issue Check</div>
            <div class="matrix-summary-value">${escapeHtml(issueSummary.title)}</div>
            <div class="matrix-summary-note">${escapeHtml(`${issueSummary.badge}: ${issueSummary.copy}`)}</div>
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
          <ul>
            <li>${escapeHtml(op.analyst_notes || "Final decision was generated from forensic and identity review signals.")}</li>
            <li>${escapeHtml(issueSummary.copy)}</li>
            <li>${escapeHtml(effectiveIssueTone === "bad" ? "Recommendation: hold flagged documents for manual validation." : "Recommendation: complete standard operator review before final approval.")}</li>
          </ul>
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

/* =====================================================================
 * Document intake validation — client-side UX gate (PASS/FAIL).
 * ---------------------------------------------------------------------
 * This layer decides only whether a document is SUITABLE for reliable
 * forensic analysis. It does NOT decide authenticity — the backend
 * forensic model does that asynchronously after submission. Client-side
 * validation is NOT a security control; the backend must re-validate.
 * Implementation: validators/* and workers/validation-worker.js.
 * ===================================================================== */

const intakePill = $("intakePill");
const intakeHint = $("intakeHint");
const intakeFilesEl = $("intakeFiles");
const intakeHandoffEl = $("intakeHandoff");

const STAGE_LABELS = {
  preparing: "Preparing document…",
  quality: "Checking image quality…",
  readability: "Checking readability…",
};
const CHECK_MARKS = { pass: "✓", fail: "✕", skip: "–", na: "–" };

function prettyBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setIntakePill(label, tone = "") {
  intakePill.textContent = label;
  intakePill.className = `pill ${tone}`.trim();
}

function intakeCardId(i) {
  return `intakeFile-${i}`;
}

function renderInitialCards(files) {
  intakeFilesEl.innerHTML = files
    .map(
      (file, i) => `
      <div class="intake-file" id="${intakeCardId(i)}" data-status="running">
        <div class="if-top">
          <span class="if-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)} <span class="if-meta">· ${escapeHtml(prettyBytes(file.size))}</span></span>
          <span class="if-status pill">Queued</span>
        </div>
        <div class="if-msg">Waiting to start…</div>
      </div>`
    )
    .join("");
}

function updateCardStage(i, stage) {
  const card = $(intakeCardId(i));
  if (!card) return;
  card.dataset.status = "running";
  const status = card.querySelector(".if-status");
  const msg = card.querySelector(".if-msg");
  if (status) {
    status.className = "if-status pill";
    status.textContent = "Checking…";
  }
  if (msg) msg.textContent = STAGE_LABELS[stage] || "Validating…";
}

function renderChecks(checks) {
  return checks
    .map(
      (c) => `<div class="if-check" data-st="${c.status}">
        <span class="ic-mark">${CHECK_MARKS[c.status] || "–"}</span>
        <span class="ic-label">${c.n}. ${escapeHtml(c.label)}</span>
        <span class="ic-detail">${escapeHtml(c.detail || "")}</span>
      </div>`
    )
    .join("");
}

function renderCardResult(i, result) {
  const card = $(intakeCardId(i));
  if (!card) return;
  card.dataset.status = result.status;
  const tone = result.status === "pass" ? "ok" : "bad";
  const label = result.status === "pass" ? "Accepted" : "Rejected";
  card.innerHTML = `
    <div class="if-top">
      <span class="if-name" title="${escapeHtml(result.name)}">${escapeHtml(result.name)} <span class="if-meta">· ${escapeHtml(result.sizePretty)}</span></span>
      <span class="if-status pill ${tone}">${label}</span>
    </div>
    <div class="if-msg">${escapeHtml(result.headline)}</div>
    <details class="if-details">
      <summary>View validation details</summary>
      <div class="if-check-list">${renderChecks(result.checks)}</div>
    </details>`;
  // Raw forensic-suitability scores stay in the console for tuning, never user-facing.
  if (result.debug) console.debug(`[intake] ${result.name}`, result.debug);
}

function updateIntakeOverall(overall) {
  state.validation.overall = overall;
  state.validation.status = overall.status; // "passed" | "failed"
  if (overall.status === "passed") {
    setIntakePill("Ready for forensic analysis", "ok");
  } else {
    setIntakePill("Action required", "bad");
  }
  intakeHint.textContent = overall.message;
  updateRunGate();
}

function updateRunGate() {
  const passed = state.validation && state.validation.status === "passed";
  const btn = $("runBtn");
  btn.disabled = !passed;
  btn.title = passed
    ? "Validation passed — upload and submit for forensic analysis."
    : "Select a document and pass intake validation to enable.";
}

function showHandoff() {
  intakeHandoffEl.hidden = false;
  intakeHandoffEl.innerHTML = `Document accepted for forensic analysis. The forensic job has started.
    <span class="ih-sub">You may safely leave this page — analysis continues on the server and the report stays available for this Job ID.</span>`;
}

function hideHandoff() {
  intakeHandoffEl.hidden = true;
  intakeHandoffEl.innerHTML = "";
}

async function handleFilesSelected() {
  const files = Array.from($("files").files || []);
  hideHandoff();
  state.validation = { status: "idle", files: [], overall: null, errors: [] };

  if (!files.length) {
    intakeFilesEl.innerHTML = "";
    setIntakePill("No file", "");
    intakeHint.textContent = "Select a document to begin intake checks.";
    updateRunGate();
    return;
  }

  state.validation.status = "running";
  state.validation.files = files.map((f) => ({ name: f.name, size: f.size, status: "running" }));
  setIntakePill("Validating…", "");
  intakeHint.textContent = "Preparing document for forensic analysis…";
  renderInitialCards(files);
  updateRunGate();

  if (!window.ReagvisIntake) {
    setIntakePill("Unavailable", "bad");
    intakeHint.textContent = "Validation engine failed to load. Check your connection and reload.";
    updateRunGate();
    return;
  }

  try {
    await window.ReagvisIntake.validate(files, {
      stage: (i, stage) => updateCardStage(i, stage),
      fileResult: (i, result) => {
        state.validation.files[i] = { name: result.name, size: result.size, status: result.status };
        renderCardResult(i, result);
      },
      overall: (overall) => updateIntakeOverall(overall),
    });
  } catch (err) {
    console.error("[intake] validation error", err);
    state.validation.status = "failed";
    setIntakePill("Error", "bad");
    intakeHint.textContent = "Intake validation could not complete. Please reselect the document.";
    updateRunGate();
  }
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

  // Intake validation gate — a document must PASS the client-side suitability
  // checks before any presign/upload/submit. (Defense in depth: the run button
  // is already disabled until validation passes, but never upload on FAIL.)
  const vStatus = state.validation ? state.validation.status : "idle";
  if (vStatus === "running") {
    setStatus("Validating", "warn");
    log("Please wait, document intake is finishing.");
    return;
  }
  if (vStatus !== "passed") {
    setStatus("Blocked", "bad");
    log("Document intake validation has not passed. Resolve the flagged issues before submitting.");
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
    log("Uploaded document URI:", { file: file.name, uri });
  }

  setStatus("Submitting", "warn");
  log("Submitting job...");
  const submit = await submitJob(apiBase, bearer, originVerify, jobId, docs);
  log("Submit response:", submit);

  // Handoff: the async forensic job has started. The user may safely leave now;
  // the polling/report preview below is a demo convenience, not a requirement.
  showHandoff();
  log("Document accepted for forensic analysis. Forensic job submitted — you may safely leave this page.");

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
    if (err?.details) log("Error details:", err.details);
  } finally {
    // Re-gate against validation state instead of unconditionally re-enabling.
    updateRunGate();
  }
});

// Start intake validation automatically as soon as files are selected.
$("files").addEventListener("change", handleFilesSelected);

$("pollBtn").addEventListener("click", async () => {
  try {
    await pollExisting();
  } catch (err) {
    setStatus("Error", "bad");
    log("Poll error:", String(err));
    if (err?.details) log("Poll error details:", err.details);
  }
});

$("fetchReportBtn").addEventListener("click", async () => {
  try {
    await fetchExistingReport();
  } catch (err) {
    setStatus("Error", "bad");
    log("Report fetch error:", String(err));
    if (err?.details) log("Report fetch error details:", err.details);
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
updateRunGate();
