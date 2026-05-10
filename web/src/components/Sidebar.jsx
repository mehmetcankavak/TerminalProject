import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLang } from '../context/LangContext'

import LogoTT from './LogoTT'

// Inline SVG icon helper — 16×16, stroke-based
const I = (d) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const ICONS = {
  'dashboard':           I(<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>),
  'terminal':            I(<><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></>),
  'portfolio':           I(<><path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12a2 2 0 000 4h4v-4h-4z"/></>),
  'smart-money':         I(<><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 100 4h4a2 2 0 110 4H8"/><line x1="12" y1="6" x2="12" y2="18"/></>),
  'spot-markets':        I(<><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></>),
  'stocks':              I(<><line x1="4" y1="20" x2="20" y2="20"/><line x1="7" y1="16" x2="7" y2="10"/><line x1="12" y1="16" x2="12" y2="6"/><line x1="17" y1="16" x2="17" y2="12"/></>),
  'global-metrics':      I(<><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></>),
  'long-short-ratio':    I(<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>),
  'funding-rate':        I(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>),
  'liquidations-stream': I(<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>),
  'system-alerts':       I(<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></>),
  'custom-alerts':       I(<><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/><line x1="1" y1="1" x2="23" y2="23"/></>),
  'volume-monitor':      I(<><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3"/></>),
  'alert-monitoring':    I(<><path d="M22 17H2a3 3 0 000 6h20a3 3 0 000-6z"/><path d="M7 17V5a5 5 0 0110 0v12"/><circle cx="12" cy="3" r="1"/></>),
  'token-unlock':        I(<><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>),
  'big-transfers':       I(<><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></>),
  'economic-calendar':   I(<><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>),
  'etf':                 I(<><polyline points="3 3 21 3 21 21 3 21 3 3"/><rect x="6" y="10" width="3" height="7"/><rect x="11" y="6" width="3" height="11"/><rect x="16" y="14" width="3" height="3"/></>),
}

const MENU_ITEMS = [
    { id: 'dashboard',           label: 'Dashboard',           dot: '#3b82f6' },
    { id: 'terminal',            label: 'Terminal',            dot: '#00d992', highlight: true, pro: true },
    { id: 'portfolio',           label: 'Portfolio',           dot: '#10b981', pro: true },
    { id: 'smart-money',         label: 'Smart Money',         dot: '#f59e0b', pro: true },
    null,
    { id: 'spot-markets',        label: 'Markets',             dot: '#10b981' },
    { id: 'stocks',              label: 'Stocks',              dot: '#5b8def' },
    { id: 'etf',                 label: 'ETF Data',            dot: '#f59e0b', pro: true },
    { id: 'global-metrics',      label: 'Global Metrics',      dot: '#8b5cf6' },
    { id: 'long-short-ratio',    label: 'Long Short Ratio',    dot: '#f59e0b', pro: true },
    { id: 'funding-rate',        label: 'Funding Rate',        dot: '#06b6d4', pro: true },
    { id: 'liquidations-stream', label: 'Liquidations Stream', dot: '#ef4444', pro: true },
    null,
    { id: 'system-alerts',       label: 'System Alerts',       dot: '#ec4899' },
    { id: 'alert-monitoring',    label: 'Alert Monitoring',    dot: '#ec4899' },
    { id: 'custom-alerts',       label: 'Custom Alerts',       dot: '#8b5cf6', pro: true },
    { id: 'volume-monitor',      label: 'Volume Monitor',      dot: '#3b82f6', pro: true },
    { id: 'token-unlock',        label: 'Token Unlock',        dot: '#f59e0b', pro: true },
    { id: 'big-transfers',       label: 'Big Transfers',       dot: '#10b981', pro: true },
    { id: 'economic-calendar',   label: 'Economic Calendar',   dot: '#06b6d4' },
]

function CmdKModal({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const allItems = MENU_ITEMS.filter(Boolean)

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = query.trim()
    ? allItems.filter(it => it.label.toLowerCase().includes(query.toLowerCase()))
    : allItems

  const handleKey = (e) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && filtered.length > 0) {
      onSelect(filtered[0].id)
      onClose()
    }
  }

  return (
    <div className="cmdk-overlay" onClick={onClose}>
      <div className="cmdk-modal" onClick={e => e.stopPropagation()}>
        <div className="cmdk-input-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search pages..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <kbd className="cmdk-kbd">ESC</kbd>
        </div>
        <div className="cmdk-list">
          {filtered.map(item => (
            <button
              key={item.id}
              className="cmdk-item"
              onClick={() => { onSelect(item.id); onClose() }}
            >
              <span className="cmdk-item-icon">{ICONS[item.id]}</span>
              <span>{item.label}</span>
              {item.pro && <span className="sidebar-lock" style={{ marginLeft: 'auto' }}>PRO</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="cmdk-empty">No results found</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Sidebar({ activePage, onPageChange }) {
  const { plan, logout, isAdmin } = useAuth()
  const { t } = useLang()
  const [menuOpen, setMenuOpen] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [showCmdK, setShowCmdK] = useState(false)

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

    const isPro = plan === 'pro'
    const billingCtaLabel = isPro ? 'Extend Plan' : (t('upgrade_to_pro') || 'Upgrade to Pro')

    if (!isSidebarOpen) {
        return (
            <div className="sidebar" style={{ width: '40px', flexShrink: 0, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                <button 
                    onClick={() => setIsSidebarOpen(true)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-0)', cursor: 'pointer', padding: '16px 0px', width: '100%', display: 'flex', justifyContent: 'center', borderBottom: '1px solid var(--border-0)' }} 
                    title="Open Menu"
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-0)'}
                >
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                         <polyline points="13 17 18 12 13 7"></polyline>
                         <line x1="6" y1="17" x2="11" y2="12"></line>
                         <line x1="6" y1="7" x2="11" y2="12"></line>
                     </svg>
                </button>
                <div style={{ writingMode: 'vertical-rl', color: 'var(--text-3)', fontSize: 10, letterSpacing: 2, marginTop: 16, opacity: 0.6 }}>
                    DASHBOARD MENU
                </div>
            </div>
        )
    }

    return (
        <div className="sidebar" style={{ transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}>
            {/* Logo */}
            <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LogoTT width={28} height={28} />
                    <span>Trading Terminal</span>
                </div>
                <button 
                    onClick={() => setIsSidebarOpen(false)} 
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center' }} 
                    title="Collapse Menu"
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-0)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-3)'}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="11 17 6 12 11 7"></polyline>
                        <polyline points="18 17 13 12 18 7"></polyline>
                    </svg>
                </button>
            </div>

            {/* Search shortcut */}
            <button className="sidebar-search-btn" onClick={() => setShowCmdK(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span>Search</span>
              <kbd className="sidebar-kbd">⌘K</kbd>
            </button>

            {showCmdK && <CmdKModal onSelect={onPageChange} onClose={() => setShowCmdK(false)} />}

            {/* Plan badge */}
            <div className="sidebar-plan">
                <span className={`sidebar-plan-badge ${isPro ? 'pro' : 'free'}`}>
                    {isPro ? 'PRO' : 'FREE'}
                </span>
                <button
                    className="sidebar-upgrade-btn"
                    onClick={() => onPageChange('upgrade')}
                >
                    {billingCtaLabel}
                </button>
            </div>

            {/* Navigation */}
            <div className="sidebar-nav">
                <div
                    className="sidebar-section-title"
                    onClick={() => setMenuOpen(!menuOpen)}
                >
                    <span>{t('tools_menu')}</span>
                    <span className={`chevron ${menuOpen ? 'open' : ''}`}>›</span>
                </div>

                {menuOpen && MENU_ITEMS.map((item, i) => {
                    if (!item) {
                        return <div key={`sep-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />
                    }
                    const locked = item.pro && !isPro
                    return (
                        <div
                            key={item.id}
                            className={`sidebar-item ${activePage === item.id ? 'active' : ''} ${locked ? 'sidebar-item-locked' : ''}`}
                            onClick={() => onPageChange(item.id)}
                        >
                            <span className="sidebar-item-icon" style={{ color: activePage === item.id ? item.dot : undefined }}>
                                {ICONS[item.id]}
                            </span>
                            {item.label}
                            {locked && <span className="sidebar-lock">PRO</span>}
                        </div>
                    )
                })}
            </div>

            {/* Footer */}
            <div className="sidebar-footer">
                {isAdmin && (
                    <div
                        className={`sidebar-item ${activePage === 'admin' ? 'active' : ''}`}
                        onClick={() => onPageChange('admin')}
                        style={{ marginBottom: 4, color: '#00d992' }}
                    >
                        <span className="sidebar-item-icon" style={{ color: '#00d992' }}>
                          {I(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></>)}
                        </span>
                        Admin Panel
                    </div>
                )}
                <div
                    className={`sidebar-item ${activePage === 'account-settings' ? 'active' : ''}`}
                    onClick={() => onPageChange('account-settings')}
                    style={{ marginBottom: 4 }}
                >
                    <span className="sidebar-item-icon">
                      {I(<><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></>)}
                    </span>
                    Account Settings
                </div>
                <button className="sidebar-logout-btn" onClick={logout}>{t('logout')}</button>
            </div>
        </div>
    )
}
