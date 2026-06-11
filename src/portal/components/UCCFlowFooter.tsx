import { ChevronLeft, ChevronRight, Save } from 'lucide-react';

interface UCCFlowFooterProps {
  step: number;
  totalSteps: number;
  canNext: boolean;
  onNext: () => void;
  onPrev: () => void;
  onSave?: () => void;
  nextLabel?: string;
}

export function UCCFlowFooter({ step, totalSteps, canNext, onNext, onPrev, onSave, nextLabel }: UCCFlowFooterProps) {
  const isLast = step === totalSteps;
  const label = nextLabel ?? (isLast ? 'Submit' : 'Next');

  return (
    <div
      className="flex items-center justify-between border-t px-6 py-3"
      style={{ borderColor: '#E3E0D8', background: '#fff', fontFamily: 'Poppins, sans-serif' }}
    >
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
        style={{ color: '#6B7280', border: '1px solid #E3E0D8', borderRadius: '6px', background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#F3F1EC')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <Save className="h-3.5 w-3.5" />
        Save
      </button>

      <div className="flex items-center gap-2">
        <button
          onClick={onPrev}
          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors"
          style={{ color: '#6B7280', border: '1px solid #E3E0D8', borderRadius: '6px', background: 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F3F1EC')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {step === 1 ? 'Back' : 'Previous'}
        </button>

        <button
          onClick={onNext}
          disabled={!canNext}
          className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white transition-colors"
          style={{
            borderRadius: '6px',
            background: canNext ? '#15706B' : '#D1D5DB',
            color: canNext ? '#fff' : '#9CA3AF',
            cursor: canNext ? 'pointer' : 'not-allowed',
            border: 'none',
          }}
          onMouseEnter={e => { if (canNext) e.currentTarget.style.background = '#0E4F4A'; }}
          onMouseLeave={e => { if (canNext) e.currentTarget.style.background = '#15706B'; }}
        >
          {label}
          {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
