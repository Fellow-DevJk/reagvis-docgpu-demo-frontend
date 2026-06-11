import { useState, useEffect, useMemo } from 'react';
import { CheckResult } from '../types';

interface DocumentPreviewProps {
  file?: File | null;
  results?: CheckResult[] | null;
  isAnalyzing?: boolean;
}

// Guilloche security-line pattern for document background
function Guilloche({ color, opacity = 0.07, lineCount = 14 }: { color: string; opacity?: number; lineCount?: number }) {
  const paths = Array.from({ length: lineCount }, (_, i) => {
    const H = 160;
    const yStep = H / lineCount;
    const y0 = i * yStep + yStep / 2;
    let d = `M 0 ${y0}`;
    for (let x = 0; x <= 400; x += 5) {
      const y = y0 + Math.sin(x * 0.07 + i * 0.42) * 2.5;
      d += ` L ${x} ${y.toFixed(1)}`;
    }
    return d;
  });
  return (
    <svg
      viewBox="0 0 400 160"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ opacity }}
    >
      {paths.map((d, i) => <path key={i} d={d} stroke={color} strokeWidth="0.55" fill="none" />)}
    </svg>
  );
}

// Minimal QR code grid
function QRCode({ size = 44 }: { size?: number }) {
  const grid = [
    [1,1,1,0,1,0,1,1,1],[1,0,1,0,0,0,1,0,1],[1,0,1,1,1,0,1,0,1],
    [0,0,0,0,1,1,0,0,0],[1,1,0,1,0,1,1,1,0],[0,0,0,1,0,0,0,1,1],
    [1,1,1,0,1,0,1,1,1],[1,0,1,0,0,1,1,0,0],[1,0,1,1,1,1,0,1,0],
  ];
  const c = size / grid.length;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      {grid.map((row, ri) => row.map((cell, ci) =>
        cell ? <rect key={`${ri}-${ci}`} x={ci*c} y={ri*c} width={c} height={c} fill="#1C6B68" /> : null
      ))}
    </svg>
  );
}

// Ashoka Chakra (24 spokes)
function Chakra({ size = 24 }: { size?: number }) {
  const r = size / 2;
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * 2 * Math.PI;
    const x1 = r + r * 0.22 * Math.cos(a), y1 = r + r * 0.22 * Math.sin(a);
    const x2 = r + r * 0.82 * Math.cos(a), y2 = r + r * 0.82 * Math.sin(a);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} L${x2.toFixed(1)},${y2.toFixed(1)}`;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <circle cx={r} cy={r} r={r*0.88} fill="none" stroke="white" strokeWidth="1.2" />
      <circle cx={r} cy={r} r={r*0.18} fill="white" />
      {spokes.map((d, i) => <path key={i} d={d} stroke="white" strokeWidth="0.6" />)}
    </svg>
  );
}

interface OverlayBox { id: string; label: string; style: React.CSSProperties }
function getOverlays(results: CheckResult[]): OverlayBox[] {
  const st = new Map(results.map(r => [r.id, r.status]));
  const boxes: OverlayBox[] = [];
  if (st.get('blur')      === 'fail') boxes.push({ id: 'blur',       label: 'Blur',       style: { top: '30%', left: '10%', width: '80%', height: '25%' } });
  if (st.get('glare')     === 'fail') boxes.push({ id: 'glare',      label: 'Glare',      style: { top: '5%', right: '5%', width: '28%', height: '18%' } });
  if (st.get('occlusion') === 'fail') boxes.push({ id: 'occlusion',  label: 'Occlusion',  style: { bottom: '5%', left: '2%', width: '26%', height: '18%' } });
  if (st.get('screenshot')  === 'fail') boxes.push({ id: 'screenshot', label: 'Screenshot', style: { top: '2%', left: '2%', right: '2%', bottom: '2%' } });
  return boxes;
}

function FieldRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex w-full justify-between gap-1" style={{ fontSize: '6px' }}>
      <span style={{ color: '#6E655A', minWidth: '38%' }}>{label}:</span>
      <span style={{ color: '#1B1714', fontWeight: bold ? 600 : 400, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export function DocumentPreview({ file, results, isAnalyzing }: DocumentPreviewProps) {
  const [showOverlays, setShowOverlays] = useState(true);
  const overlays = results ? getOverlays(results) : [];
  const hasIssues = overlays.length > 0;

  const objectUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl); }, [objectUrl]);
  const isPdf = file?.type === 'application/pdf';

  return (
    <div className="mt-5 border border-rule" style={{ borderRadius: '4px' }}>
      {/* Header row */}
      <div className="flex items-center justify-between border-b border-rule px-3 py-2">
        <span
          className="text-muted"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '.1em' }}
        >
          Document preview
        </span>
        {results && hasIssues && (
          <button
            onClick={() => setShowOverlays(v => !v)}
            style={{
              fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px', color: '#6E655A',
              background: 'none', border: '1px solid #D8D1C4', padding: '2px 8px', borderRadius: '3px', cursor: 'pointer',
            }}
          >
            {showOverlays ? 'Hide flagged regions' : 'Show flagged regions'}
          </button>
        )}
      </div>

      {/* Certificate */}
      <div className="relative overflow-hidden" style={{ aspectRatio: '3/4' }}>
        <div
          className="absolute inset-0 overflow-hidden bg-white"
          style={{ filter: isAnalyzing ? 'grayscale(1) blur(1.5px)' : 'none', transition: 'filter 0.3s' }}
        >
          {objectUrl && isPdf ? (
            <iframe
              src={objectUrl}
              title="Document preview"
              className="h-full w-full border-0"
              style={{ display: 'block' }}
            />
          ) : objectUrl ? (
            <img
              src={objectUrl}
              alt="Document preview"
              className="h-full w-full object-contain"
              style={{ display: 'block' }}
            />
          ) : (
            <>
              {/* Security paper guilloche */}
              <Guilloche color="#1C6B68" opacity={0.055} lineCount={18} />

              {/* Teal header band */}
              <div
                className="relative flex items-center justify-between px-3 py-2"
                style={{ background: 'linear-gradient(135deg,#1C6B68,#134E4A)', position: 'relative', zIndex: 1 }}
              >
                <div className="flex flex-col">
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '6px', fontWeight: 500, color: 'white', textTransform: 'uppercase', letterSpacing: '.1em' }}>
                    GOVERNMENT OF UTTARAKHAND
                  </span>
                  <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '5px', color: 'rgba(255,255,255,.7)', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                    UNIFORM CIVIL CODE PORTAL
                  </span>
                </div>
                <Chakra size={24} />
              </div>

              {/* Watermark */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ zIndex: 0 }}>
                <span style={{ fontSize: '28px', color: '#1C6B68', opacity: 0.035, transform: 'rotate(-35deg)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  UTTARAKHAND GOVT
                </span>
              </div>

              {/* Body */}
              <div className="relative flex flex-col items-center px-3 pb-2 pt-2" style={{ gap: '4px', zIndex: 1 }}>
                <div className="w-full border-y py-0.5 text-center" style={{ borderColor: '#1C6B68', fontSize: '7px', fontWeight: 600, color: '#1C6B68', textTransform: 'uppercase', letterSpacing: '.08em', fontFamily: 'IBM Plex Mono, monospace' }}>
                  Certificate of Registration of Marriage
                </div>
                <div className="border px-3 py-0.5" style={{ borderColor: '#1C6B68', fontSize: '6px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, color: '#1C6B68', background: '#f0fafb' }}>
                  UCC-260610-00121
                </div>

                <FieldRow label="Groom's Name"      value="Arjun Singh Rawat" />
                <FieldRow label="Bride's Name"       value="Priya Devi Negi" />
                <FieldRow label="Date of Marriage"   value="10 June 2026" />
                <FieldRow label="Place"              value="Dehradun, Uttarakhand" />
                <FieldRow label="Registration No."   value="UCC-260610-00121" bold />
                <FieldRow label="Registrar"          value="District Registrar, Dehradun" />

                <div className="my-1 w-full border-t" style={{ borderColor: '#D8D1C4' }} />

                {/* Bottom block */}
                <div className="flex w-full items-end justify-between">
                  <div className="flex h-10 w-10 flex-col items-center justify-center rounded-full border-2" style={{ borderColor: '#1C6B68', borderStyle: 'double', background: '#f0fafb' }}>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '4px', color: '#1C6B68', textAlign: 'center', lineHeight: 1.4, fontWeight: 600 }}>OFFICIAL{'\n'}SEAL</span>
                  </div>
                  <div className="flex flex-col items-center" style={{ gap: '2px' }}>
                    <svg width="55" height="14" viewBox="0 0 55 14">
                      <path d="M3 11 Q14 2 18 7 Q22 12 28 5 Q36 0 52 9" fill="none" stroke="#1C6B68" strokeWidth="1.1" strokeLinecap="round" />
                    </svg>
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '4.5px', color: '#134E4A', fontWeight: 500 }}>District Registrar</span>
                  </div>
                  <QRCode size={40} />
                </div>

                <p style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '4.5px', color: '#6E655A', textAlign: 'center', marginTop: '2px' }}>
                  Issued under the Uniform Civil Code, Uttarakhand Act 2024
                </p>
              </div>
            </>
          )}
        </div>

        {/* Scan line */}
        {isAnalyzing && (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="h-[2px] w-full bg-orange" style={{ boxShadow: '0 0 12px rgba(210,84,27,.8)', animation: 'scan 2s ease-in-out infinite' }} />
            <div className="absolute inset-0 bg-orange/6 animate-pulse" />
          </div>
        )}

        {/* Issue overlays */}
        {results && showOverlays && overlays.map(box => (
          <div
            key={box.id}
            className="pointer-events-none absolute"
            style={{ ...box.style, border: '1.5px dashed #A52714', background: 'rgba(165,39,20,0.06)', borderRadius: '2px', zIndex: 15 }}
          >
            <span className="absolute -top-4 right-0 px-1 py-0.5 text-white" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '8px', fontWeight: 600, background: '#A52714', borderRadius: '1px', whiteSpace: 'nowrap' }}>
              {box.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
