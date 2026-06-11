import { useState } from 'react';
import { useNavigate } from 'react-router';
import { HeartHandshake, House, Baby, ScrollText, CheckCircle2, AlertTriangle, Hash } from 'lucide-react';
import { UCCHeader } from '../components/UCCHeader';
import { UCCSidebar } from '../components/UCCSidebar';
import { UCCStepper, StepDef } from '../components/UCCStepper';
import { UCCFlowFooter } from '../components/UCCFlowFooter';
import { useValidation } from '../../app/hooks/useValidation';
import { UploadCard } from '../../app/components/UploadCard';
import { DocumentPreview } from '../../app/components/DocumentPreview';
import { ReportPanel } from '../../app/components/ReportPanel';
import { DevControls } from '../../app/components/DevControls';

const STEPS: StepDef[] = [
  { label: 'Select Document', subtitle: 'Choose document type' },
  { label: 'Verify Mode',     subtitle: 'How to provide proof' },
  { label: 'Upload & Verify', subtitle: 'Validate your document' },
];

interface DocType {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const DOCUMENTS: DocType[] = [
  { id: 'marriage',  label: 'Marriage Certificate',             icon: <HeartHandshake className="h-6 w-6" /> },
  { id: 'domicile',  label: 'Domicile / Residence Certificate', icon: <House className="h-6 w-6" /> },
  { id: 'birth',     label: 'Birth Certificate',                icon: <Baby className="h-6 w-6" /> },
  { id: 'death',     label: 'Death Certificate',                icon: <ScrollText className="h-6 w-6" /> },
];

// ── Step 1 ─────────────────────────────────────────────────────────────────

function Step1({ onSelect }: { onSelect: (id: string) => void }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 700, color: '#1F2937', marginBottom: '6px' }}>
        What document are you verifying?
      </h2>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
        Select a document type to continue.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {DOCUMENTS.map(doc => (
          <button
            key={doc.id}
            onClick={() => onSelect(doc.id)}
            className="flex items-center gap-4 border p-4 text-left transition-all hover:-translate-y-0.5"
            style={{
              borderRadius: '8px',
              fontFamily: 'Poppins, sans-serif',
              background: '#fff',
              borderColor: '#E3E0D8',
              boxShadow: '0 1px 3px rgba(0,0,0,.05)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#15706B'; e.currentTarget.style.background = '#E8F5F3'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E3E0D8'; e.currentTarget.style.background = '#fff'; }}
          >
            <span style={{ color: '#15706B', flexShrink: 0 }}>{doc.icon}</span>
            <span style={{ fontSize: '14px', fontWeight: 500, color: '#1F2937' }}>{doc.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2 ─────────────────────────────────────────────────────────────────

function Step2({ docId, onSelect }: { docId: string | null; onSelect: (mode: string) => void }) {
  const docLabel = DOCUMENTS.find(d => d.id === docId)?.label ?? 'Document';
  const [numberMode, setNumberMode] = useState(false);
  const [certNumber, setCertNumber] = useState('');

  return (
    <div>
      <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 700, color: '#1F2937', marginBottom: '6px' }}>
        How would you like to verify your{' '}
        <em style={{ fontStyle: 'normal', color: '#15706B' }}>{docLabel}</em>?
      </h2>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
        Select a verification mode to continue.
      </p>

      <div className="flex flex-col gap-3 max-w-lg">
        {/* Option 1: Upload */}
        <button
          onClick={() => onSelect('upload')}
          className="flex items-start gap-4 border p-4 text-left transition-all"
          style={{ borderRadius: '8px', background: '#fff', borderColor: '#E3E0D8', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#15706B'; e.currentTarget.style.background = '#E8F5F3'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E3E0D8'; e.currentTarget.style.background = '#fff'; }}
        >
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
            style={{ borderColor: '#15706B' }}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#15706B' }} />
          </span>
          <div>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>
              Upload the certificate
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
              Scan or photograph your {docLabel} and upload it for automated verification.
            </p>
          </div>
        </button>

        {/* Option 2: By number */}
        <div
          className="border transition-all"
          style={{
            borderRadius: '8px',
            borderColor: numberMode ? '#15706B' : '#E3E0D8',
            background: numberMode ? '#E8F5F3' : '#fff',
          }}
        >
          <button
            onClick={() => setNumberMode(v => !v)}
            className="flex w-full items-start gap-4 p-4 text-left"
            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          >
            <span
              className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
              style={{ borderColor: numberMode ? '#15706B' : '#D1D5DB' }}
            >
              {numberMode && <span className="h-2.5 w-2.5 rounded-full" style={{ background: '#15706B' }} />}
            </span>
            <div>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '14px', fontWeight: numberMode ? 600 : 400, color: '#1F2937' }}>
                By certificate / registration number
              </p>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
                Enter the certificate number to cross-reference and then upload.
              </p>
            </div>
          </button>

          {/* Inline number field */}
          {numberMode && (
            <div className="flex items-center gap-2 border-t px-4 pb-4 pt-3" style={{ borderColor: '#C6E8E4' }}>
              <Hash className="h-4 w-4 shrink-0" style={{ color: '#15706B' }} />
              <input
                type="text"
                placeholder={`Enter ${docLabel} number`}
                value={certNumber}
                onChange={e => setCertNumber(e.target.value)}
                autoFocus
                className="flex-1 px-3 py-2 outline-none"
                style={{
                  fontFamily: 'Poppins, sans-serif', fontSize: '13px',
                  border: '1px solid #D1D5DB', borderRadius: '6px', color: '#1F2937',
                  background: '#fff',
                }}
                onFocus={e => (e.target.style.borderColor = '#15706B')}
                onBlur={e => (e.target.style.borderColor = '#D1D5DB')}
              />
              <button
                onClick={() => onSelect('byNumber')}
                className="shrink-0 px-4 py-2 font-semibold text-white transition-colors"
                style={{ background: '#15706B', border: 'none', borderRadius: '6px', fontFamily: 'Poppins, sans-serif', fontSize: '13px', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#0E4F4A')}
                onMouseLeave={e => (e.currentTarget.style.background = '#15706B')}
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3 ─────────────────────────────────────────────────────────────────

interface Step3Props {
  v: ReturnType<typeof useValidation>;
  docLabel: string;
}

function Step3({ v, docLabel }: Step3Props) {
  const fileName = v.file?.name ?? 'document';
  const verdict = v.verdict;

  return (
    <div>
      <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 700, color: '#1F2937', marginBottom: '6px' }}>
        Upload your <em style={{ fontStyle: 'normal', color: '#15706B' }}>{docLabel}</em>
      </h2>
      <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', color: '#6B7280', marginBottom: '20px' }}>
        Upload your document. Our system will run 16 automated checks and return a verification verdict.
      </p>

      {/* Validator embedded — two-pane layout */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Left: upload + preview */}
        <div className="w-full lg:w-[360px] lg:shrink-0">
          <UploadCard
            phase={v.phase}
            file={v.file}
            onFile={v.setFile}
            onRun={v.runValidation}
          />
          {v.file && (
            <DocumentPreview
              file={v.file}
              results={v.results}
              isAnalyzing={v.phase === 'analyzing'}
            />
          )}
        </div>

        {/* Right: report */}
        <div
          className="flex-1 border"
          style={{ borderRadius: '8px', borderColor: '#E3E0D8', overflow: 'hidden', minHeight: '400px' }}
        >
          <ReportPanel
            phase={v.phase}
            fileName={fileName}
            results={v.results}
            verdict={verdict}
            onReset={v.reset}
          />
        </div>
      </div>

      {/* Verdict banner */}
      {verdict && (
        <div
          className="mt-4 flex items-center gap-3 px-4 py-3"
          style={{
            borderRadius: '8px',
            border: `1px solid ${verdict.decision === 'accepted' ? '#15706B' : '#DC2626'}`,
            background: verdict.decision === 'accepted' ? '#E8F5F3' : '#FEF2F2',
          }}
        >
          {verdict.decision === 'accepted' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: '#15706B' }} />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: '#DC2626' }} />
          )}
          <div>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', fontWeight: 600, color: verdict.decision === 'accepted' ? '#0E4F4A' : '#DC2626' }}>
              {verdict.decision === 'accepted'
                ? 'Document accepted — click Submit to proceed.'
                : 'Document not accepted — please recapture and retry.'}
            </p>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#6B7280', marginTop: '2px' }}>
              {verdict.passed}/16 checks passed · Confidence {verdict.confidence}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FlowScreen ─────────────────────────────────────────────────────────────

export function FlowScreen() {
  const navigate = useNavigate();
  const [step, setStep]       = useState(1);
  const [docId, setDocId]     = useState<string | null>(null);
  const [mode, setMode]       = useState<string | null>(null);
  const v = useValidation();

  const docLabel = DOCUMENTS.find(d => d.id === docId)?.label ?? 'Document';
  const canNext  = step === 3 && v.verdict?.decision === 'accepted';

  function pickDoc(id: string) {
    setDocId(id);
    setStep(2);
  }

  function pickMode(m: string) {
    setMode(m);
    setStep(3);
  }

  function handleNext() {
    if (step === 3 && v.verdict) {
      const ref = `RV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Math.floor(Math.random() * 99999)).padStart(5,'0')}`;
      navigate('/confirm', {
        state: {
          fileName: v.file?.name ?? 'document',
          verdict: v.verdict,
          results: v.results,
          service: docLabel,
          mode,
          ref,
        },
      });
    }
  }

  function handlePrev() {
    if (step > 1) { setStep(s => s - 1); return; }
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: '#F3F1EC', fontFamily: 'Poppins, sans-serif' }}>
      <UCCHeader variant="app" />

      <div className="flex flex-1">
        <UCCSidebar />

        <div className="flex flex-1 flex-col">
          {/* Breadcrumb */}
          <div
            className="flex items-center gap-1 border-b px-6 py-2.5"
            style={{ borderColor: '#E3E0D8', background: '#fff', fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#6B7280' }}
          >
            <a href="#" onClick={e => { e.preventDefault(); navigate('/'); }} style={{ color: '#15706B', textDecoration: 'none' }}>Home</a>
            <span>›</span>
            <a href="#" onClick={e => { e.preventDefault(); setStep(1); }} style={{ color: step === 1 ? '#1F2937' : '#15706B', textDecoration: 'none', fontWeight: step === 1 ? 600 : 400 }}>
              Document Verification
            </a>
            {step >= 2 && (
              <>
                <span>›</span>
                <span
                  style={{ color: step === 2 ? '#1F2937' : '#15706B', fontWeight: step === 2 ? 600 : 400, cursor: step > 2 ? 'pointer' : 'default' }}
                  onClick={() => step > 2 && setStep(2)}
                >
                  {docLabel}
                </span>
              </>
            )}
            {step >= 3 && (
              <>
                <span>›</span>
                <span style={{ color: '#1F2937', fontWeight: 600 }}>Upload &amp; Verify</span>
              </>
            )}
          </div>

          {/* Stepper */}
          <div className="border-b px-6 py-5" style={{ borderColor: '#E3E0D8', background: '#fff' }}>
            <UCCStepper steps={STEPS} current={step} />
          </div>

          {/* Step content */}
          <div className="flex-1 overflow-auto px-6 py-6">
            {step === 1 && <Step1 onSelect={pickDoc} />}
            {step === 2 && <Step2 docId={docId} onSelect={pickMode} />}
            {step === 3 && <Step3 v={v} docLabel={docLabel} />}
          </div>

          {/* Footer */}
          <UCCFlowFooter
            step={step}
            totalSteps={3}
            canNext={canNext}
            onNext={handleNext}
            onPrev={handlePrev}
            nextLabel="Submit"
          />
        </div>
      </div>

      <DevControls
        scenarioId={v.scenarioId}
        customOverrides={v.customOverrides}
        latencyMs={v.latencyMs}
        useRealMeta={v.useRealMeta}
        thresholds={v.thresholds}
        forceVerdict={v.forceVerdict}
        onScenario={v.setScenario}
        onCustomOverride={v.setCustomOverride}
        onLatency={v.setLatencyMs}
        onUseRealMeta={v.setUseRealMeta}
        onThreshold={v.setThreshold}
        onForceVerdict={v.setForceVerdict}
        onReset={v.devReset}
      />

      <div style={{ height: '40px' }} />
    </div>
  );
}
