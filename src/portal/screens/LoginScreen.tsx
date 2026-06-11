import { useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { UCCUtilityBar } from '../components/UCCUtilityBar';
import { UCCHeader } from '../components/UCCHeader';

export function LoginScreen() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: '#F3F1EC', fontFamily: 'Poppins, sans-serif' }}>
      <UCCUtilityBar />
      <UCCHeader variant="public" />

      <div className="flex min-h-[calc(100vh-140px)] items-center justify-center px-4 py-10">
        <div
          className="w-full max-w-sm"
          style={{ background: '#fff', borderRadius: '10px', boxShadow: '0 4px 24px rgba(0,0,0,.10)', overflow: 'hidden' }}
        >
          {/* Teal header */}
          <div className="px-6 py-5" style={{ background: '#15706B' }}>
            <h2 style={{ fontFamily: 'Poppins, sans-serif', fontSize: '18px', fontWeight: 700, color: '#fff' }}>
              Sign In to UCC Portal
            </h2>
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px', color: 'rgba(255,255,255,0.75)', marginTop: '2px' }}>
              Uttarakhand Uniform Civil Code — Demo Environment
            </p>
          </div>

          {/* Demo notice */}
          <div
            className="flex items-start gap-2 px-5 py-3"
            style={{ background: '#FEF3C7', borderBottom: '1px solid #FDE68A' }}
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" style={{ color: '#D97706' }} />
            <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', color: '#92400E', lineHeight: 1.5 }}>
              <strong>Demo login</strong> — no credentials are collected or transmitted.
            </p>
          </div>

          <div className="p-6">
            <button
              onClick={() => navigate('/flow')}
              className="w-full py-3 font-semibold text-white transition-colors"
              style={{ background: '#15706B', border: 'none', borderRadius: '6px', fontSize: '15px', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#0E4F4A')}
              onMouseLeave={e => (e.currentTarget.style.background = '#15706B')}
            >
              Login →
            </button>
          </div>
        </div>
      </div>

      <div style={{ height: '40px' }} />
    </div>
  );
}
