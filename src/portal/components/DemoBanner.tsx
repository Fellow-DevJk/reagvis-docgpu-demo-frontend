import { useState } from 'react';
import { X } from 'lucide-react';

export function DemoBanner() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-between gap-4 px-4 py-2"
      style={{ background: '#7C3A0A', color: '#FEF3C7', fontFamily: 'Poppins, sans-serif', fontSize: '11px' }}
      role="banner"
    >
      <p className="flex-1 text-center leading-snug">
        <strong>DEMO</strong> — Built for internal demonstration only.
        Not affiliated with or endorsed by the Government of Uttarakhand or the UCC portal.
        No data is transmitted or stored.
      </p>
      <button
        onClick={() => setVisible(false)}
        className="shrink-0 p-1 opacity-75 hover:opacity-100 transition-opacity"
        aria-label="Dismiss demo banner"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
