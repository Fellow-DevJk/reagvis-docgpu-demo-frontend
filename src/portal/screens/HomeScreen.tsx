import { useNavigate } from 'react-router';
import { UCCUtilityBar } from '../components/UCCUtilityBar';
import { UCCHeader } from '../components/UCCHeader';

function CivicIllustration() {
  return (
    <svg viewBox="0 0 320 240" aria-hidden className="h-full w-full" style={{ display: 'block' }}>
      {/* Sky */}
      <defs>
        <linearGradient id="sky_g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#C5E8E4" />
          <stop offset="100%" stopColor="#E8F5F3" />
        </linearGradient>
      </defs>
      <rect width="320" height="240" fill="url(#sky_g)" />
      {/* Mountains */}
      <polygon points="0,145 70,42 140,145" fill="#1B6E6A" opacity="0.45" />
      <polygon points="100,145 195,52 285,145" fill="#15706B" opacity="0.55" />
      <polygon points="220,145 280,80 320,145" fill="#0E4F4A" opacity="0.4" />
      {/* Public building */}
      <rect x="85" y="145" width="150" height="95" fill="#fff" opacity="0.15" />
      <rect x="85" y="115" width="150" height="30" fill="#0E4F4A" />
      {/* Columns */}
      {[100, 120, 140, 160, 180, 200, 218].map((x, i) => (
        <rect key={i} x={x} y="88" width="7" height="57" fill="#1B6E6A" />
      ))}
      {/* Pediment */}
      <polygon points="78,88 242,88 160,55" fill="#15706B" />
      {/* Dome */}
      <ellipse cx="160" cy="55" rx="22" ry="14" fill="#0E4F4A" />
      <ellipse cx="160" cy="44" rx="8" ry="12" fill="#15706B" />
      {/* Ground strip */}
      <rect x="0" y="200" width="320" height="40" fill="#15706B" opacity="0.28" />
      {/* Trees */}
      <rect x="42" y="165" width="5" height="35" fill="#0E4F4A" />
      <circle cx="44.5" cy="160" r="13" fill="#1B6E6A" opacity="0.75" />
      <rect x="270" y="165" width="5" height="35" fill="#0E4F4A" />
      <circle cx="272.5" cy="160" r="13" fill="#1B6E6A" opacity="0.75" />
      {/* DEMO watermark */}
      <text
        x="160" y="140" textAnchor="middle" fontSize="38" fill="#A52714"
        opacity="0.06" transform="rotate(-25, 160, 140)"
        fontFamily="sans-serif" fontWeight="900" letterSpacing="4"
      >DEMO</text>
    </svg>
  );
}

export function HomeScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: '#F3F1EC', fontFamily: 'Poppins, sans-serif' }}>
      <UCCUtilityBar />
      <UCCHeader variant="public" />

      {/* Hero */}
      <section className="mx-auto flex max-w-screen-xl flex-col items-center gap-8 px-4 py-12 lg:flex-row lg:items-stretch lg:gap-12 lg:px-6 lg:py-16">
        {/* Left — civic illustration */}
        <div
          className="relative w-full overflow-hidden lg:w-[44%]"
          style={{ borderRadius: '10px', background: '#C5E8E4', minHeight: '280px', maxHeight: '340px' }}
        >
          <CivicIllustration />
          {/* Orange name band */}
          <div
            className="absolute bottom-0 left-0 right-0 flex items-center justify-center py-2"
            style={{ background: 'rgba(228,123,28,0.92)' }}
          >
            <span style={{ fontFamily: 'Mukta, sans-serif', fontSize: '13px', fontWeight: 600, color: '#fff', letterSpacing: '0.04em' }}>
              उत्तराखण्ड सरकार · Government of Uttarakhand
            </span>
          </div>
        </div>

        {/* Right — content */}
        <div className="flex flex-1 flex-col justify-center gap-5">
          <div>
            <p
              className="mb-2 uppercase tracking-widest"
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', fontWeight: 600, color: '#E47B1C' }}
            >
              Introducing UCC Services
            </p>
            <h1
              style={{ fontFamily: 'Poppins, sans-serif', fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 700, color: '#1B6E6A', lineHeight: 1.25 }}
            >
              Uniform Civil Code<br />Registration & Verification
            </h1>
          </div>
          <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '14px', color: '#374151', lineHeight: 1.7, maxWidth: '480px' }}>
            Register and verify civil status documents — marriages, domicile certificates, wills,
            and more — under the Uttarakhand Uniform Civil Code Act, 2024. Secure, paperless, and
            accessible statewide.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/login')}
              className="px-7 py-3 font-semibold text-white transition-colors"
              style={{ background: '#15706B', border: 'none', borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0E4F4A')}
              onMouseLeave={e => (e.currentTarget.style.background = '#15706B')}
            >
              Apply Now →
            </button>
            <button
              onClick={() => navigate('/login')}
              className="px-6 py-3 font-medium transition-colors"
              style={{ background: 'transparent', border: '1.5px solid #15706B', borderRadius: '8px', color: '#15706B', fontSize: '14px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#E8F5F3')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              Verify Document
            </button>
          </div>
          <p style={{ fontSize: '11px', color: '#9CA3AF', fontStyle: 'italic' }}>
            Demo environment — no real data is captured or transmitted.
          </p>
        </div>
      </section>

      {/* Services grid */}
      <section className="mx-auto max-w-screen-xl px-4 py-12 lg:px-6">
        <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '20px', fontWeight: 700, color: '#1F2937', marginBottom: '20px' }}>
          Available Services
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { title: 'Registration of Marriage',       emoji: '💍', desc: 'Register your marriage under UCC Act, 2024.' },
            { title: 'Domicile Certificate',           emoji: '🏠', desc: 'Obtain proof of Uttarakhand domicile.' },
            { title: 'Birth Certificate',              emoji: '⭐', desc: 'Register and verify birth records.' },
            { title: 'Registration of Will',           emoji: '📜', desc: 'Register a legal will or codicil.' },
          ].map(svc => (
            <button
              key={svc.title}
              onClick={() => navigate('/login')}
              className="flex flex-col items-start gap-2 border p-5 text-left transition-all hover:-translate-y-0.5"
              style={{ borderColor: '#E3E0D8', background: '#fff', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#15706B'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(21,112,107,.12)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E3E0D8'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.06)'; }}
            >
              <span style={{ fontSize: '28px' }}>{svc.emoji}</span>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '14px', fontWeight: 600, color: '#1F2937' }}>{svc.title}</p>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: '#6B7280', lineHeight: 1.5 }}>{svc.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Spacer for demo banner */}
      <div style={{ height: '40px' }} />
    </div>
  );
}
