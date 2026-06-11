export function Header() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-rule bg-paper px-6 lg:px-8">
      {/* Brand */}
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2">
          {/* Orange brand mark — accent only */}
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
            <rect width="8" height="18" rx="1" fill="#D2541B" />
            <rect x="10" width="8" height="12" rx="1" fill="#D2541B" />
          </svg>
          <span
            className="text-[15px] font-semibold tracking-[-0.01em] text-ink"
            style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}
          >
            Reagvis <span className="text-orange">Verify</span>
          </span>
        </div>

        <nav
          className="hidden items-center gap-6 md:flex"
          style={{ fontFamily: 'IBM Plex Sans, sans-serif', fontSize: '13px', color: '#6E655A' }}
        >
          <a href="#" className="hover:text-ink transition-colors">Demo</a>
          <a href="#" className="hover:text-ink transition-colors">Documentation</a>
          <a href="#" className="hover:text-ink transition-colors">API</a>
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span
          className="hidden items-center border border-rule px-2.5 py-1 sm:flex"
          style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '11px', color: '#6E655A' }}
        >
          DocGPU v1
        </span>
        <div className="h-7 w-7 rounded-full bg-paper-sunk border border-rule overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=56&q=80"
            alt="User"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </header>
  );
}
