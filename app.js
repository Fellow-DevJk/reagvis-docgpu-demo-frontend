const $ = (id) => document.getElementById(id);
const logEl = $("log");

function log(...args) {
  const line = args
    .map((v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2)))
    .join(" ");
  logEl.textContent += `${new Date().toISOString()}  ${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
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

async function presign(apiBase, bearer, originVerify, file, jobId) {
  const resp = await fetch(`${apiBase}/uploads/presign`, {
    method: "POST",
    headers: buildHeaders({ bearer, originVerify, json: true }),
    body: JSON.stringify({ filename: file.name, contentType: file.type || "application/octet-stream", jobId }),
  });
  if (!resp.ok) throw new Error(`presign failed (${resp.status}) ${await resp.text()}`);
  return resp.json();
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
  return sign.s3Key;
}

async function submitJob(apiBase, bearer, originVerify, jobId, docs) {
  const resp = await fetch(`${apiBase}/jobs`, {
    method: "POST",
    headers: buildHeaders({ bearer, originVerify, json: true }),
    body: JSON.stringify({ jobId, inputs: { documents: docs } }),
  });
  if (!resp.ok) throw new Error(`submit failed (${resp.status}) ${await resp.text()}`);
  return resp.json();
}

async function pollJob(apiBase, bearer, originVerify, jobId) {
  const resp = await fetch(`${apiBase}/jobs/${jobId}?includeDownloadUrls=1`, {
    method: "GET",
    headers: buildHeaders({ bearer, originVerify }),
  });
  const txt = await resp.text();
  let data = {};
  try { data = JSON.parse(txt); } catch {}
  if (!resp.ok) throw new Error(`poll failed (${resp.status}) ${txt}`);
  return data;
}

async function run() {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const bearer = $("bearer").value.trim();
  const originVerify = $("originVerify").value.trim();
  const files = Array.from($("files").files || []);
  const explicitJobId = $("jobId").value.trim();

  if (!apiBase || !bearer) return log("Missing API base or bearer token.");
  if (!files.length) return log("Select at least one file.");
  if (files.length > 10) return log("Max 10 files per job.");

  const jobId = explicitJobId || makeJobId();
  $("jobId").value = jobId;
  log(`Job: ${jobId}`);

  const docs = [];
  for (const f of files) {
    log(`Presign: ${f.name}`);
    const sign = await presign(apiBase, bearer, originVerify, f, jobId);
    log(`Upload: ${f.name}`);
    const s3 = await uploadOne(f, sign);
    docs.push(s3);
  }

  log("Submitting job...");
  const submit = await submitJob(apiBase, bearer, originVerify, jobId, docs);
  log("Submit response:", submit);

  log("Polling started (every 8s, up to 8 min)...");
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    try {
      const j = await pollJob(apiBase, bearer, originVerify, jobId);
      log(`Poll #${i + 1}: status=${j.status || "unknown"}`);
      if (j.status === "COMPLETED" || j.status === "FAILED") {
        log("Final response:", j);
        return;
      }
    } catch (err) {
      log(String(err));
    }
  }
  log("Polling ended without terminal status.");
}

$("runBtn").addEventListener("click", async () => {
  $("runBtn").disabled = true;
  try { await run(); } catch (e) { log("Error:", String(e)); }
  $("runBtn").disabled = false;
});

$("pollBtn").addEventListener("click", async () => {
  const apiBase = $("apiBase").value.trim().replace(/\/$/, "");
  const bearer = $("bearer").value.trim();
  const originVerify = $("originVerify").value.trim();
  const jobId = $("jobId").value.trim();
  if (!apiBase || !bearer || !jobId) return log("Need API base, bearer, and job ID.");
  try {
    const j = await pollJob(apiBase, bearer, originVerify, jobId);
    log("Poll response:", j);
  } catch (e) {
    log("Poll error:", String(e));
  }
});
