import { useState, useCallback, useRef, useMemo } from 'react';
import { CheckId, CheckResult, Status, Thresholds, Verdict } from '../types';
import { CHECK_DEFS } from '../data/checks';
import { SCENARIOS, ScenarioId } from '../data/scenarios';
import { computeVerdict } from '../lib/verdict';
import { inspectFile } from '../lib/fileInspect';

export type ValidationPhase = 'idle' | 'fileSelected' | 'analyzing' | 'results';

const DEFAULT_THRESHOLDS: Thresholds = {
  ocrMin: 70,
  dpiMin: 200,
  blurMin: 0.30,
  skewTolerance: 5,
  maxFileMB: 10,
};

// Apply threshold-based recomputation to score checks that carry rawScore.
function applyThresholds(
  base: Record<CheckId, CheckResult>,
  t: Thresholds,
): Record<CheckId, CheckResult> {
  const r = { ...base };

  const ocr = r.ocrRate;
  if (ocr.rawScore !== undefined) {
    const raw = ocr.rawScore;
    const pass = raw >= t.ocrMin;
    r.ocrRate = {
      ...ocr,
      status: pass ? 'pass' : 'fail',
      barPct: raw,
      metric: pass
        ? `${raw}% characters recognized`
        : `${raw}% recognized — below ${t.ocrMin}% threshold`,
      reason: pass ? undefined : `${raw}% recognized — below ${t.ocrMin}% threshold`,
    };
  }

  const blur = r.blur;
  if (blur.rawScore !== undefined) {
    const raw = blur.rawScore;
    const pass = raw >= t.blurMin;
    r.blur = {
      ...blur,
      status: pass ? 'pass' : 'fail',
      barPct: Math.round(raw * 100),
      metric: pass
        ? `Sharpness ${raw.toFixed(2)} (sharp)`
        : `Sharpness ${raw.toFixed(2)} — too blurry`,
      reason: pass ? undefined : `Sharpness ${raw.toFixed(2)} — too blurry`,
    };
  }

  const dpi = r.dpi;
  if (dpi.rawScore !== undefined) {
    const raw = dpi.rawScore;
    const pass = raw >= t.dpiMin;
    const warn = !pass && raw >= t.dpiMin * 0.65;
    r.dpi = {
      ...dpi,
      status: pass ? 'pass' : warn ? 'warn' : 'fail',
      barPct: Math.min(100, Math.round((raw / Math.max(t.dpiMin, 1)) * 80)),
      metric: pass ? `${raw} DPI` : `${raw} DPI`,
      reason: pass ? undefined : `${raw} DPI — below ${t.dpiMin} DPI minimum`,
    };
  }

  const skew = r.skew;
  if (skew.rawScore !== undefined) {
    const raw = skew.rawScore;
    const pass = raw <= t.skewTolerance;
    r.skew = {
      ...skew,
      status: pass ? 'pass' : 'fail',
      barPct: Math.max(0, Math.round(100 - (raw / Math.max(t.skewTolerance, 1)) * 100)),
      metric: pass
        ? `Skew ${raw}°`
        : `Rotated ${raw}° — exceeds ${t.skewTolerance}° tolerance`,
      reason: pass ? undefined : `Rotated ${raw}° — exceeds ${t.skewTolerance}° tolerance`,
    };
  }

  const fileSize = r.fileSize;
  if (fileSize.rawScore !== undefined) {
    const raw = fileSize.rawScore;
    const pass = raw <= t.maxFileMB;
    r.fileSize = {
      ...fileSize,
      status: pass ? 'pass' : 'fail',
      barPct: Math.min(100, Math.round((raw / t.maxFileMB) * 100)),
      metric: `${raw.toFixed(1)} MB / ${t.maxFileMB} MB`,
      reason: pass ? undefined : `${raw.toFixed(1)} MB — exceeds ${t.maxFileMB} MB limit`,
    };
  }

  return r;
}

function buildResults(
  scenarioId: ScenarioId,
  customOverrides: Partial<Record<CheckId, Status>>,
  thresholds: Thresholds,
  realMetaResults: Partial<Record<CheckId, CheckResult>>,
  useRealMeta: boolean,
): CheckResult[] {
  // 1. Base from scenario (custom starts from clean)
  const base = { ...(scenarioId === 'custom' ? SCENARIOS.clean : SCENARIOS[scenarioId]) };

  // 2. Threshold-based recomputation
  const withThresholds = applyThresholds(base, thresholds);

  // 3. Real file inspection overrides integrity checks
  const withReal = useRealMeta
    ? { ...withThresholds, ...realMetaResults }
    : withThresholds;

  // 4. Per-check status overrides (custom scenario only)
  const withCustom = { ...withReal };
  if (scenarioId === 'custom') {
    for (const [id, status] of Object.entries(customOverrides) as [CheckId, Status][]) {
      if (withCustom[id]) {
        withCustom[id] = {
          ...withCustom[id],
          status,
          reason: status !== 'pass' ? (withCustom[id].reason ?? `Overridden to ${status}`) : undefined,
        };
      }
    }
  }

  return CHECK_DEFS.map(def => withCustom[def.id]).filter(Boolean) as CheckResult[];
}

export function useValidation() {
  const [phase, setPhase] = useState<ValidationPhase>('idle');
  const [file, setFileState] = useState<File | null>(null);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('clean');
  const [customOverrides, setCustomOverrides] = useState<Partial<Record<CheckId, Status>>>({});
  const [latencyMs, setLatencyMs] = useState(1800);
  const [useRealMeta, setUseRealMeta] = useState(true);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [forceVerdict, setForceVerdict] = useState<'auto' | 'accepted' | 'rejected'>('auto');
  const [realMetaResults, setRealMetaResults] = useState<Partial<Record<CheckId, CheckResult>>>({});
  const [committedResults, setCommittedResults] = useState<CheckResult[] | null>(null);
  const analyzeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live results during 'results' phase — recomputed whenever any dep changes
  const liveResults = useMemo<CheckResult[] | null>(() => {
    if (phase !== 'results') return null;
    return buildResults(scenarioId, customOverrides, thresholds, realMetaResults, useRealMeta);
  }, [phase, scenarioId, customOverrides, thresholds, realMetaResults, useRealMeta]);

  const results = phase === 'results' ? liveResults : null;

  const verdict = useMemo<Verdict | null>(() => {
    if (!results) return null;
    return computeVerdict(results, forceVerdict);
  }, [results, forceVerdict]);

  const setFile = useCallback(async (f: File | null) => {
    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);
    setFileState(f);
    setRealMetaResults({});

    if (!f) {
      setPhase('idle');
      setCommittedResults(null);
      return;
    }

    setPhase('fileSelected');
    setCommittedResults(null);

    if (useRealMeta) {
      try {
        const meta = await inspectFile(f, thresholds.maxFileMB);
        setRealMetaResults(meta);
      } catch {
        // ignore inspection errors silently
      }
    }
  }, [useRealMeta, thresholds.maxFileMB]);

  const runValidation = useCallback(() => {
    if (phase !== 'fileSelected' && phase !== 'results') return;
    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);
    setPhase('analyzing');
    analyzeTimerRef.current = setTimeout(() => {
      setPhase('results');
    }, latencyMs);
  }, [phase, latencyMs]);

  const reset = useCallback(() => {
    if (analyzeTimerRef.current) clearTimeout(analyzeTimerRef.current);
    setCommittedResults(null);
    setPhase('fileSelected');
  }, []);

  const setScenario = useCallback((id: ScenarioId) => {
    setScenarioId(id);
    if (id !== 'custom') setCustomOverrides({});
  }, []);

  const setCustomOverride = useCallback((id: CheckId, status: Status | null) => {
    setCustomOverrides(prev => {
      const next = { ...prev };
      if (status === null) delete next[id];
      else next[id] = status;
      return next;
    });
  }, []);

  const setThreshold = useCallback(<K extends keyof Thresholds>(key: K, value: number) => {
    setThresholds(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleUseRealMeta = useCallback(async (v: boolean) => {
    setUseRealMeta(v);
    if (v && file) {
      try {
        const meta = await inspectFile(file, thresholds.maxFileMB);
        setRealMetaResults(meta);
      } catch {/* ignore */}
    } else if (!v) {
      setRealMetaResults({});
    }
  }, [file, thresholds.maxFileMB]);

  const devReset = useCallback(() => {
    setScenarioId('clean');
    setCustomOverrides({});
    setLatencyMs(1800);
    setThresholds(DEFAULT_THRESHOLDS);
    setForceVerdict('auto');
  }, []);

  return {
    phase,
    file,
    results,
    verdict,
    scenarioId,
    customOverrides,
    latencyMs,
    useRealMeta,
    thresholds,
    forceVerdict,
    realMetaResults,
    setFile,
    runValidation,
    reset,
    setScenario,
    setCustomOverride,
    setLatencyMs,
    setUseRealMeta: toggleUseRealMeta,
    setThreshold,
    setForceVerdict,
    devReset,
  };
}
