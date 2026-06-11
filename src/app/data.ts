export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

export interface CheckItem {
  id: number;
  name: string;
  passResult: string;
  failResult: string;
  failReason?: string;
  status: CheckStatus;
}

export interface CheckGroup {
  name: string;
  checks: CheckItem[];
}

export const getReportData = (state: 'accepted' | 'rejected'): CheckGroup[] => {
  const isAccepted = state === 'accepted';

  return [
    {
      name: 'File Integrity',
      checks: [
        { id: 1, name: 'File size limit', passResult: '4.2 MB / 10 MB', failResult: '12.4 MB', failReason: 'exceeds 10 MB limit', status: 'PASS' },
        { id: 2, name: 'Allowed formats', passResult: 'PDF — accepted', failResult: 'TIFF not allowed', failReason: 'PDF, JPG, PNG only', status: 'PASS' },
        { id: 3, name: 'File extension vs MIME type', passResult: '.pdf matches application/pdf', failResult: '.jpg declared', failReason: 'MIME is application/pdf — mismatch', status: 'PASS' },
        { id: 4, name: 'File corruption check', passResult: 'Structure intact, fully readable', failResult: 'Truncated byte stream', failReason: 'file unreadable', status: 'PASS' },
        { id: 5, name: 'Password / encryption detection', passResult: 'No encryption detected', failResult: 'Password-protected', failReason: 'contents unreadable', status: 'PASS' },
      ],
    },
    {
      name: 'Readability',
      checks: [
        { id: 6, name: 'OCR success rate', passResult: '94% characters recognized', failResult: '38% recognized', failReason: 'below 70% threshold', status: 'PASS' },
        { id: 7, name: 'Blank page detection', passResult: 'Content detected on all pages', failResult: 'Page 2 appears blank', failReason: 'blank page', status: 'PASS' },
      ],
    },
    {
      name: 'Capture Quality',
      checks: [
        { id: 8, name: 'Blur detection', passResult: 'Sharpness 0.82 (sharp)', failResult: 'Sharpness 0.21', failReason: 'image too blurry', status: isAccepted ? 'PASS' : 'FAIL' },
        { id: 9, name: 'Shadow detection', passResult: 'No significant shadow', failResult: 'Heavy shadow', failReason: 'over 22% of document', status: 'PASS' },
        { id: 10, name: 'Glare detection', passResult: 'No glare hotspots', failResult: 'Specular glare detected', failReason: 'top-right', status: isAccepted ? 'PASS' : 'FAIL' },
        { id: 11, name: 'DPI check', passResult: '240 DPI', failResult: '96 DPI', failReason: 'below 200 DPI minimum', status: isAccepted ? 'PASS' : 'FAIL' },
        { id: 12, name: 'Skew / rotation detection', passResult: 'Skew 0.4°', failResult: 'Rotated 17°', failReason: 'exceeds 5° tolerance', status: 'PASS' },
        { id: 13, name: 'Brightness check', passResult: 'Brightness 0.58 (optimal)', failResult: 'Overexposed', failReason: 'brightness 0.94', status: isAccepted ? 'WARN' : 'PASS' },
        { id: 14, name: 'Noise / grain detection', passResult: 'Low noise (SNR 34 dB)', failResult: 'High grain', failReason: 'SNR 11 dB', status: 'PASS' },
      ],
    },
    {
      name: 'Content & Authenticity',
      checks: [
        { id: 15, name: 'Screenshot detection', passResult: 'No screen-capture artifacts', failResult: 'Screenshot detected', failReason: 'UI chrome / device metadata present', status: 'PASS' },
        { id: 16, name: 'Occlusion detection', passResult: 'Full document visible', failResult: 'Object occluding bottom-left corner', failReason: 'occlusion detected', status: isAccepted ? 'PASS' : 'FAIL' },
      ],
    },
  ];
};
