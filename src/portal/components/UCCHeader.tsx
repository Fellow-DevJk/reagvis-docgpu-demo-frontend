import { Link, useNavigate } from 'react-router';

interface UCCHeaderProps {
  variant?: 'public' | 'app';
}

function UCCEmblem({ size = 52 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 52 52" aria-label="Placeholder emblem (demo)">
      <circle cx="26" cy="26" r="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
      <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="0.6" />
      {/* Stylised mountain silhouette — NOT the Ashoka Lions */}
      <path d="M 6 38 L 14 22 L 20 30 L 26 18 L 32 28 L 38 20 L 46 38 Z" fill="rgba(255,255,255,0.88)" />
      {/* Snow highlights */}
      <path d="M 26 18 L 29.5 25 L 22.5 25 Z" fill="white" />
      <path d="M 38 20 L 41 26 L 35 26 Z" fill="white" />
      <path d="M 14 22 L 17 28 L 11 28 Z" fill="white" />
      {/* Sun */}
      <circle cx="26" cy="13" r="4" fill="rgba(228,123,28,0.85)" />
      {/* Caption */}
      <text x="26" y="48" textAnchor="middle" fontSize="5.5" fill="rgba(255,255,255,0.75)" fontFamily="sans-serif" fontWeight="600" letterSpacing="0.04em">उ.ना. 2024</text>
    </svg>
  );
}

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '#' },
  { label: 'Services', to: '#' },
  { label: 'Download Acts', to: '#' },
  { label: 'FAQs', to: '#' },
  { label: 'Fees', to: '#' },
];

export function UCCHeader({ variant = 'public' }: UCCHeaderProps) {
  const navigate = useNavigate();

  return (
    <header style={{ background: '#15706B' }}>
      <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-4 px-4 py-3 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <UCCEmblem size={52} />
          <div className="flex flex-col">
            <span
              style={{ fontFamily: 'Mukta, sans-serif', fontSize: '18px', fontWeight: 700, color: '#fff', lineHeight: 1.2 }}
            >
              समान नागरिक संहिता
            </span>
            <span
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.8)', letterSpacing: '0.03em' }}
            >
              Uniform Civil Code · Uttarakhand, 2024
            </span>
            <span
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: '9px', color: 'rgba(255,255,255,0.5)', marginTop: '1px' }}
            >
              [DEMO — placeholder emblem, not the real portal]
            </span>
          </div>
        </div>

        {/* Nav */}
        {variant === 'public' && (
          <nav className="hidden lg:flex items-center gap-5">
            {NAV_LINKS.map(link => (
              link.to === '#' ? (
                <a
                  key={link.label}
                  href="#"
                  onClick={e => e.preventDefault()}
                  style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}
                  className="hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.label}
                  to={link.to}
                  style={{ fontFamily: 'Poppins, sans-serif', fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.85)', textDecoration: 'none' }}
                  className="hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            ))}
            <button
              onClick={() => navigate('/login')}
              className="px-5 py-1.5 font-semibold transition-colors"
              style={{
                fontFamily: 'Poppins, sans-serif', fontSize: '13px', fontWeight: 600,
                background: '#fff', color: '#15706B', border: '1.5px solid #fff', borderRadius: '6px',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#E8F5EE'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
            >
              Login
            </button>
          </nav>
        )}

        {/* App variant: condensed right side */}
        {variant === 'app' && (
          <div className="flex items-center gap-4">
            <span style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.75)' }}>
              Welcome, <strong className="text-white">Demo User</strong>
            </span>
            <Link
              to="/"
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}
              className="hover:text-white transition-colors"
            >
              ← Home
            </Link>
          </div>
        )}

        {/* Mobile login button (public) */}
        {variant === 'public' && (
          <button
            onClick={() => navigate('/login')}
            className="flex lg:hidden px-4 py-1.5 font-semibold"
            style={{
              fontFamily: 'Poppins, sans-serif', fontSize: '13px', background: '#fff',
              color: '#15706B', border: '1.5px solid #fff', borderRadius: '6px',
            }}
          >
            Login
          </button>
        )}
      </div>
    </header>
  );
}
