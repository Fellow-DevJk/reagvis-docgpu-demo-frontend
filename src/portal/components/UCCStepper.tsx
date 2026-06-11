import { Check } from 'lucide-react';

export interface StepDef {
  label: string;
  subtitle: string;
}

interface UCCStepperProps {
  steps: StepDef[];
  current: number; // 1-based
}

export function UCCStepper({ steps, current }: UCCStepperProps) {
  return (
    <div className="flex items-start gap-0">
      {steps.map((step, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;

        return (
          <div key={n} className="flex flex-1 items-center">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors"
                style={{
                  borderColor: done || active ? '#15706B' : '#D1D5DB',
                  background: done ? '#15706B' : active ? '#fff' : '#fff',
                }}
              >
                {done ? (
                  <Check className="h-4 w-4 text-white" strokeWidth={2.5} />
                ) : (
                  <span
                    style={{
                      fontFamily: 'Poppins, sans-serif',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: active ? '#15706B' : '#9CA3AF',
                    }}
                  >
                    {n}
                  </span>
                )}
              </div>
              <div className="text-center" style={{ maxWidth: '90px' }}>
                <p
                  style={{
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 500,
                    color: active ? '#15706B' : done ? '#1F2937' : '#9CA3AF',
                    lineHeight: 1.3,
                  }}
                >
                  {step.label}
                </p>
                <p
                  className="hidden sm:block"
                  style={{ fontFamily: 'Poppins, sans-serif', fontSize: '10px', color: '#9CA3AF', lineHeight: 1.3, marginTop: '1px' }}
                >
                  {step.subtitle}
                </p>
              </div>
            </div>

            {/* Connector line (not after last step) */}
            {i < steps.length - 1 && (
              <div
                className="flex-1 mx-2 mt-[-20px]"
                style={{ height: '2px', background: n < current ? '#15706B' : '#E5E7EB', flexShrink: 1 }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
