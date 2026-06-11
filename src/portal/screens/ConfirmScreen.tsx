import { useLocation, useNavigate } from 'react-router';
import { CheckCircle2, Download, RotateCcw, XCircle } from 'lucide-react';
import { UCCHeader } from '../components/UCCHeader';
import { Verdict, CheckResult } from '../../app/types';

interface ConfirmState {
  fileName?: string;
  verdict?: Verdict;
  results?: CheckResult[];
  service?: string;
  mode?: string;
  ref?: string;
}

export function ConfirmScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as ConfirmState;

  const {
    fileName = 'document',
    verdict,
    results = [],
    service = 'Registration of Marriage',
    ref = `RV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-00121`,
  } = state;

  const accepted = verdict?.decision === 'accepted';
  const ts = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });

  function downloadReport() {
    if (!verdict) return;
    const report = {
      reference: ref,
      document: fileName,
      service,
      timestamp: new Date().toISOString(),
      model: 'DocGPU v1',
      verdict: { decision: verdict.decision, confidence: verdict.confidence, summary: verdict.summary, passed: verdict.passed, warned: verdict.warned, failed: verdict.failed },
      checks: results.map(r => ({ id: r.id, status: r.status, metric: r.metric ?? null, reason: r.reason ?? null })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: `ucc-report-${ref}.json` });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen" style={{ background: '#F3F1EC', fontFamily: 'Poppins, sans-serif' }}>
      <UCCHeader variant="app" />

      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8 px-4 py-14">
        {/* Status icon */}
        {accepted ? (
          <CheckCircle2 className="h-16 w-16" style={{ color: '#15706B' }} strokeWidth={1.5} />
        ) : (
          <XCircle className="h-16 w-16" style={{ color: '#DC2626' }} strokeWidth={1.5} />
        )}

        {/* Heading */}
        <div className="text-center">
          <h1
            style={{ fontFamily: 'Poppins, sans-serif', fontSize: '26px', fontWeight: 700, color: accepted ? '#15706B' : '#DC2626', marginBottom: '8px' }}
          >
            {accepted ? 'Verification Complete' : 'Verification Failed'}
          </h1>
          <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '14px', color: '#6B7280', maxWidth: '400px' }}>
            {accepted
              ? 'Your document has been verified and accepted. Keep the reference number for your records.'
              : 'The document did not pass all required checks. Please recapture and retry.'}
          </p>
        </div>

        {/* Record card */}
        <div
          className="w-full"
          style={{ background: '#fff', borderRadius: '10px', border: '1px solid #E3E0D8', overflow: 'hidden' }}
        >
          {/* Card header */}
          <div className="px-6 py-4" style={{ background: accepted ? '#E8F5F3' : '#FEF2F2', borderBottom: '1px solid #E3E0D8' }}>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: accepted ? '#15706B' : '#DC2626', marginBottom: '4px' }}>
              Verification Reference
            </p>
            <p style={{ fontFamily: 'monospace', fontSize: '18px', fontWeight: 700, color: '#1F2937', letterSpacing: '0.05em' }}>
              {ref}
            </p>
          </div>

          {/* Details */}
          <div className="flex flex-col gap-0 divide-y" style={{ borderColor: '#F3F4F6' }}>
            {[
              { label: 'Document', value: fileName },
              { label: 'Service', value: service },
              { label: 'Verdict', value: verdict?.decision?.toUpperCase() ?? '—', isVerdict: true },
              { label: 'Checks Passed', value: verdict ? `${verdict.passed} of 16` : '—' },
              { label: 'Confidence', value: verdict ? `${verdict.confidence}%` : '—' },
              { label: 'Verified On', value: ts },
              { label: 'Model', value: 'DocGPU v1' },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between px-6 py-3">
                <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', color: '#6B7280', fontWeight: 400 }}>{row.label}</span>
                <span
                  style={{
                    fontFamily: row.isVerdict ? 'monospace' : 'Poppins, sans-serif',
                    fontSize: row.isVerdict ? '12px' : '13px',
                    fontWeight: row.isVerdict ? 700 : 500,
                    color: row.isVerdict ? (accepted ? '#15706B' : '#DC2626') : '#1F2937',
                    letterSpacing: row.isVerdict ? '0.08em' : 'normal',
                    border: row.isVerdict ? `1px solid ${accepted ? '#15706B' : '#DC2626'}` : 'none',
                    padding: row.isVerdict ? '2px 8px' : '0',
                    borderRadius: row.isVerdict ? '3px' : '0',
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-center gap-3">
          {verdict && (
            <button
              onClick={downloadReport}
              className="flex items-center gap-2 px-5 py-2.5 font-semibold text-white transition-colors"
              style={{ background: '#15706B', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0E4F4A')}
              onMouseLeave={e => (e.currentTarget.style.background = '#15706B')}
            >
              <Download className="h-4 w-4" />
              Download Report (JSON)
            </button>
          )}
          <button
            onClick={() => navigate('/flow')}
            className="flex items-center gap-2 px-5 py-2.5 font-medium transition-colors"
            style={{ background: 'transparent', border: '1.5px solid #15706B', borderRadius: '6px', color: '#15706B', fontSize: '13px', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#E8F5F3')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <RotateCcw className="h-4 w-4" />
            Verify Another Document
          </button>
          <button
            onClick={() => navigate('/')}
            className="px-5 py-2.5 font-medium transition-colors"
            style={{ background: 'transparent', border: '1.5px solid #E3E0D8', borderRadius: '6px', color: '#6B7280', fontSize: '13px', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F3F1EC')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            Return to Home
          </button>
        </div>
      </div>

      <div style={{ height: '40px' }} />
    </div>
  );
}
