import { useState } from 'react';

const SCALES = [0.875, 1, 1.125] as const;
const LABELS = ['A−', 'A', 'A+'] as const;

export function UCCUtilityBar() {
  const [scaleIdx, setScaleIdx] = useState(1);

  function applyScale(idx: number) {
    setScaleIdx(idx);
    document.documentElement.style.fontSize = `${16 * SCALES[idx]}px`;
  }

  return (
    <div
      className="flex items-center justify-between px-4"
      style={{ height: '30px', background: '#0E4F4A', color: 'rgba(255,255,255,0.75)', fontFamily: 'Poppins, sans-serif', fontSize: '11px' }}
    >
      <span>Email: helpdesk-ucc[at]ukgovernment-demo[dot]in</span>
      <div className="flex items-center gap-1">
        <span className="mr-1 opacity-60">Accessibility:</span>
        {SCALES.map((_, i) => (
          <button
            key={i}
            onClick={() => applyScale(i)}
            className="px-1.5 py-0.5 transition-colors"
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontSize: `${10 + i}px`,
              fontWeight: scaleIdx === i ? 700 : 400,
              color: scaleIdx === i ? '#fff' : 'rgba(255,255,255,0.65)',
              background: scaleIdx === i ? 'rgba(255,255,255,0.15)' : 'transparent',
              borderRadius: '2px',
            }}
          >
            {LABELS[i]}
          </button>
        ))}
      </div>
    </div>
  );
}
