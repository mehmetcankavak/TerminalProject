import { useState, useEffect, useRef } from 'react'
import {
  LayoutDashboard, Monitor, Briefcase, Users, BarChart3, LineChart, PieChart, Globe,
  Compass, ArrowUpDown, Percent, Flame, Bell, BellRing, BellPlus, ArrowLeftRight,
  BarChart2, Lock, Calendar, Settings, Crown, Search, ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const ICONS = {
  'dashboard':           LayoutDashboard,
  'terminal':            Monitor,
  'portfolio':           Briefcase,
  'smart-money':         Users,
  'spot-markets':        BarChart3,
  'stocks':              LineChart,
  'etf':                 PieChart,
  'global-metrics':      Globe,
  'market-compass':      Compass,
  'long-short-ratio':    ArrowUpDown,
  'funding-rate':        Percent,
  'liquidations-stream': Flame,
  'system-alerts':       Bell,
  'alert-monitoring':    BellRing,
  'custom-alerts':       BellPlus,
  'big-transfers':       ArrowLeftRight,
  'volume-monitor':      BarChart2,
  'token-unlock':        Lock,
  'economic-calendar':   Calendar,
  'account-settings':    Settings,
  'upgrade':             Crown,
  'admin':               ShieldCheck,
}

const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { id: 'dashboard',   label: 'Dashboard'   },
      { id: 'terminal',    label: 'Terminal',    pro: true },
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

/* ── ⌘K palette ─────────────────────────────────────────────────────────── */
function CmdKModal({ onSelect, onClose }) {
  const [query, setQuery]   = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef            = useRef(null)

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
          <Search size={14} />
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
          {filtered.map((item, i) => {
            const Icon = ICONS[item.id]
            return (
              <button
                key={item.id}
                className={`cmdk-item ${i === cursor ? 'cmdk-item-active' : ''}`}
                onMouseEnter={() => setCursor(i)}
                onClick={() => { onSelect(item.id); onClose() }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.pro && <span className="cmdk-pro-tag">PRO</span>}
              </button>
            )
          })}
          {filtered.length === 0 && <div className="cmdk-empty">No pages found</div>}
        </div>
      </div>
    </div>
  )
}

function NavItem({ item, active, locked, onClick, className = '' }) {
  const Icon = ICONS[item.id]
  return (
    <button
      className={`ws-sb-item ${active ? 'active' : ''} ${className}`}
      onClick={() => onClick(item.id)}
    >
      <Icon size={17} strokeWidth={1.8} />
      <span className="ws-sb-item-label">{item.label}</span>
      {locked && <span className="ws-sb-pro">PRO</span>}
    </button>
  )
}

export default function Sidebar({ activePage, onPageChange }) {
  const { plan, isAdmin } = useAuth()
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

  return (
    <nav className="sb-sidebar">
      <div className="ws-sb-logo">
        <div className="ws-sb-logo-text">
          <div className="ws-sb-logo-row">
            <span className="ws-sb-logo-tt">TT</span>
            <span className="ws-sb-logo-name">Terminal</span>
          </div>
          <span className="ws-sb-logo-sub">Trading Platform</span>
        </div>
      </div>

      {showCmdK && <CmdKModal onSelect={onPageChange} onClose={() => setShowCmdK(false)} />}

      <div className="ws-sb-nav">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div className="ws-sb-group-label">{group.label}</div>
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
        {isAdmin && (
          <div>
            <div className="ws-sb-group-label">Admin</div>
            <NavItem item={{ id: 'admin', label: 'Admin Panel' }} active={activePage === 'admin'} onClick={onPageChange} />
          </div>
        )}
      </div>

      <div className="ws-sb-foot">
        <NavItem
          item={{ id: 'account-settings', label: 'Account Settings' }}
          active={activePage === 'account-settings'}
          onClick={onPageChange}
        />
        <NavItem
          item={{ id: 'upgrade', label: isPro ? 'Manage Plan' : 'Upgrade to Pro' }}
          active={activePage === 'upgrade'}
          onClick={onPageChange}
          className="ws-sb-upgrade"
        />
      </div>
    </nav>
  )
}
