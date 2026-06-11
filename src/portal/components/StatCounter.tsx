import { useEffect, useRef, useState } from 'react';

interface StatCounterProps {
  value: number;
  label: string;
}

export function StatCounter({ value, label }: StatCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggered = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !triggered.current) {
          triggered.current = true;
          const duration = 1400;
          const start = performance.now();
          const animate = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 3);
            setCount(Math.round(eased * value));
            if (p < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-1 px-6 py-4">
      <span
        className="tabular-nums"
        style={{ fontFamily: 'Poppins, sans-serif', fontSize: '32px', fontWeight: 700, color: '#15706B', lineHeight: 1.1 }}
      >
        {count.toLocaleString('en-IN')}
      </span>
      <span
        className="text-center"
        style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#4B5563', maxWidth: '120px', lineHeight: 1.4 }}
      >
        {label}
      </span>
    </div>
  );
}
