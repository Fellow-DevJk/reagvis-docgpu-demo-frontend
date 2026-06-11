import { useState, useEffect, useRef } from 'react';
import { Verdict } from '../types';

interface VerdictHeaderProps {
  fileName: string;
  verdict: Verdict;
}

function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    let start: number | null = null;
    const step = (ts: number) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setValue(Math.round(pct * target));
      if (pct < 1) requestAnimationFrame(step);
    };
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, duration]);
  return value;
}

// Guilloche SVG — faint security lines behind the stamp
function Guilloche({ color }: { color: string }) {
  const paths = Array.from({ length: 18 }, (_, i) => {
    const yStep = 80 / 18;
    const y0 = i * yStep + yStep / 2;
    let d = `M 0 ${y0}`;
    for (let x = 0; x <= 400; x += 6) {
      const y = y0 + Math.sin(x * 0.065 + i * 0.45) * 2.8;
      d += ` L ${x} ${y.toFixed(2)}`;
    }
    return d;
  });

  return (
    <svg
      viewBox="0 0 400 80"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full pointer-events-none"
      style={{ opacity: 0.07 }}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} stroke={color} strokeWidth="0.6" fill="none" />
      ))}
    </svg>
  );
}

export function VerdictHeader({ fileName, verdict }: VerdictHeaderProps) {
  const { decision, confidence, passed, warned, failed, summary } = verdict;
  const animatedConf = useCountUp(confidence);
  const accepted = decision === 'accepted';
  const stampColor  = accepted ? '#1F6B4F' : '#A52714';
  const stampBg     = accepted ? '#E8F5EE' : '#F5E8E6';

  // Detect reduced-motion preference
  const prefersReduced =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return (
    <div className="border-b border-rule p-6 lg:p-8">
      {/* The stamp — single focal point */}
      <div className="mb-5 flex justify-center">
        <div
          className="relative inline-flex flex-col items-center overflow-hidden px-8 py-4"
          style={{
            border: `2px solid ${stampColor}`,
            outline: `1px solid ${stampColor}`,
            outlineOffset: '4px',
            background: stampBg,
            borderRadius: '2px',
            animation: prefersReduced ? 'none' : 'stampPress 0.45s cubic-bezier(0.22,1,0.36,1) both',
            minWidth: '260px',
          }}
        >
          <Guilloche color={stampColor} />

          {/* Verdict word */}
          <span
            className="relative z-10 tracking-[.16em] leading-none"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '28px',
              fontWeight: 600,
              color: stampColor,
              textTransform: 'uppercase',
            }}
          >
            {accepted ? 'ACCEPTED' : 'REJECTED'}
          </span>

          {/* Reference line */}
          <span
            className="relative z-10 mt-2"
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '10px',
              color: stampColor,
              letterSpacing: '.04em',
            }}
          >
            REF RV-2026-0610-00121 · DocGPU v1 · {new Date().getHours().toString().padStart(2,'0')}:{new Date().getMinutes().toString().padStart(2,'0')} IST · {passed}/16 PASS
          </span>
        </div>
      </div>

      {/* Meta line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-ink">{fileName}</p>
          <p
            className="mt-0.5 text-ink"
            style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
          >
            {accepted
              ? `Accepted. ${passed} of 16 checks passed.`
              : `Rejected — ${summary.toLowerCase()}. ${failed} check${failed !== 1 ? 's' : ''} failed.`}
          </p>
        </div>
        <span
          className="text-muted"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
        >
          confidence&nbsp;<strong className="text-ink">{animatedConf}%</strong>
        </span>
      </div>
    </div>
  );
}
