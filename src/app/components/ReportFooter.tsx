import { Download, FileText, RefreshCw } from 'lucide-react';
import { CheckResult, Verdict } from '../types';

interface ReportFooterProps {
  fileName: string;
  results: CheckResult[];
  verdict: Verdict;
  onReset: () => void;
}

const BTN: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  fontSize: '12px',
  fontFamily: 'IBM Plex Sans, sans-serif',
  fontWeight: 500,
  color: '#1B1714',
  background: 'transparent',
  border: '1px solid #D8D1C4',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background 0.12s',
};

export function ReportFooter({ fileName, results, verdict, onReset }: ReportFooterProps) {
  function downloadJSON() {
    const ts = new Date().toISOString();
    const report = {
      document: fileName,
      timestamp: ts,
      model: 'DocGPU v1',
      verdict: { decision: verdict.decision, confidence: verdict.confidence, summary: verdict.summary, passed: verdict.passed, warned: verdict.warned, failed: verdict.failed },
      checks: results.map(r => ({ id: r.id, status: r.status, metric: r.metric ?? null, reason: r.reason ?? null })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `reagvis-report-${ts.replace(/[:.]/g, '-')}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  function openPrintable() {
    const ts = new Date().toLocaleString();
    const rows = results.map(r => `<tr><td>${r.id}</td><td class="${r.status}">${r.status.toUpperCase()}</td><td>${r.metric ?? ''}</td><td>${r.reason ?? ''}</td></tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Reagvis Report</title>
<style>body{font-family:'IBM Plex Sans',sans-serif;color:#1B1714;background:#F5F3EE;padding:40px;font-size:13px}h1{font-size:20px;font-weight:600;margin-bottom:4px}p.meta{font-family:'IBM Plex Mono',monospace;font-size:11px;color:#6E655A;margin-bottom:20px}.verdict{display:inline-block;border:2px solid;outline:1px solid;outline-offset:3px;padding:10px 20px;margin-bottom:20px;font-family:'IBM Plex Mono',monospace;font-size:20px;font-weight:600;letter-spacing:.1em}.accepted{border-color:#1F6B4F;color:#1F6B4F}.rejected{border-color:#A52714;color:#A52714}table{width:100%;border-collapse:collapse;font-size:12px}th{font-family:'IBM Plex Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#6E655A;padding:6px 8px;border-bottom:1px solid #D8D1C4;text-align:left}td{padding:7px 8px;border-bottom:1px solid #D8D1C4;vertical-align:top}.pass{font-family:'IBM Plex Mono',monospace;color:#1F6B4F;font-weight:600}.fail{font-family:'IBM Plex Mono',monospace;color:#A52714;font-weight:600}.warn{font-family:'IBM Plex Mono',monospace;color:#9A6212;font-weight:600}</style>
</head><body>
<h1>Reagvis Verify — Validation Report</h1>
<p class="meta">${fileName} · ${ts} · Model: DocGPU v1</p>
<div class="verdict ${verdict.decision}">${verdict.decision.toUpperCase()}</div>
<p style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#6E655A;margin-bottom:20px">${verdict.passed}/16 passed · ${verdict.summary} · Confidence ${verdict.confidence}%</p>
<table><thead><tr><th>Check</th><th>Status</th><th>Metric</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>
<script>setTimeout(()=>window.print(),300)</script></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-paper-sunk px-6 py-4 lg:px-8">
      <div className="flex flex-wrap gap-2">
        <button style={BTN} onClick={downloadJSON}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#ECE7DD')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
          <Download className="h-3.5 w-3.5" />
          Download report (JSON)
        </button>
        <button style={BTN} onClick={openPrintable}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.background = '#ECE7DD')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'transparent')}>
          <FileText className="h-3.5 w-3.5" />
          Open printable report
        </button>
      </div>
      <button
        onClick={onReset}
        style={{ ...BTN, border: 'none', color: '#6E655A' }}
        onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#1B1714')}
        onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#6E655A')}
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Re-run
      </button>
    </div>
  );
}
