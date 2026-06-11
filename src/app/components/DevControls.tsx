import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Settings2, X, RotateCcw, ChevronDown } from 'lucide-react';
import { CheckId, Status, Thresholds } from '../types';
import { ScenarioId } from '../data/scenarios';
import { CHECK_DEFS } from '../data/checks';
import clsx from 'clsx';

interface DevControlsProps {
  scenarioId: ScenarioId;
  customOverrides: Partial<Record<CheckId, Status>>;
  latencyMs: number;
  useRealMeta: boolean;
  thresholds: Thresholds;
  forceVerdict: 'auto' | 'accepted' | 'rejected';
  onScenario: (id: ScenarioId) => void;
  onCustomOverride: (id: CheckId, status: Status | null) => void;
  onLatency: (ms: number) => void;
  onUseRealMeta: (v: boolean) => void;
  onThreshold: (key: keyof Thresholds, value: number) => void;
  onForceVerdict: (v: 'auto' | 'accepted' | 'rejected') => void;
  onReset: () => void;
}

const SCENARIOS: { id: ScenarioId; label: string; tag: string }[] = [
  { id: 'clean',         label: 'Clean',          tag: '→ Accept' },
  { id: 'badCapture',    label: 'Poor capture',    tag: '→ Reject' },
  { id: 'integrityFail', label: 'Integrity fail',  tag: '→ Reject' },
  { id: 'screenshot',    label: 'Screenshot',      tag: '→ Reject' },
  { id: 'custom',        label: 'Custom',          tag: 'Custom' },
];

const MONO: React.CSSProperties = { fontFamily: 'IBM Plex Mono, monospace' };
const SANS: React.CSSProperties = { fontFamily: 'IBM Plex Sans, sans-serif' };

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between">
        <span style={{ ...SANS, fontSize: '11px', color: '#4B5563' }}>{label}</span>
        <span style={{ ...MONO, fontSize: '11px', fontWeight: 500, color: '#1B1714' }}>{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer accent-orange" />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span style={{ ...SANS, fontSize: '11px', color: '#4B5563' }}>{label}</span>
      <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={clsx('relative h-4 w-8 rounded-full transition-colors', checked ? 'bg-orange' : 'bg-rule')}>
        <span className={clsx('absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </label>
  );
}

export function DevControls({
  scenarioId, customOverrides, latencyMs, useRealMeta, thresholds, forceVerdict,
  onScenario, onCustomOverride, onLatency, onUseRealMeta, onThreshold, onForceVerdict, onReset,
}: DevControlsProps) {
  const [open, setOpen] = useState(false);
  const [showPerCheck, setShowPerCheck] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex h-9 items-center gap-2 border border-rule bg-paper px-4 shadow-sm hover:bg-paper-sunk transition-colors"
        style={{ ...SANS, fontSize: '12px', fontWeight: 500, color: '#1B1714', borderRadius: '4px' }}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Dev Controls
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute bottom-11 right-0 w-72 border border-rule bg-paper shadow-lg"
            style={{ maxHeight: '80vh', overflowY: 'auto', borderRadius: '6px' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-rule px-4 py-3">
              <div>
                <p style={{ ...SANS, fontSize: '12px', fontWeight: 600, color: '#1B1714' }}>Dev Controls</p>
                <p style={{ ...MONO, fontSize: '10px', color: '#6E655A' }}>Demo only — not shown to end users</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 text-muted hover:text-ink transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-4">
              {/* Scenario */}
              <section>
                <p style={{ ...MONO, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6E655A', marginBottom: '6px' }}>Scenario</p>
                <div className="flex flex-col gap-1">
                  {SCENARIOS.map(s => (
                    <button key={s.id} onClick={() => onScenario(s.id)}
                      className="flex items-center justify-between px-3 py-1.5 text-left transition-colors border"
                      style={{ borderRadius: '4px', borderColor: scenarioId === s.id ? '#D2541B' : '#D8D1C4', background: scenarioId === s.id ? '#D2541B' : 'transparent', ...SANS, fontSize: '12px' }}
                    >
                      <span style={{ color: scenarioId === s.id ? '#F5F3EE' : '#1B1714' }}>{s.label}</span>
                      <span style={{ ...MONO, fontSize: '10px', color: scenarioId === s.id ? 'rgba(245,243,238,.75)' : '#6E655A' }}>{s.tag}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* Real meta toggle */}
              <section className="border-t border-rule pt-3">
                <Toggle label="Use real file metadata" checked={useRealMeta} onChange={onUseRealMeta} />
              </section>

              {/* Thresholds */}
              <section className="border-t border-rule pt-3 flex flex-col gap-2">
                <p style={{ ...MONO, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6E655A' }}>Thresholds</p>
                <Slider label="OCR min %" value={thresholds.ocrMin} min={0} max={100} step={5} onChange={v => onThreshold('ocrMin', v)} display={`${thresholds.ocrMin}%`} />
                <Slider label="DPI min" value={thresholds.dpiMin} min={50} max={600} step={10} onChange={v => onThreshold('dpiMin', v)} display={`${thresholds.dpiMin}`} />
                <Slider label="Blur min (sharpness)" value={thresholds.blurMin} min={0} max={1} step={0.05} onChange={v => onThreshold('blurMin', v)} display={thresholds.blurMin.toFixed(2)} />
                <Slider label="Skew tolerance (°)" value={thresholds.skewTolerance} min={0} max={20} step={0.5} onChange={v => onThreshold('skewTolerance', v)} display={`${thresholds.skewTolerance}°`} />
                <Slider label="Max file (MB)" value={thresholds.maxFileMB} min={1} max={50} step={1} onChange={v => onThreshold('maxFileMB', v)} display={`${thresholds.maxFileMB} MB`} />
              </section>

              {/* Latency */}
              <section className="border-t border-rule pt-3">
                <Slider label="Simulated latency" value={latencyMs} min={0} max={4000} step={100} onChange={onLatency} display={`${latencyMs}ms`} />
              </section>

              {/* Force verdict */}
              <section className="border-t border-rule pt-3">
                <p style={{ ...MONO, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6E655A', marginBottom: '6px' }}>Force Verdict</p>
                <div className="grid grid-cols-3 gap-1">
                  {(['auto', 'accepted', 'rejected'] as const).map(v => (
                    <button key={v} onClick={() => onForceVerdict(v)}
                      className="py-1.5 border transition-colors capitalize"
                      style={{
                        ...MONO, fontSize: '10px', fontWeight: 500, borderRadius: '3px',
                        borderColor: forceVerdict === v ? (v === 'accepted' ? '#1F6B4F' : v === 'rejected' ? '#A52714' : '#1B1714') : '#D8D1C4',
                        background: forceVerdict === v ? (v === 'accepted' ? '#E8F5EE' : v === 'rejected' ? '#F5E8E6' : '#ECE7DD') : 'transparent',
                        color: forceVerdict === v ? (v === 'accepted' ? '#1F6B4F' : v === 'rejected' ? '#A52714' : '#1B1714') : '#6E655A',
                      }}
                    >{v}</button>
                  ))}
                </div>
              </section>

              {/* Per-check (custom only) */}
              {scenarioId === 'custom' && (
                <section className="border-t border-rule pt-3">
                  <button onClick={() => setShowPerCheck(v => !v)} className="mb-2 flex w-full items-center justify-between">
                    <p style={{ ...MONO, fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em', color: '#6E655A' }}>Per-check override</p>
                    <ChevronDown className={clsx('h-3 w-3 text-muted transition-transform', showPerCheck && 'rotate-180')} />
                  </button>
                  {showPerCheck && (
                    <div className="flex flex-col gap-0.5">
                      {CHECK_DEFS.map(def => (
                        <div key={def.id} className="flex items-center justify-between gap-2 py-1">
                          <span style={{ ...SANS, fontSize: '11px', color: '#4B5563' }} className="truncate flex-1">{def.name}</span>
                          <select
                            value={customOverrides[def.id] ?? 'default'}
                            onChange={e => { const val = e.target.value; onCustomOverride(def.id, val === 'default' ? null : val as Status); }}
                            className="border border-rule bg-paper px-1.5 py-0.5 focus:outline-none"
                            style={{ ...MONO, fontSize: '10px', borderRadius: '2px' }}
                          >
                            <option value="default">—</option>
                            <option value="pass">pass</option>
                            <option value="warn">warn</option>
                            <option value="fail">fail</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Reset */}
              <button onClick={onReset} className="flex w-full items-center justify-center gap-2 border border-rule py-2 transition-colors hover:bg-paper-sunk"
                style={{ ...SANS, fontSize: '12px', fontWeight: 500, color: '#6E655A', borderRadius: '4px' }}>
                <RotateCcw className="h-3 w-3" />
                Reset to defaults
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
