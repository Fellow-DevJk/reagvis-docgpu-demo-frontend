import { CheckResult } from '../types';
import { CHECK_DEFS, GroupMeta } from '../data/checks';
import { CheckRowFull } from './CheckRow';

interface CheckGroupProps {
  group: GroupMeta;
  results: CheckResult[];
  globalIndex: number;
}

export function CheckGroup({ group, results, globalIndex }: CheckGroupProps) {
  const groupResults = group.ids
    .map(id => results.find(r => r.id === id))
    .filter(Boolean) as CheckResult[];

  const passed = groupResults.filter(r => r.status === 'pass').length;
  const total  = groupResults.length;

  return (
    <div>
      {/* Section header: label ─────── n/m */}
      <div className="flex items-center gap-2 py-2">
        <span
          className="shrink-0 text-ink"
          style={{
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '.12em',
          }}
        >
          {group.label}
        </span>
        <span className="flex-1 border-b border-rule" aria-hidden />
        <span
          className="shrink-0 text-ink"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px' }}
        >
          {passed}/{total}
        </span>
      </div>

      {/* Check rows */}
      <div>
        {groupResults.map((result, i) => {
          const def = CHECK_DEFS.find(d => d.id === result.id)!;
          return (
            <CheckRowFull
              key={result.id}
              result={result}
              name={def.name}
              kind={def.kind}
              index={globalIndex + i}
            />
          );
        })}
      </div>
    </div>
  );
}
