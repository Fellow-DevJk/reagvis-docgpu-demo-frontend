import { motion } from 'motion/react';
import { CheckResult, Status, CheckKind } from '../types';

// Small definite status glyph in a 20px column
function StatusMark({ status }: { status: Status }) {
  const mono: React.CSSProperties = { fontFamily: 'IBM Plex Mono, monospace', fontSize: '13px', fontWeight: 500, lineHeight: 1 };
  if (status === 'pass') return <span style={{ ...mono, color: '#1F6B4F' }}>✓</span>;
  if (status === 'fail') return <span style={{ ...mono, color: '#A52714' }}>✗</span>;
  return <span style={{ ...mono, color: '#9A6212' }}>!</span>;
}

// Squared mono badge
function StatusBadge({ status }: { status: Status }) {
  const mono: React.CSSProperties = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '.05em',
    padding: '2px 5px',
    borderRadius: '2px',
    border: '1px solid',
    lineHeight: 1.4,
  };
  if (status === 'pass') return <span style={{ ...mono, borderColor: '#1F6B4F', color: '#1F6B4F' }}>PASS</span>;
  if (status === 'fail') return <span style={{ ...mono, borderColor: '#A52714', color: '#A52714' }}>FAIL</span>;
  return <span style={{ ...mono, borderColor: '#9A6212', color: '#9A6212' }}>WARN</span>;
}

interface CheckRowFullProps {
  result: CheckResult;
  name: string;
  kind: CheckKind;
  index: number;
}

export function CheckRowFull({ result, name, kind, index }: CheckRowFullProps) {
  const { status, metric, barPct, reason } = result;
  const showBar = kind === 'score' && barPct !== undefined;
  const barColor = status === 'pass' ? '#1F6B4F' : status === 'warn' ? '#9A6212' : '#A52714';

  return (
    <motion.div
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: index * 0.024, ease: 'easeOut' }}
    >
      {/* Main row */}
      <div className="flex items-baseline gap-1 border-b border-rule py-2.5 last:border-0">
        {/* Status glyph — fixed 20px column */}
        <span className="w-5 shrink-0 text-center">
          <StatusMark status={status} />
        </span>

        {/* Check name */}
        <span
          className="shrink-0 text-ink"
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px', fontWeight: 500 }}
        >
          {name}
        </span>

        {/* Dotted leader */}
        <span className="relative mx-1 min-w-[16px] flex-1" aria-hidden>
          <span
            className="absolute inset-x-0"
            style={{ bottom: '3px', borderBottom: '1px dotted #D8D1C4' }}
          />
        </span>

        {/* Metric — mono, right-aligned */}
        <span
          className="shrink-0 tabular-nums text-ink"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}
        >
          {metric ?? '—'}
        </span>

        {/* Badge */}
        <span className="ml-2 shrink-0">
          <StatusBadge status={status} />
        </span>
      </div>

      {/* Score bar (thin under-bar, only when useful) */}
      {showBar && (
        <div className="mx-5 mb-1 h-[2px] bg-rule/50">
          <motion.div
            className="h-full"
            style={{ background: barColor }}
            initial={{ width: 0 }}
            animate={{ width: `${barPct}%` }}
            transition={{ duration: 0.45, delay: index * 0.024 + 0.15, ease: 'easeOut' }}
          />
        </div>
      )}

      {/* Reason — secondary muted line */}
      {(status === 'fail' || status === 'warn') && reason && (
        <p
          className="mx-5 mb-1 text-muted"
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '12px' }}
        >
          — {reason}
        </p>
      )}
    </motion.div>
  );
}

// Skeleton row for analyzing state
export function CheckRowSkeleton() {
  return (
    <div className="flex items-baseline gap-1 border-b border-rule py-2.5 last:border-0">
      <span className="w-5 shrink-0" />
      <span className="h-3 w-36 animate-pulse rounded-sm bg-rule/60" />
      <span className="flex-1" />
      <span className="h-3 w-16 animate-pulse rounded-sm bg-rule/40" />
      <span className="ml-2 h-4 w-10 animate-pulse rounded-sm bg-rule/40" />
    </div>
  );
}
