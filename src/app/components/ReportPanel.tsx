import { GROUPS } from '../data/checks';
import { CheckResult, Verdict } from '../types';
import { VerdictHeader } from './VerdictHeader';
import { SummaryBar } from './SummaryBar';
import { CheckGroup } from './CheckGroup';
import { ReportFooter } from './ReportFooter';
import { CheckRowSkeleton } from './CheckRow';

type Phase = 'idle' | 'fileSelected' | 'analyzing' | 'results';

interface ReportPanelProps {
  phase: Phase;
  fileName: string;
  results: CheckResult[] | null;
  verdict: Verdict | null;
  onReset: () => void;
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[400px] flex-col items-start justify-start p-6 lg:p-8">
      {/* Ghost ledger rows to hint at structure */}
      <div className="mb-8 w-full opacity-20">
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi} className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2.5 w-28 rounded-sm bg-rule animate-none" />
              <div className="flex-1 border-b border-rule/50" />
              <div className="h-2.5 w-8 rounded-sm bg-rule animate-none" />
            </div>
            {Array.from({ length: gi === 0 ? 5 : gi === 1 ? 2 : 4 }).map((_, ri) => (
              <div key={ri} className="flex items-baseline gap-1 border-b border-rule/30 py-2">
                <div className="w-5" />
                <div className="h-2.5 rounded-sm bg-rule/60" style={{ width: `${100 + ri * 30}px` }} />
                <div className="flex-1" />
                <div className="h-2.5 w-14 rounded-sm bg-rule/40" />
                <div className="h-4 w-10 ml-2 rounded-sm bg-rule/40" />
              </div>
            ))}
          </div>
        ))}
      </div>

      <p
        className="text-ink"
        style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '14px', fontWeight: 500 }}
      >
        No document loaded.
      </p>
      <p
        className="mt-1 text-muted"
        style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px' }}
      >
        Add a file to begin verification.
      </p>
    </div>
  );
}

function AnalyzingSkeleton() {
  return (
    <div className="flex flex-col">
      {/* Header skeleton */}
      <div className="border-b border-rule p-6 lg:p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-[68px] w-[260px] animate-pulse rounded-sm bg-rule/40" />
          <div className="h-3 w-48 animate-pulse rounded-sm bg-rule/30" />
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-[3px] w-full bg-rule/40 overflow-hidden">
        <div
          className="absolute h-full"
          style={{
            background: '#D2541B',
            width: '40%',
            animation: 'indeterminate 1.8s ease-in-out infinite',
          }}
        />
      </div>

      {/* Skeleton groups */}
      <div className="p-6 lg:p-8 flex flex-col gap-6">
        {[5, 2, 7, 2].map((rowCount, gi) => (
          <div key={gi}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2.5 w-24 animate-pulse rounded-sm bg-rule/50" />
              <div className="flex-1 border-b border-rule/40" />
              <div className="h-2.5 w-6 animate-pulse rounded-sm bg-rule/40" />
            </div>
            {Array.from({ length: rowCount }).map((_, ri) => (
              <CheckRowSkeleton key={ri} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReportPanel({ phase, fileName, results, verdict, onReset }: ReportPanelProps) {
  if (phase === 'idle' || phase === 'fileSelected') return <EmptyState />;
  if (phase === 'analyzing') return <AnalyzingSkeleton />;
  if (!results || !verdict) return <EmptyState />;

  let rowOffset = 0;
  const groupOffsets = GROUPS.map(g => {
    const off = rowOffset;
    rowOffset += g.ids.length;
    return off;
  });

  return (
    <div className="flex flex-col">
      <VerdictHeader fileName={fileName} verdict={verdict} />
      <SummaryBar verdict={verdict} />

      <div className="flex flex-col gap-6 p-6 lg:p-8">
        {GROUPS.map((group, gi) => (
          <CheckGroup
            key={group.id}
            group={group}
            results={results}
            globalIndex={groupOffsets[gi]}
          />
        ))}
      </div>

      <ReportFooter fileName={fileName} results={results} verdict={verdict} onReset={onReset} />
    </div>
  );
}
