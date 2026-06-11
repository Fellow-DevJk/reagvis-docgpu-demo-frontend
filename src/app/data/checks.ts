import { CheckDef, CheckId, Group } from '../types';

export interface GroupMeta {
  id: Group;
  label: string;
  ids: CheckId[];
}

export const CHECK_DEFS: CheckDef[] = [
  { id: 'fileSize',     name: 'File size limit',               group: 'integrity',    kind: 'binary', real: true },
  { id: 'allowedFormat',name: 'Allowed formats',               group: 'integrity',    kind: 'binary', real: true },
  { id: 'extMimeMatch', name: 'File extension vs MIME type',   group: 'integrity',    kind: 'binary', real: true },
  { id: 'corruption',   name: 'File corruption check',         group: 'integrity',    kind: 'binary', real: true },
  { id: 'encryption',   name: 'Password / encryption detection', group: 'integrity',  kind: 'binary', real: true },
  { id: 'ocrRate',      name: 'OCR success rate',              group: 'readability',  kind: 'score' },
  { id: 'blankPage',    name: 'Blank page detection',          group: 'readability',  kind: 'binary' },
  { id: 'blur',         name: 'Blur detection',                group: 'quality',      kind: 'score' },
  { id: 'shadow',       name: 'Shadow detection',              group: 'quality',      kind: 'binary' },
  { id: 'glare',        name: 'Glare detection',               group: 'quality',      kind: 'binary' },
  { id: 'dpi',          name: 'DPI check',                     group: 'quality',      kind: 'score' },
  { id: 'skew',         name: 'Skew / rotation detection',     group: 'quality',      kind: 'score' },
  { id: 'brightness',   name: 'Brightness check',              group: 'quality',      kind: 'score' },
  { id: 'noise',        name: 'Noise / grain detection',       group: 'quality',      kind: 'score' },
  { id: 'screenshot',   name: 'Screenshot detection',          group: 'authenticity', kind: 'binary' },
  { id: 'occlusion',    name: 'Occlusion detection',           group: 'authenticity', kind: 'binary' },
];

export const GROUPS: GroupMeta[] = [
  { id: 'integrity',    label: 'FILE INTEGRITY',          ids: ['fileSize', 'allowedFormat', 'extMimeMatch', 'corruption', 'encryption'] },
  { id: 'readability',  label: 'READABILITY',             ids: ['ocrRate', 'blankPage'] },
  { id: 'quality',      label: 'CAPTURE QUALITY',         ids: ['blur', 'shadow', 'glare', 'dpi', 'skew', 'brightness', 'noise'] },
  { id: 'authenticity', label: 'CONTENT & AUTHENTICITY',  ids: ['screenshot', 'occlusion'] },
];
