import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Home, FileText, Grid3x3, Award, MessageCircle, Settings, ChevronLeft, ChevronRight } from 'lucide-react';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  to: string;
  badge?: number;
}

const NAV: NavItem[] = [
  { label: 'Home',            icon: <Home className="h-4 w-4" />,          to: '/' },
  { label: 'Drafts',          icon: <FileText className="h-4 w-4" />,       to: '#', badge: 1 },
  { label: 'Services',        icon: <Grid3x3 className="h-4 w-4" />,        to: '/flow' },
  { label: 'Certificates',    icon: <Award className="h-4 w-4" />,          to: '#' },
  { label: 'Clarifications',  icon: <MessageCircle className="h-4 w-4" />,  to: '#', badge: 0 },
  { label: 'Settings',        icon: <Settings className="h-4 w-4" />,       to: '#' },
];

export function UCCSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const w = collapsed ? '56px' : '220px';

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 border-r sticky top-0 h-screen overflow-y-auto"
      style={{ width: w, transition: 'width 0.18s ease', borderColor: '#E3E0D8', background: '#fff' }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(v => !v)}
        className="flex items-center justify-end p-3 border-b"
        style={{ borderColor: '#E3E0D8', color: '#6B7280' }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </button>

      {/* Nav items */}
      <nav className="flex-1 py-2">
        {NAV.map(item => {
          const active = item.to !== '#' && location.pathname === item.to;
          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={item.to === '#' ? e => e.preventDefault() : undefined}
              className="flex items-center gap-3 px-3 py-2.5 transition-colors"
              style={{
                fontFamily: 'Poppins, sans-serif',
                fontSize: '13px',
                fontWeight: active ? 600 : 400,
                color: active ? '#15706B' : '#374151',
                background: active ? '#E8F5F3' : 'transparent',
                borderLeft: active ? '3px solid #15706B' : '3px solid transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
              }}
              title={collapsed ? item.label : undefined}
            >
              <span className={active ? 'text-ucc-header' : ''} style={{ color: active ? '#15706B' : '#6B7280', flexShrink: 0 }}>
                {item.icon}
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-center"
                      style={{
                        fontFamily: 'Poppins, sans-serif', fontSize: '10px', fontWeight: 600,
                        minWidth: '18px', background: item.badge > 0 ? '#E47B1C' : '#E5E7EB',
                        color: item.badge > 0 ? '#fff' : '#6B7280',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom block */}
      {!collapsed && (
        <div className="border-t p-3" style={{ borderColor: '#E3E0D8' }}>
          <div className="mb-2 flex items-center gap-1">
            {['A−', 'A', 'A+'].map(l => (
              <button
                key={l}
                className="px-1.5 py-0.5"
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', color: '#6B7280', border: '1px solid #E3E0D8', borderRadius: '3px' }}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: '#15706B', fontFamily: 'Poppins, sans-serif', fontSize: '11px', fontWeight: 700 }}
            >
              D
            </div>
            <div>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '11px', fontWeight: 600, color: '#1F2937' }}>Demo User</p>
              <p style={{ fontFamily: 'Poppins, sans-serif', fontSize: '10px', color: '#9CA3AF' }}>UCC-260610-00121</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
