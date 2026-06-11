import { CheckId, CheckResult } from '../types';

export type ScenarioId = 'clean' | 'badCapture' | 'integrityFail' | 'screenshot' | 'custom';

// rawScore fields carry the natural-unit value used by threshold comparison:
//   ocrRate → percentage (0–100)
//   blur    → sharpness (0–1)
//   dpi     → dots-per-inch
//   skew    → degrees
//   brightness → 0–1
//   noise   → SNR in dB
//   fileSize → MB (only for demo base; real file overrides this)

const cleanBase: Record<CheckId, CheckResult> = {
  fileSize:      { id: 'fileSize',      status: 'pass', metric: '4.2 MB / 10 MB',                barPct: 42,  rawScore: 4.2 },
  allowedFormat: { id: 'allowedFormat', status: 'pass', metric: 'PDF — accepted' },
  extMimeMatch:  { id: 'extMimeMatch',  status: 'pass', metric: '.pdf matches application/pdf' },
  corruption:    { id: 'corruption',    status: 'pass', metric: 'Structure intact, readable' },
  encryption:    { id: 'encryption',    status: 'pass', metric: 'No encryption detected' },
  ocrRate:       { id: 'ocrRate',       status: 'pass', metric: '94% characters recognized',      barPct: 94,  rawScore: 94 },
  blankPage:     { id: 'blankPage',     status: 'pass', metric: 'Content on all pages' },
  blur:          { id: 'blur',          status: 'pass', metric: 'Sharpness 0.82 (sharp)',          barPct: 82,  rawScore: 0.82 },
  shadow:        { id: 'shadow',        status: 'pass', metric: 'No significant shadow' },
  glare:         { id: 'glare',         status: 'pass', metric: 'No glare hotspots' },
  dpi:           { id: 'dpi',           status: 'pass', metric: '240 DPI',                         barPct: 80,  rawScore: 240 },
  skew:          { id: 'skew',          status: 'pass', metric: 'Skew 0.4°',                       barPct: 92,  rawScore: 0.4 },
  brightness:    { id: 'brightness',    status: 'warn', metric: 'Brightness 0.78 — slightly bright', barPct: 78, rawScore: 0.78, reason: 'Brightness 0.78 — slightly bright' },
  noise:         { id: 'noise',         status: 'pass', metric: 'Low noise (SNR 34 dB)',           barPct: 85,  rawScore: 34 },
  screenshot:    { id: 'screenshot',    status: 'pass', metric: 'No screen-capture artifacts' },
  occlusion:     { id: 'occlusion',     status: 'pass', metric: 'Full document visible' },
};

const cleanPassBrightness: CheckResult = {
  id: 'brightness', status: 'pass', metric: 'Brightness 0.58 (optimal)', barPct: 58, rawScore: 0.58,
};

export const SCENARIOS: Record<ScenarioId, Record<CheckId, CheckResult>> = {
  clean: { ...cleanBase },

  badCapture: {
    ...cleanBase,
    brightness: cleanPassBrightness,
    blur:      { id: 'blur',      status: 'fail', metric: 'Sharpness 0.21',              barPct: 21, rawScore: 0.21, reason: 'Sharpness 0.21 — too blurry' },
    glare:     { id: 'glare',     status: 'fail', metric: 'Specular glare detected',                               reason: 'Specular glare, top-right' },
    dpi:       { id: 'dpi',       status: 'fail', metric: '96 DPI',                      barPct: 20, rawScore: 96,  reason: '96 DPI — below 200 DPI minimum' },
    occlusion: { id: 'occlusion', status: 'fail', metric: 'Object occluding bottom-left corner',                  reason: 'Object occluding bottom-left corner' },
  },

  integrityFail: {
    ...cleanBase,
    brightness: cleanPassBrightness,
    encryption: { id: 'encryption', status: 'fail', metric: 'Password-protected',            reason: 'Password-protected — contents unreadable' },
    ocrRate:    { id: 'ocrRate',    status: 'fail', metric: '0% recognized', barPct: 0, rawScore: 0, reason: '0% — file unreadable' },
  },

  screenshot: {
    ...cleanBase,
    brightness: cleanPassBrightness,
    screenshot: { id: 'screenshot', status: 'fail', metric: 'Screenshot detected',                                reason: 'Screenshot detected — UI chrome / device metadata' },
    dpi:        { id: 'dpi',        status: 'warn', metric: '132 DPI',                     barPct: 44, rawScore: 132, reason: '132 DPI — low for capture' },
  },

  custom: { ...cleanBase },
};
