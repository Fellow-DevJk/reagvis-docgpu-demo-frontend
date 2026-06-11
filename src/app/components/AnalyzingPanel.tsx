import { Loader2 } from 'lucide-react';

export function AnalyzingPanel() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[20px] border border-rv-border/50 bg-white shadow-[0_12px_40px_rgba(120,72,30,0.10)]">
      {/* Header */}
      <div className="border-b border-rv-border/50 bg-rv-cream/30 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-rv-orange" />
          <div>
            <h2 className="font-sora text-[18px] font-semibold text-rv-heading">Analyzing document…</h2>
            <p className="mt-0.5 font-manrope text-[13px] text-rv-muted">Running 16 integrity and quality checks</p>
          </div>
        </div>

        {/* Indeterminate progress bar */}
        <div className="relative mt-6 h-1.5 w-full overflow-hidden rounded-full bg-rv-cream-dark">
          <div
            className="absolute h-full rounded-full"
            style={{
              background: 'linear-gradient(90deg, #FB923C, #EA580C)',
              animation: 'indeterminate 1.8s ease-in-out infinite',
              width: '40%',
            }}
          />
        </div>
      </div>

      {/* Skeleton rows */}
      <div className="flex flex-col gap-8 p-6 md:p-8">
        {(['FILE INTEGRITY', 'READABILITY', 'CAPTURE QUALITY', 'CONTENT & AUTHENTICITY'] as const).map(
          (label, gi) => (
            <div key={gi} className="flex flex-col gap-0">
              <div className="mb-3 flex items-center gap-3">
                <div className="h-3.5 w-28 animate-pulse rounded bg-rv-border/40" />
                <div className="h-5 w-8 animate-pulse rounded-full bg-rv-border/30" />
              </div>
              {Array.from({ length: gi === 0 ? 5 : gi === 1 ? 2 : gi === 2 ? 7 : 2 }).map((_, ri) => (
                <div key={ri} className="flex items-center gap-3 border-b border-rv-border/40 py-4 last:border-0">
                  <div className="h-7 w-7 animate-pulse rounded-full bg-rv-border/30" />
                  <div className="flex flex-1 flex-col gap-2">
                    <div
                      className="animate-pulse rounded bg-rv-border/40"
                      style={{ height: '14px', width: `${45 + (ri * 7 % 35)}%` }}
                    />
                    <div
                      className="animate-pulse rounded bg-rv-border/30"
                      style={{ height: '11px', width: `${25 + (ri * 11 % 25)}%` }}
                    />
                  </div>
                  <div className="h-6 w-12 animate-pulse rounded-full bg-rv-border/30" />
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <style>{`
        @keyframes indeterminate {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      `}</style>
    </div>
  );
}
