import { motion } from 'motion/react';
import { Verdict } from '../types';

interface SummaryBarProps {
  verdict: Verdict;
}

export function SummaryBar({ verdict }: SummaryBarProps) {
  const total   = verdict.passed + verdict.warned + verdict.failed;
  const passPct = total > 0 ? (verdict.passed  / total) * 100 : 0;
  const warnPct = total > 0 ? (verdict.warned  / total) * 100 : 0;
  const failPct = total > 0 ? (verdict.failed  / total) * 100 : 0;

  return (
    <div className="flex h-[3px] w-full overflow-hidden bg-rule/50">
      {passPct > 0 && (
        <motion.div className="h-full" style={{ background: '#1F6B4F' }}
          initial={{ width: 0 }} animate={{ width: `${passPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }} />
      )}
      {warnPct > 0 && (
        <motion.div className="h-full" style={{ background: '#9A6212' }}
          initial={{ width: 0 }} animate={{ width: `${warnPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.1 }} />
      )}
      {failPct > 0 && (
        <motion.div className="h-full" style={{ background: '#A52714' }}
          initial={{ width: 0 }} animate={{ width: `${failPct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }} />
      )}
    </div>
  );
}
