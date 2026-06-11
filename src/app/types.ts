export type CheckId =
  | 'fileSize' | 'allowedFormat' | 'extMimeMatch' | 'corruption' | 'encryption'
  | 'ocrRate' | 'blankPage'
  | 'blur' | 'shadow' | 'glare' | 'dpi' | 'skew' | 'brightness' | 'noise'
  | 'screenshot' | 'occlusion';

export type Group = 'integrity' | 'readability' | 'quality' | 'authenticity';
export type Status = 'pass' | 'fail' | 'warn';
export type CheckKind = 'binary' | 'score';

export interface CheckDef {
  id: CheckId;
  name: string;
  group: Group;
  kind: CheckKind;
  real?: boolean;
}

export interface CheckResult {
  id: CheckId;
  status: Status;
  metric?: string;
  barPct?: number;
  reason?: string;
  rawScore?: number;
}

export interface Verdict {
  decision: 'accepted' | 'rejected';
  confidence: number;
  passed: number;
  warned: number;
  failed: number;
  summary: string;
}

export interface Thresholds {
  ocrMin: number;
  dpiMin: number;
  blurMin: number;
  skewTolerance: number;
  maxFileMB: number;
}
