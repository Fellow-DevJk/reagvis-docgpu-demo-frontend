import { useEffect, useState } from 'react';

const SCALES = [0.875, 1, 1.125] as const;
const LABELS = ['A−', 'A', 'A+'] as const;

export function UtilityBar() {
  const [scaleIdx, setScaleIdx] = useState(1);

  useEffect(() => {
    document.documentElement.style.fontSize = `${16 * SCALES[scaleIdx]}px`;
  }, [scaleIdx]);

  return (
    <div
      className="flex h-7 items-center justify-between border-b border-rule bg-paper-sunk px-6 lg:px-8"
      style={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }}
    >
      <span className="font-medium uppercase tracking-[.1em] text-muted">
        DEMO ENVIRONMENT&nbsp;&nbsp;·&nbsp;&nbsp;build&nbsp;a1f9c3
      </span>

      <div className="flex items-center gap-4">
        {/* Text-size controls */}
        <div className="flex items-center gap-0.5" aria-label="Text size">
          {LABELS.map((lbl, i) => (
            <button
              key={i}
              onClick={() => setScaleIdx(i)}
              aria-pressed={scaleIdx === i}
              className={`px-1.5 py-0.5 rounded-sm transition-colors ${
                scaleIdx === i
                  ? 'bg-ink text-paper'
                  : 'text-muted hover:text-ink'
              }`}
              style={{ fontSize: i === 0 ? '10px' : i === 2 ? '13px' : '11px', lineHeight: 1 }}
            >
              {lbl}
            </button>
          ))}
        </div>

        {/* Status dot */}
        <span className="flex items-center gap-1.5 text-muted">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-seal-green"
            style={{ boxShadow: '0 0 0 2px #E8F5EE' }}
          />
          Model online
        </span>
      </div>
    </div>
  );
}
