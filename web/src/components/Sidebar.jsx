import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'
import LogoTT from './LogoTT'

const I = (d) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

const ICONS = {
  'dashboard':           I(<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>),
  'terminal':            I(<><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>),
  'portfolio':           I(<><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></>),
  'smart-money':         I(<><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></>),
  'spot-markets':        I(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>),
  'stocks':              I(<><line x1="4" y1="20" x2="20" y2="20"/><line x1="7" y1="16" x2="7" y2="10"/><line x1="12" y1="16" x2="12" y2="6"/><line x1="17" y1="16" x2="17" y2="12"/></>),
  'global-metrics':      I(<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>),
  'long-short-ratio':    I(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>),
  'market-compass':      I(<><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></>),
  'funding-rate':        I(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>),
  'liquidations-stream': I(<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>),
  'system-alerts':       I(<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>),
  'custom-alerts':       I(<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></>),
  'volume-monitor':      I(<><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></>),
  'alert-monitoring':    I(<><path d="M22 17H2a3 3 0 000 6h20a3 3 0 000-6z"/><path d="M7 17V5a5 5 0 0110 0v12"/></>),
  'token-unlock':        I(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>),
  'big-transfers':       I(<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>),
  'economic-calendar':   I(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  'etf':                 I(<><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="12" x2="8" y2="18"/><line x1="12" y1="8" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="18"/></>),
  'account-settings':    I(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
  'admin':               I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>),
}

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { id: 'dashboard',   label: 'Dashboard'   },
      { id: 'terminal',    label: 'Terminal',    pro: true, highlight: true },
      { id: 'portfolio',   label: 'Portfolio',   pro: true },
      { id: 'smart-money', label: 'Smart Money', pro: true },
    ],
  },
  {
    label: 'Markets',
    items: [
      { id: 'spot-markets',   label: 'Spot Markets'  },
      { id: 'stocks',         label: 'Stocks'        },
      { id: 'etf',            label: 'ETF Data',     pro: true },
      { id: 'global-metrics', label: 'Global Metrics'},
    ],
  },
  {
    label: 'Analytics',
    items: [
      { id: 'market-compass',      label: 'Market Compass',  pro: true },
      { id: 'long-short-ratio',    label: 'Long / Short',    pro: true },
      { id: 'funding-rate',        label: 'Funding Rate',    pro: true },
      { id: 'liquidations-stream', label: 'Liquidations',    pro: true },
    ],
  },
  {
    label: 'Alerts & Flows',
    items: [
      { id: 'system-alerts',     label: 'System Alerts'  },
      { id: 'alert-monitoring',  label: 'Alert Monitor'  },
      { id: 'custom-alerts',     label: 'Custom Alerts', pro: true },
      { id: 'big-transfers',     label: 'Big Transfers', pro: true },
      { id: 'volume-monitor',    label: 'Volume Monitor',pro: true },
      { id: 'token-unlock',      label: 'Token Unlock',  pro: true },
      { id: 'economic-calendar', label: 'Econ. Calendar'},
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

/* ── Cmd+K modal ──────────────────────────────────────────────────────────── */
function CmdKModal({ onSelect, onClose }) {
  const [query, setQuery]     = useState('')
  const [cursor, setCursor]   = useState(0)
  const inputRef              = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = query.trim()
    ? ALL_ITEMS.filter(it => it.label.toLowerCase().includes(query.toLowerCase()))
    : ALL_ITEMS

  useEffect(() => { setCursor(0) }, [query])

  const handleKey = (e) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); return }
    if (e.key === 'Enter' && filtered[cursor]) { onSelect(filtered[cursor].id); onClose() }
  }

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Go to page…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <kbd className="cmdk-kbd">ESC</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`cmdk-item ${i === cursor ? 'cmdk-item-active' : ''}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => { onSelect(item.id); onClose() }}
            >
              <span className="cmdk-item-icon">{ICONS[item.id]}</span>
              <span>{item.label}</span>
              {item.pro && <span className="cmdk-pro-tag">PRO</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="cmdk-empty">No pages found</div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Nav item ─────────────────────────────────────────────────────────────── */
function NavItem({ item, active, locked, onClick }) {
  return (
    <button
      className={`sb-item ${active ? 'sb-item-active' : ''} ${locked ? 'sb-item-locked' : ''}`}
      onClick={() => onClick(item.id)}
    >
      <span className="sb-item-icon">{ICONS[item.id]}</span>
      <span className="sb-item-label">{item.label}</span>
      {locked && <span className="sb-pro-tag">PRO</span>}
      {item.highlight && !locked && <span className="sb-live-dot" />}
    </button>
  )
}

/* ── Collapsed sidebar (icon-rail) ────────────────────────────────────────── */
function CollapsedRail({ activePage, onPageChange, onExpand }) {
  return (
    <div className="sb-collapsed">
      <button className="sb-collapsed-logo" onClick={onExpand} title="Expand sidebar">
        <LogoTT width={22} height={22} />
      </button>
      <div className="sb-collapsed-nav">
        {ALL_ITEMS.map(item => (
          <button
            key={item.id}
            title={item.label}
            className={`sb-collapsed-item ${activePage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
          >
            {ICONS[item.id]}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ── Main sidebar ─────────────────────────────────────────────────────────── */
export default function Sidebar({ activePage, onPageChange }) {
  const { plan, logout, isAdmin } = useAuth()
  const { t }                     = useLang()
  const [collapsed,   setCollapsed]   = useState(false)
  const [showCmdK,    setShowCmdK]    = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCmdK(prev => !prev)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const isPro           = plan === 'pro'
  const billingCtaLabel = isPro ? 'Manage Plan' : 'Upgrade to Pro'

  if (collapsed) {
    return <CollapsedRail activePage={activePage} onPageChange={onPageChange} onExpand={() => setCollapsed(false)} />
  }

  return (
    <nav className="sb-sidebar">
      {/* ── Logo ── */}
      <div className="sb-logo">
        <div className="sb-logo-mark">
          <LogoTT width={20} height={20} />
        </div>
        <div className="sb-logo-text">
          <span className="sb-logo-name">TT Terminal</span>
          <span className="sb-logo-sub">Trading Platform</span>
        </div>
        <button className="sb-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse sidebar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
          </svg>
        </button>
      </div>

      {/* ── Search ── */}
      <div className="sb-search-wrap">
        <button className="sb-search" onClick={() => setShowCmdK(true)}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span>Search pages…</span>
          <kbd className="sb-kbd">⌘K</kbd>
        </button>
      </div>

      {showCmdK && <CmdKModal onSelect={onPageChange} onClose={() => setShowCmdK(false)} />}

      {/* ── Nav ── */}
      <div className="sb-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.label} className="sb-group">
            <div className="sb-group-label">{group.label}</div>
            {group.items.map(item => (
              <NavItem
                key={item.id}
                item={item}
                active={activePage === item.id}
                locked={item.pro && !isPro}
                onClick={onPageChange}
              />
            ))}
          </div>
        ))}

        {/* Admin (only when isAdmin) */}
        {isAdmin && (
          <div className="sb-group">
            <div className="sb-group-label">Admin</div>
            <NavItem
              item={{ id: 'admin', label: 'Admin Panel' }}
              active={activePage === 'admin'}
              locked={false}
              onClick={onPageChange}
            />
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="sb-footer">
        {/* Plan row */}
        <div className="sb-plan-row">
          <span className={`sb-plan-badge ${isPro ? 'pro' : 'free'}`}>
            {isPro ? '✦ PRO' : 'FREE'}
          </span>
          <button className="sb-upgrade-btn" onClick={() => onPageChange('upgrade')}>
            {billingCtaLabel}
          </button>
        </div>

        {/* Account + Logout */}
        <div className="sb-footer-actions">
          <button
            className={`sb-footer-item ${activePage === 'account-settings' ? 'active' : ''}`}
            onClick={() => onPageChange('account-settings')}
          >
            <span className="sb-item-icon">{ICONS['account-settings']}</span>
            <span>Account</span>
          </button>
          <button className="sb-footer-logout" onClick={logout} title="Log out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </nav>
  )
}
