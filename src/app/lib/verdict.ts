import { CheckResult, Verdict } from '../types';
import { CHECK_DEFS } from '../data/checks';

export function computeVerdict(
  results: CheckResult[],
  forceVerdict: 'auto' | 'accepted' | 'rejected' = 'auto',
): Verdict {
  const passed = results.filter(r => r.status === 'pass').length;
  const warned  = results.filter(r => r.status === 'warn').length;
  const failed  = results.filter(r => r.status === 'fail').length;

  let decision: 'accepted' | 'rejected';
  let summary: string;

  if (forceVerdict === 'accepted') {
    decision = 'accepted';
    summary  = 'Manually accepted';
  } else if (forceVerdict === 'rejected') {
    decision = 'rejected';
    summary  = 'Manually rejected';
  } else {
    const integrityFail = results.some(r => {
      const def = CHECK_DEFS.find(d => d.id === r.id);
      return def?.group === 'integrity' && r.status === 'fail';
    });

    const screenshotFail = results.find(r => r.id === 'screenshot')?.status === 'fail';

    if (integrityFail) {
      decision = 'rejected';
      summary  = 'Failed integrity gate';
    } else if (screenshotFail) {
      decision = 'rejected';
      summary  = 'Authenticity check failed';
    } else {
      const qaFails = results.filter(r => {
        const def = CHECK_DEFS.find(d => d.id === r.id);
        return (def?.group === 'quality' || def?.group === 'authenticity') && r.status === 'fail';
      }).length;

      if (qaFails >= 2) {
        decision = 'rejected';
        summary  = 'Recapture recommended';
      } else {
        decision = 'accepted';
        summary  = 'Document looks good';
      }
    }
  }

  const confidence = Math.min(99, Math.max(5, 100 - warned * 4 - failed * 12));

  return { decision, confidence, passed, warned, failed, summary };
}
